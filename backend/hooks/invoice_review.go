package hooks

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"
)

const (
	purchasingNotificationsCollection = "notifications"
	salesNotificationsCollection      = "notifications_02"
)

var (
	errUnsupportedInvoiceResubmission = errors.New("unsupported invoice resubmission collection")
	errInvoiceResubmissionNotFound    = errors.New("invoice resubmission record not found")
	errInvoiceNotRejected             = errors.New("invoice is not rejected")
)

type invoiceResubmissionResult struct {
	Collection string `json:"collection"`
	RecordID   string `json:"recordId"`
	Status     string `json:"status"`
	Changed    bool   `json:"changed"`
}

func isInvoiceReviewCollection(collectionName string) bool {
	return collectionName == "sale_invoices" || collectionName == "purchase_invoices"
}

func RegisterInvoiceResubmissionRoutes(app core.App) {
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			e.Router.POST("/api/erp/invoice-resubmissions", func(request *core.RequestEvent) error {
				body := struct {
					Collection string `json:"collection"`
					RecordID   string `json:"recordId"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("重新提交参数不正确", err)
				}

				operatorID, operatorName, operatorRole := auditOperator(request.Auth)
				result, err := resubmitInvoice(request.App, body.Collection, body.RecordID, operatorID, operatorName, operatorRole)
				if err != nil {
					switch {
					case errors.Is(err, errUnsupportedInvoiceResubmission):
						return router.NewBadRequestError("重新提交参数不正确", err)
					case errors.Is(err, errInvoiceResubmissionNotFound):
						return router.NewNotFoundError("发票不存在或已进入回收站", err)
					case errors.Is(err, errInvoiceNotRejected):
						return router.NewApiError(http.StatusConflict, "该发票不是待返工状态，请刷新后查看", err)
					default:
						return router.NewBadRequestError("重新提交失败", err)
					}
				}
				return request.JSON(http.StatusOK, result)
			}).Bind(apis.RequireAuth())

			return e.Next()
		},
	})
}

func createInvoiceRejectionNotification(app core.App, collectionName string, invoice *core.Record, reason string) error {
	config, ok := auditConfigForCollection(collectionName)
	if !ok || !isInvoiceReviewCollection(collectionName) {
		return errUnsupportedInvoiceResubmission
	}

	contractNo := ""
	productName := invoice.GetString("product_name")
	if contractID := invoice.GetString(config.parentField); contractID != "" {
		if contract, err := app.FindRecordById(config.parentTable, contractID); err == nil {
			contractNo = contract.GetString("no")
			if productName == "" {
				productName = contract.GetString("product_name")
			}
		}
	}

	recipient := invoice.GetString("creator_user")
	notificationCollection := purchasingNotificationsCollection
	invoiceLabel := "采购发票"
	roleFallback := "purchasing"
	if collectionName == "sale_invoices" {
		notificationCollection = salesNotificationsCollection
		invoiceLabel = "销售发票"
		roleFallback = "sales"
	}
	if recipient == "" {
		recipient = roleFallback
	}

	invoiceNo := invoice.GetString("no")
	title := fmt.Sprintf("%s %s - %s被驳回", contractNo, productName, invoiceLabel)
	message := fmt.Sprintf("经理驳回了您的%s（合同号：%s，发票号：%s）。原因：%s。请修改资料或附件后重新提交审核。", invoiceLabel, contractNo, invoiceNo, reason)

	collection, err := app.FindCollectionByNameOrId(notificationCollection)
	if err != nil {
		return err
	}
	notification := core.NewRecord(collection)
	notification.Set("type", "manager_rejected")
	notification.Set("title", strings.TrimSpace(title))
	notification.Set("message", message)
	notification.Set("is_read", false)
	notification.Set("recipient", recipient)
	notification.Set("record_collection", collectionName)
	notification.Set("record_id", invoice.Id)
	notification.Set("rejection_reason", reason)
	return app.Save(notification)
}

func resubmitInvoice(
	app core.App,
	collectionName string,
	recordID string,
	operatorID string,
	operatorName string,
	operatorRole string,
) (*invoiceResubmissionResult, error) {
	collectionName = strings.TrimSpace(collectionName)
	recordID = strings.TrimSpace(recordID)
	if !isInvoiceReviewCollection(collectionName) {
		return nil, errUnsupportedInvoiceResubmission
	}
	config, ok := auditConfigForCollection(collectionName)
	if !ok {
		return nil, errUnsupportedInvoiceResubmission
	}

	result := &invoiceResubmissionResult{Collection: collectionName, RecordID: recordID, Status: "pending"}
	var failedRecord *core.Record
	previousStatus := ""
	err := app.RunInTransaction(func(txApp core.App) error {
		record, findErr := txApp.FindRecordById(collectionName, recordID)
		if findErr != nil || record.GetString("deleted_at") != "" {
			return errInvoiceResubmissionNotFound
		}
		failedRecord = record
		previousStatus = record.GetString("manager_confirmed")
		if previousStatus == "pending" && record.GetString("rejection_reason") != "" {
			return saveInvoiceResubmissionLog(txApp, config, record, previousStatus, "success", "", operatorID, operatorName, operatorRole, true)
		}
		if previousStatus != "rejected" {
			return fmt.Errorf("%w: current status %q", errInvoiceNotRejected, previousStatus)
		}

		record.Set("manager_confirmed", "pending")
		record.Set("is_verified", "no")
		if saveErr := txApp.Save(record); saveErr != nil {
			return saveErr
		}
		result.Changed = true
		return saveInvoiceResubmissionLog(txApp, config, record, previousStatus, "success", "", operatorID, operatorName, operatorRole, false)
	})
	if err == nil {
		return result, nil
	}

	if failedRecord != nil {
		if persisted, findErr := app.FindRecordById(collectionName, recordID); findErr == nil {
			failedRecord = persisted
		}
		if logErr := saveInvoiceResubmissionLog(app, config, failedRecord, previousStatus, "failed", err.Error(), operatorID, operatorName, operatorRole, false); logErr != nil {
			log.Printf("[InvoiceResubmission] failed to log %s/%s error: %v", collectionName, recordID, logErr)
		}
	}
	return nil, err
}

func saveInvoiceResubmissionLog(
	app core.App,
	config businessRecordAuditConfig,
	record *core.Record,
	previousStatus string,
	result string,
	errorMessage string,
	operatorID string,
	operatorName string,
	operatorRole string,
	idempotent bool,
) error {
	collection, err := app.FindCollectionByNameOrId("contract_operation_logs")
	if err != nil {
		return err
	}
	parentID := record.GetString(config.parentField)
	parentNo := ""
	if parentID != "" {
		if parent, findErr := app.FindRecordById(config.parentTable, parentID); findErr == nil {
			parentNo = parent.GetString("no")
		}
	}
	details, _ := json.Marshal(map[string]any{
		"previousStatus":  previousStatus,
		"rejectionReason": record.GetString("rejection_reason"),
		"idempotent":      idempotent,
	})
	snapshot, _ := recordSnapshotJSON(record)

	entry := core.NewRecord(collection)
	entry.Set("operation", "resubmit_record")
	entry.Set("contract_type", config.contractType)
	entry.Set("operator_id", operatorID)
	entry.Set("operator_name", operatorName)
	entry.Set("operator_role", operatorRole)
	entry.Set("source_contract_id", parentID)
	entry.Set("source_contract_no", parentNo)
	entry.Set("collection_name", config.collection)
	entry.Set("record_id", record.Id)
	entry.Set("record_snapshot", string(snapshot))
	entry.Set("details", string(details))
	entry.Set("result", result)
	entry.Set("error_message", errorMessage)
	return app.Save(entry)
}
