package hooks

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"
)

var (
	errInvalidInvoiceVerificationStatus = errors.New("invalid purchase invoice verification status")
	errPurchaseInvoiceNotFound          = errors.New("purchase invoice not found")
	errRejectedInvoiceVerification      = errors.New("rejected purchase invoice cannot be verified")
)

type purchaseInvoiceVerificationResult struct {
	RecordID         string `json:"recordId"`
	Status           string `json:"status"`
	ManagerConfirmed string `json:"managerConfirmed"`
	Changed          bool   `json:"changed"`
}

// RegisterPurchaseInvoiceVerificationRoutes keeps invoice verification as a
// separate lifecycle action from manager confirmation. An approved invoice can
// therefore remain unverified for weeks and be marked verified later without
// reopening or changing its original confirmation decision.
func RegisterPurchaseInvoiceVerificationRoutes(app core.App) {
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			e.Router.POST("/api/erp/purchase-invoice-verifications", func(request *core.RequestEvent) error {
				if !request.HasSuperuserAuth() && (request.Auth == nil || request.Auth.GetString("type") != "manager") {
					return router.NewForbiddenError("仅管理账号可以修改验票状态", nil)
				}

				body := struct {
					RecordID string `json:"recordId"`
					Status   string `json:"status"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("验票参数不正确", err)
				}

				operatorID, operatorName, operatorRole := auditOperator(request.Auth)
				result, err := updatePurchaseInvoiceVerification(
					request.App,
					body.RecordID,
					body.Status,
					operatorID,
					operatorName,
					operatorRole,
				)
				if err != nil {
					switch {
					case errors.Is(err, errInvalidInvoiceVerificationStatus):
						return router.NewBadRequestError("验票状态只能选择已验票或未验票", err)
					case errors.Is(err, errPurchaseInvoiceNotFound):
						return router.NewNotFoundError("采购发票不存在或已进入回收站", err)
					case errors.Is(err, errRejectedInvoiceVerification):
						return router.NewApiError(http.StatusConflict, "已驳回的采购发票不能标记为已验票，请先由采购重新提交", err)
					default:
						return router.NewBadRequestError("验票状态更新失败", err)
					}
				}
				return request.JSON(http.StatusOK, result)
			}).Bind(apis.RequireAuth())

			return e.Next()
		},
	})
}

func updatePurchaseInvoiceVerification(
	app core.App,
	recordID string,
	status string,
	operatorID string,
	operatorName string,
	operatorRole string,
) (*purchaseInvoiceVerificationResult, error) {
	recordID = strings.TrimSpace(recordID)
	status = strings.TrimSpace(status)
	if status != "yes" && status != "no" {
		return nil, errInvalidInvoiceVerificationStatus
	}

	result := &purchaseInvoiceVerificationResult{RecordID: recordID, Status: status}
	err := app.RunInTransaction(func(txApp core.App) error {
		record, err := txApp.FindRecordById("purchase_invoices", recordID)
		if err != nil || record.GetString("deleted_at") != "" {
			return errPurchaseInvoiceNotFound
		}

		managerConfirmed := record.GetString("manager_confirmed")
		result.ManagerConfirmed = managerConfirmed
		if managerConfirmed == "rejected" && status == "yes" {
			return errRejectedInvoiceVerification
		}

		previousStatus := record.GetString("is_verified")
		if previousStatus == status {
			return nil
		}

		record.Set("is_verified", status)
		if err := txApp.Save(record); err != nil {
			return err
		}
		if err := savePurchaseInvoiceVerificationLog(
			txApp,
			record,
			previousStatus,
			operatorID,
			operatorName,
			operatorRole,
		); err != nil {
			return err
		}
		result.Changed = true
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func savePurchaseInvoiceVerificationLog(
	app core.App,
	record *core.Record,
	previousStatus string,
	operatorID string,
	operatorName string,
	operatorRole string,
) error {
	collection, err := app.FindCollectionByNameOrId("contract_operation_logs")
	if err != nil {
		return err
	}

	parentID := record.GetString("purchase_contract")
	parentNo := ""
	if parentID != "" {
		if parent, findErr := app.FindRecordById("purchase_contracts", parentID); findErr == nil {
			parentNo = parent.GetString("no")
		}
	}
	details, _ := json.Marshal(map[string]any{
		"previousStatus":   previousStatus,
		"status":           record.GetString("is_verified"),
		"managerConfirmed": record.GetString("manager_confirmed"),
	})
	snapshot, _ := recordSnapshotJSON(record)

	entry := core.NewRecord(collection)
	entry.Set("operation", "verify_invoice")
	entry.Set("contract_type", "purchase")
	entry.Set("operator_id", operatorID)
	entry.Set("operator_name", operatorName)
	entry.Set("operator_role", operatorRole)
	entry.Set("source_contract_id", parentID)
	entry.Set("source_contract_no", parentNo)
	entry.Set("collection_name", "purchase_invoices")
	entry.Set("record_id", record.Id)
	entry.Set("details", string(details))
	entry.Set("record_snapshot", string(snapshot))
	entry.Set("result", "success")
	return app.Save(entry)
}
