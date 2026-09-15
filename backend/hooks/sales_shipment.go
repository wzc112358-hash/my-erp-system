package hooks

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterSalesShipmentHooks(app core.App) {
	app.OnRecordCreate("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SalesShipment] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SalesShipment] Failed to get contract %s: %v\n", contractId, err)
				return err
			}

			shipments, err := GetRecordsByField(app, "sales_shipments", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SalesShipment] Failed to get shipments: %v\n", err)
				return err
			}

			newQuantity := e.Record.GetFloat("quantity")
			totalQuantity := SumField(shipments, "quantity") + newQuantity
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if err := CheckOverage(totalQuantity, contractTotalQuantity, 1.0, "发货数量", "quantity"); err != nil {
				return err
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			rememberChildContractBeforeUpdate(e, "sales_contract")
			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SalesShipment] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SalesShipment] Failed to get contract %s: %v\n", contractId, err)
				return err
			}

			shipments, err := GetRecordsByField(app, "sales_shipments", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SalesShipment] Failed to get shipments: %v\n", err)
				return err
			}

			currentShipmentId := e.Record.Id
			newQuantity := e.Record.GetFloat("quantity")
			totalQuantity := SumChildFieldExcluding(shipments, "quantity", currentShipmentId, newQuantity)
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if err := CheckOverage(totalQuantity, contractTotalQuantity, 1.0, "发货数量", "quantity"); err != nil {
				return err
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return finishPostCommit(e, "SalesShipment.AfterCreate", func() error {
				return recalculateChildContractProgress(e.Context, e.App, "sales", "sales_contract", e.Record)
			})
		},
		Priority: 0,
	})

	app.OnRecordAfterUpdateSuccess("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return finishPostCommit(e, "SalesShipment.AfterUpdate", func() error {
				return recalculateChildContractProgress(e.Context, e.App, "sales", "sales_contract", e.Record)
			})
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if isContractCascadeDelete(e.Context) {
				return e.Next()
			}
			return finishPostCommit(e, "SalesShipment.AfterDelete", func() error {
				return recalculateChildContractProgress(e.Context, e.App, "sales", "sales_contract", e.Record)
			})
		},
		Priority: 0,
	})
}
