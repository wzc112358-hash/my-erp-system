package hooks

import (
	"encoding/json"
	"fmt"
	"log"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

type businessRecordAuditConfig struct {
	collection   string
	contractType string
	parentField  string
	parentTable  string
	label        string
}

var businessRecordAuditConfigs = []businessRecordAuditConfig{
	{collection: "sales_contracts", contractType: "sales", label: "销售合同"},
	{collection: "purchase_contracts", contractType: "purchase", label: "采购合同"},
	{collection: "sales_shipments", contractType: "sales", parentField: "sales_contract", parentTable: "sales_contracts", label: "销售发货"},
	{collection: "sale_receipts", contractType: "sales", parentField: "sales_contract", parentTable: "sales_contracts", label: "销售收款"},
	{collection: "sale_invoices", contractType: "sales", parentField: "sales_contract", parentTable: "sales_contracts", label: "销售发票"},
	{collection: "purchase_arrivals", contractType: "purchase", parentField: "purchase_contract", parentTable: "purchase_contracts", label: "采购到货"},
	{collection: "purchase_invoices", contractType: "purchase", parentField: "purchase_contract", parentTable: "purchase_contracts", label: "采购收票"},
	{collection: "purchase_payments", contractType: "purchase", parentField: "purchase_contract", parentTable: "purchase_contracts", label: "采购付款"},
}

func RegisterBusinessRecordAuditHooks(app core.App) {
	for _, config := range businessRecordAuditConfigs {
		bindBusinessRecordCreateAudit(app, config)
		bindBusinessRecordUpdateAudit(app, config)
		bindBusinessRecordDeleteAudit(app, config)
	}
}

func bindBusinessRecordCreateAudit(app core.App, config businessRecordAuditConfig) {
	app.OnRecordCreateRequest(config.collection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			operatorID, operatorName, operatorRole := auditOperator(e.Auth)
			if config.parentField == "" {
				if duplicateErr := validateNewContractNumber(e.App, config, e.Record.GetString("no")); duplicateErr != nil {
					snapshot, _ := recordSnapshotJSON(e.Record)
					if logErr := saveRecordOperationLog(e.App, config, e.Record, "create_failed", "failed", "", duplicateErr.Error(), operatorID, operatorName, operatorRole, string(snapshot)); logErr != nil {
						log.Printf("[BusinessAudit] failed to log duplicate %s: %v", config.collection, logErr)
					}
					return duplicateErr
				}
			}
			if err := e.Next(); err != nil {
				snapshot, _ := recordSnapshotJSON(e.Record)
				if logErr := saveRecordOperationLog(e.App, config, e.Record, "create_failed", "failed", "", err.Error(), operatorID, operatorName, operatorRole, string(snapshot)); logErr != nil {
					log.Printf("[BusinessAudit] failed to log create error for %s: %v", config.collection, logErr)
				}
				return err
			}
			snapshot, snapshotErr := recordSnapshotJSON(e.Record)
			if snapshotErr != nil {
				log.Printf("[BusinessAudit] failed to snapshot created %s/%s: %v", config.collection, e.Record.Id, snapshotErr)
				return nil
			}
			if logErr := saveRecordOperationLog(e.App, config, e.Record, "create_record", "success", "", "", operatorID, operatorName, operatorRole, string(snapshot)); logErr != nil {
				// The business record is already committed. Never turn a real success
				// into the misleading "Failed to create record" response.
				log.Printf("[BusinessAudit] failed to log created %s/%s: %v", config.collection, e.Record.Id, logErr)
			}
			return nil
		},
	})
}

func bindBusinessRecordUpdateAudit(app core.App, config businessRecordAuditConfig) {
	app.OnRecordUpdateRequest(config.collection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			operatorID, operatorName, operatorRole := auditOperator(e.Auth)
			if err := e.Next(); err != nil {
				snapshot, _ := recordSnapshotJSON(e.Record)
				if logErr := saveRecordOperationLog(e.App, config, e.Record, "update_failed", "failed", "", err.Error(), operatorID, operatorName, operatorRole, string(snapshot)); logErr != nil {
					log.Printf("[BusinessAudit] failed to log update error for %s: %v", config.collection, logErr)
				}
				return err
			}

			snapshot, snapshotErr := recordSnapshotJSON(e.Record)
			if snapshotErr != nil {
				log.Printf("[BusinessAudit] failed to snapshot updated %s/%s: %v", config.collection, e.Record.Id, snapshotErr)
				return nil
			}
			if logErr := saveRecordOperationLog(e.App, config, e.Record, "update_record", "success", "", "", operatorID, operatorName, operatorRole, string(snapshot)); logErr != nil {
				log.Printf("[BusinessAudit] failed to log updated %s/%s: %v", config.collection, e.Record.Id, logErr)
			}
			return nil
		},
	})
}

func validateNewContractNumber(app core.App, config businessRecordAuditConfig, contractNo string) error {
	normalized := normalizeContractIdentity(contractNo)
	if normalized == "" {
		return nil
	}
	records, err := app.FindRecordsByFilter(config.collection, "id != ''", "", 0, 0)
	if err != nil {
		return err
	}
	for _, record := range records {
		if normalizeContractIdentity(record.GetString("no")) == normalized {
			return validation.Errors{
				"no": validation.NewError(
					"duplicate_contract_no",
					fmt.Sprintf("%s号 %s 已存在，请打开原合同补充数据，不要重复创建", config.label, contractNo),
				),
			}
		}
	}
	return nil
}

func bindBusinessRecordDeleteAudit(app core.App, config businessRecordAuditConfig) {
	app.OnRecordDeleteRequest(config.collection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			return runRecordRequestTransaction(e, func(txApp core.App) error {
				snapshot, err := recordSnapshotJSON(e.Record)
				if err != nil {
					return err
				}
				operatorID, operatorName, operatorRole := auditOperator(e.Auth)
				if err := e.Next(); err != nil {
					return err
				}
				return saveRecordOperationLog(txApp, config, e.Record, "delete_record", "success", "", "", operatorID, operatorName, operatorRole, string(snapshot))
			})
		},
	})
}

func auditOperator(auth *core.Record) (id, name, role string) {
	if auth == nil {
		return "", "系统", "system"
	}
	name = auth.GetString("user_name")
	if name == "" {
		name = auth.GetString("name")
	}
	if name == "" {
		name = auth.GetString("email")
	}
	if name == "" {
		name = "未知用户"
	}
	return auth.Id, name, auth.GetString("type")
}

func recordSnapshotJSON(record *core.Record) ([]byte, error) {
	fields := record.FieldsData()
	fields["id"] = record.Id
	return json.Marshal(fields)
}

func auditConfigForCollection(collectionName string) (businessRecordAuditConfig, bool) {
	for _, config := range businessRecordAuditConfigs {
		if config.collection == collectionName {
			return config, true
		}
	}
	return businessRecordAuditConfig{}, false
}

func ownedBusinessRecordConfig(contractType, collectionName, relationField string) (businessRecordAuditConfig, bool) {
	for _, config := range businessRecordAuditConfigs {
		if config.parentField != "" && config.contractType == contractType && config.collection == collectionName && config.parentField == relationField {
			return config, true
		}
	}
	return businessRecordAuditConfig{}, false
}

func saveRecordOperationLog(
	app core.App,
	config businessRecordAuditConfig,
	record *core.Record,
	operation string,
	result string,
	batchID string,
	errorMessage string,
	operatorID string,
	operatorName string,
	operatorRole string,
	snapshot string,
) error {
	collection, err := app.FindCollectionByNameOrId("contract_operation_logs")
	if err != nil {
		return err
	}
	parentID := record.Id
	parentNo := record.GetString("no")
	if config.parentField != "" {
		parentID = record.GetString(config.parentField)
		parentNo = ""
		if parentID != "" {
			if parent, findErr := app.FindRecordById(config.parentTable, parentID); findErr == nil {
				parentNo = parent.GetString("no")
			}
		}
	}

	entry := core.NewRecord(collection)
	entry.Set("operation", operation)
	entry.Set("contract_type", config.contractType)
	entry.Set("operator_id", operatorID)
	entry.Set("operator_name", operatorName)
	entry.Set("operator_role", operatorRole)
	entry.Set("source_contract_id", parentID)
	entry.Set("source_contract_no", parentNo)
	entry.Set("collection_name", config.collection)
	entry.Set("record_id", record.Id)
	entry.Set("record_snapshot", snapshot)
	entry.Set("result", result)
	entry.Set("error_message", errorMessage)
	entry.Set("delete_batch_id", batchID)
	return app.Save(entry)
}

// Kept for the manager cascade-delete compatibility path and older tests.
func saveBusinessRecordDeleteLog(
	app core.App,
	config businessRecordAuditConfig,
	recordID string,
	parentID string,
	parentNo string,
	operatorID string,
	snapshot string,
) error {
	collection, err := app.FindCollectionByNameOrId("contract_operation_logs")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("operation", "delete_record")
	record.Set("contract_type", config.contractType)
	record.Set("operator_id", operatorID)
	record.Set("source_contract_id", parentID)
	record.Set("source_contract_no", parentNo)
	record.Set("collection_name", config.collection)
	record.Set("record_id", recordID)
	record.Set("record_snapshot", snapshot)
	record.Set("result", "success")
	return app.Save(record)
}
