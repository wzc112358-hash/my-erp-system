package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterSalesShipmentHooks(app *pocketbase.PocketBase) {
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
				return e.Next()
			}

			shipments, err := GetRecordsByField(app, "sales_shipments", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SalesShipment] Failed to get shipments: %v\n", err)
				shipments = []*core.Record{}
			}

			newQuantity := e.Record.GetFloat("quantity")
			totalQuantity := SumField(shipments, "quantity") + newQuantity
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if totalQuantity > contractTotalQuantity {
				return fmt.Errorf("发货数量总和(%.2f)不能超过合同总数量(%.2f)", totalQuantity, contractTotalQuantity)
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SalesShipment] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SalesShipment] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			shipments, err := GetRecordsByField(app, "sales_shipments", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SalesShipment] Failed to get shipments: %v\n", err)
				shipments = []*core.Record{}
			}

			currentShipmentId := e.Record.Id
			newQuantity := e.Record.GetFloat("quantity")
			totalQuantity := SumField(shipments, "quantity")
			for _, r := range shipments {
				if r.Id == currentShipmentId {
					totalQuantity = totalQuantity - r.GetFloat("quantity") + newQuantity
					break
				}
			}
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if totalQuantity > contractTotalQuantity {
				return fmt.Errorf("发货数量总和(%.2f)不能超过合同总数量(%.2f)", totalQuantity, contractTotalQuantity)
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return updateSalesContractExecution(app, e.Record.GetString("sales_contract"))
		},
		Priority: 0,
	})

	app.OnRecordAfterUpdateSuccess("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return updateSalesContractExecution(app, e.Record.GetString("sales_contract"))
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("sales_shipments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return updateSalesContractExecution(app, e.Record.GetString("sales_contract"))
		},
		Priority: 0,
	})
}

func updateSalesContractExecution(app *pocketbase.PocketBase, contractId string) error {
	contract, err := GetRecordById(app, "sales_contracts", contractId)
	if err != nil {
		return err
	}

	shipments, err := GetRecordsByField(app, "sales_shipments", "sales_contract", contractId)
	if err != nil {
		shipments = []*core.Record{}
	}

	totalQuantity := SumField(shipments, "quantity")

	totalContractQuantity := contract.GetFloat("total_quantity")

	if totalContractQuantity > 0 {
		executionPercent := (totalQuantity / totalContractQuantity) * 100
		contract.Set("executed_quantity", totalQuantity)
		contract.Set("execution_percent", executionPercent)
	}

	unitPrice := contract.GetFloat("unit_price")
	receiptedAmount := contract.GetFloat("receipted_amount")
	receivableAmount := totalQuantity * unitPrice

	var receiptPercent, debtAmount, debtPercent float64
	if receivableAmount > 0 {
		receiptPercent = (receiptedAmount / receivableAmount) * 100
		debtAmount = receivableAmount - receiptedAmount
		debtPercent = (receiptedAmount / receivableAmount) * 100
	} else {
		receiptPercent = 0
		debtAmount = 0
		debtPercent = 0
	}
	contract.Set("receipt_percent", receiptPercent)
	contract.Set("debt_amount", debtAmount)
	contract.Set("debt_percent", debtPercent)

	return updateSalesContractStatus(app, contract)
}

func updateSalesContractStatus(app *pocketbase.PocketBase, contract *core.Record) error {
	executionPercent := contract.GetFloat("execution_percent")
	receiptPercent := contract.GetFloat("receipt_percent")
	invoicePercent := contract.GetFloat("invoice_percent")
	currentStatus := contract.GetString("status")

	if executionPercent >= 100 && receiptPercent >= 100 && invoicePercent >= 100 && currentStatus != "cancelled" {
		contract.Set("status", "completed")
	} else if currentStatus == "completed" {
		contract.Set("status", "executing")
	}

	return SaveRecord(app, contract)
}
