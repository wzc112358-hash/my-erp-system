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

var (
	errUnsupportedConfirmationCollection = errors.New("unsupported confirmation collection")
	errInvalidConfirmationDecision       = errors.New("invalid confirmation decision")
	errConfirmationRecordNotFound        = errors.New("confirmation record not found")
	errConfirmationAlreadyResolved       = errors.New("confirmation already resolved")
)

var managerConfirmableCollections = map[string]struct{}{
	"sale_invoices":     {},
	"sale_receipts":     {},
	"purchase_arrivals": {},
	"purchase_invoices": {},
	"purchase_payments": {},
}

type managerConfirmationResult struct {
	Collection string `json:"collection"`
	RecordID   string `json:"recordId"`
	Status     string `json:"status"`
	Changed    bool   `json:"changed"`
}

func RegisterManagerConfirmationRoutes(app core.App) {
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			e.Router.POST("/api/erp/manager-confirmations", func(request *core.RequestEvent) error {
				body := struct {
					Collection string `json:"collection"`
					RecordID   string `json:"recordId"`
					Decision   string `json:"decision"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("确认参数不正确", err)
				}

				operatorID, operatorName, operatorRole := auditOperator(request.Auth)
				result, err := confirmBusinessRecord(
					request.App,
					body.Collection,
					body.RecordID,
					body.Decision,
					operatorID,
					operatorName,
					operatorRole,
				)
				if err != nil {
					switch {
					case errors.Is(err, errUnsupportedConfirmationCollection), errors.Is(err, errInvalidConfirmationDecision):
						return router.NewBadRequestError("确认参数不正确", err)
					case errors.Is(err, errConfirmationRecordNotFound):
						return router.NewNotFoundError("待确认记录不存在或已进入回收站", err)
					case errors.Is(err, errConfirmationAlreadyResolved):
						return router.NewApiError(http.StatusConflict, "该记录已处理，请刷新后查看最新状态", err)
					default:
						return router.NewBadRequestError("确认提交失败", err)
					}
				}
				return request.JSON(http.StatusOK, result)
			}).Bind(apis.RequireAuth())

			return e.Next()
		},
	})
}

func confirmBusinessRecord(
	app core.App,
	collectionName string,
	recordID string,
	decision string,
	operatorID string,
	operatorName string,
	operatorRole string,
) (*managerConfirmationResult, error) {
	collectionName = strings.TrimSpace(collectionName)
	recordID = strings.TrimSpace(recordID)
	decision = strings.TrimSpace(decision)

	if _, ok := managerConfirmableCollections[collectionName]; !ok {
		return nil, errUnsupportedConfirmationCollection
	}
	if decision != "approved" && decision != "rejected" {
		return nil, errInvalidConfirmationDecision
	}
	config, ok := auditConfigForCollection(collectionName)
	if !ok {
		return nil, errUnsupportedConfirmationCollection
	}

	result := &managerConfirmationResult{
		Collection: collectionName,
		RecordID:   recordID,
		Status:     decision,
	}
	var failedRecord *core.Record
	previousStatus := ""
	err := app.RunInTransaction(func(txApp core.App) error {
		record, findErr := txApp.FindRecordById(collectionName, recordID)
		if findErr != nil || record.GetString("deleted_at") != "" {
			return errConfirmationRecordNotFound
		}
		failedRecord = record
		currentStatus := record.GetString("manager_confirmed")
		previousStatus = currentStatus
		if currentStatus == decision {
			return saveManagerConfirmationLog(txApp, config, record, decision, currentStatus, "success", "", operatorID, operatorName, operatorRole, true)
		}
		if currentStatus != "pending" {
			return fmt.Errorf("%w: current status %q", errConfirmationAlreadyResolved, currentStatus)
		}

		record.Set("manager_confirmed", decision)
		if saveErr := txApp.Save(record); saveErr != nil {
			return saveErr
		}
		result.Changed = true
		return saveManagerConfirmationLog(txApp, config, record, decision, currentStatus, "success", "", operatorID, operatorName, operatorRole, false)
	})
	if err == nil {
		return result, nil
	}

	if failedRecord != nil {
		if persistedRecord, findErr := app.FindRecordById(collectionName, recordID); findErr == nil {
			failedRecord = persistedRecord
		}
		if logErr := saveManagerConfirmationLog(app, config, failedRecord, decision, previousStatus, "failed", err.Error(), operatorID, operatorName, operatorRole, false); logErr != nil {
			log.Printf("[ManagerConfirmation] failed to log %s/%s error: %v", collectionName, recordID, logErr)
		}
	}
	return nil, err
}

func saveManagerConfirmationLog(
	app core.App,
	config businessRecordAuditConfig,
	record *core.Record,
	decision string,
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
		"decision":       decision,
		"previousStatus": previousStatus,
		"idempotent":     idempotent,
	})
	snapshot, _ := recordSnapshotJSON(record)

	entry := core.NewRecord(collection)
	if decision == "approved" {
		entry.Set("operation", "confirm_record")
	} else {
		entry.Set("operation", "reject_record")
	}
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
