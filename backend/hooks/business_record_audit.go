package hooks

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

type businessRecordAuditConfig struct {
	collection   string
	contractType string
	parentField  string
	parentTable  string
}

var businessRecordAuditConfigs = []businessRecordAuditConfig{
	{collection: "sales_shipments", contractType: "sales", parentField: "sales_contract", parentTable: "sales_contracts"},
	{collection: "sale_receipts", contractType: "sales", parentField: "sales_contract", parentTable: "sales_contracts"},
	{collection: "sale_invoices", contractType: "sales", parentField: "sales_contract", parentTable: "sales_contracts"},
	{collection: "purchase_arrivals", contractType: "purchase", parentField: "purchase_contract", parentTable: "purchase_contracts"},
	{collection: "purchase_invoices", contractType: "purchase", parentField: "purchase_contract", parentTable: "purchase_contracts"},
	{collection: "purchase_payments", contractType: "purchase", parentField: "purchase_contract", parentTable: "purchase_contracts"},
}

func RegisterBusinessRecordAuditHooks(app core.App) {
	for _, config := range businessRecordAuditConfigs {
		bindBusinessRecordDeleteAudit(app, config)
	}
}

func bindBusinessRecordDeleteAudit(app core.App, config businessRecordAuditConfig) {
	app.OnRecordDeleteRequest(config.collection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			return runRecordRequestTransaction(e, func(txApp core.App) error {
				snapshot, err := recordSnapshotJSON(e.Record)
				if err != nil {
					return err
				}
				parentID := e.Record.GetString(config.parentField)
				parentNo := ""
				if parentID != "" {
					if parent, findErr := txApp.FindRecordById(config.parentTable, parentID); findErr == nil {
						parentNo = parent.GetString("no")
					}
				}
				operatorID := ""
				if e.Auth != nil {
					operatorID = e.Auth.Id
				}

				if err := e.Next(); err != nil {
					return err
				}
				return saveBusinessRecordDeleteLog(
					txApp,
					config,
					e.Record.Id,
					parentID,
					parentNo,
					operatorID,
					string(snapshot),
				)
			})
		},
	})
}

func recordSnapshotJSON(record *core.Record) ([]byte, error) {
	fields := record.FieldsData()
	fields["id"] = record.Id
	return json.Marshal(fields)
}

func ownedBusinessRecordConfig(contractType, collectionName, relationField string) (businessRecordAuditConfig, bool) {
	for _, config := range businessRecordAuditConfigs {
		if config.contractType == contractType && config.collection == collectionName && config.parentField == relationField {
			return config, true
		}
	}
	return businessRecordAuditConfig{}, false
}

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
	return app.Save(record)
}
