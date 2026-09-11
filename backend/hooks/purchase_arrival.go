package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterPurchaseArrivalHooks(app core.App) {
	app.OnRecordCreate("purchase_arrivals").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			e.Record.Set("manager_confirmed", "pending")

			wetherTransit := e.Record.GetString("wether_transit")
			if wetherTransit == "no" {
				e.Record.Set("freight_2", 0)
				e.Record.Set("transit_warehouse", "")
				e.Record.Set("freight_2_status", "")
				e.Record.Set("freight_2_date", nil)
				e.Record.Set("invoice_2_status", "")
			}

			contractId := e.Record.GetString("purchase_contract")
			if contractId == "" {
				log.Println("[PurchaseArrival] purchase_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "purchase_contracts", contractId)
			if err != nil {
				log.Printf("[PurchaseArrival] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			arrivals, err := GetRecordsByField(app, "purchase_arrivals", "purchase_contract", contractId)
			if err != nil {
				log.Printf("[PurchaseArrival] Failed to get arrivals: %v\n", err)
				arrivals = []*core.Record{}
			}

			newQuantity := e.Record.GetFloat("quantity")
			totalQuantity := SumField(arrivals, "quantity") + newQuantity
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if err := CheckOverage(totalQuantity, contractTotalQuantity, 1.0, "到货数量", "quantity"); err != nil {
				return err
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("purchase_arrivals").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			contractId := e.Record.GetString("purchase_contract")
			if contractId == "" {
				log.Println("[PurchaseArrival] purchase_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "purchase_contracts", contractId)
			if err != nil {
				log.Printf("[PurchaseArrival] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			arrivals, err := GetRecordsByField(app, "purchase_arrivals", "purchase_contract", contractId)
			if err != nil {
				log.Printf("[PurchaseArrival] Failed to get arrivals: %v\n", err)
				arrivals = []*core.Record{}
			}

			currentArrivalId := e.Record.Id
			newQuantity := e.Record.GetFloat("quantity")
			totalQuantity := SumChildFieldExcluding(arrivals, "quantity", currentArrivalId, newQuantity)
			contractTotalQuantity := contract.GetFloat("total_quantity")

			oldRecord := e.Record.Original()
			// 仅当 quantity 真正变化时才校验超额，避免纯状态变更（管理确认）被拦截
			if err := CheckOverageIfChanged(oldRecord, e.Record, "quantity", totalQuantity, contractTotalQuantity, 1.0, "到货数量"); err != nil {
				return err
			}

			oldStatus := ""
			if oldRecord != nil {
				oldStatus = oldRecord.GetString("manager_confirmed")
			}
			newStatus := e.Record.GetString("manager_confirmed")

			if oldStatus == "pending" && newStatus == "approved" {
				creatorId := e.Record.GetString("creator_user")
				trackingNo := e.Record.GetString("tracking_contract_no")
				title := "采购发货已确认"
				message := fmt.Sprintf("管理已确认您的采购发货信息，发货批次：%s", trackingNo)

				log.Printf("[PurchaseArrival] Sending notification to %s: %s\n", creatorId, title)
				if err := CreateNotification(app, "manager_confirm", title, message, creatorId, ""); err != nil {
					log.Printf("[PurchaseArrival] Failed to send notification: %v\n", err)
				}
			}

			wetherTransit := e.Record.GetString("wether_transit")
			if wetherTransit == "no" {
				e.Record.Set("freight_2", 0)
				e.Record.Set("transit_warehouse", "")
				e.Record.Set("freight_2_status", "")
				e.Record.Set("freight_2_date", nil)
				e.Record.Set("invoice_2_status", "")
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("purchase_arrivals").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			return finishPostCommit(e, "PurchaseArrival.AfterCreate", func() error {
				return updatePurchaseContractExecution(app, e.Record.GetString("purchase_contract"))
			})
		},
		Priority: 0,
	})

	app.OnRecordAfterUpdateSuccess("purchase_arrivals").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			return finishPostCommit(e, "PurchaseArrival.AfterUpdate", func() error {
				return updatePurchaseContractExecution(app, e.Record.GetString("purchase_contract"))
			})
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("purchase_arrivals").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			if isContractCascadeDelete(e.Context) {
				return e.Next()
			}
			return updatePurchaseContractExecution(app, e.Record.GetString("purchase_contract"))
		},
		Priority: 0,
	})
}

func updatePurchaseContractExecution(app core.App, contractId string) error {
	contract, err := GetRecordById(app, "purchase_contracts", contractId)
	if err != nil {
		return err
	}

	arrivals, err := GetRecordsByField(app, "purchase_arrivals", "purchase_contract", contractId)
	if err != nil {
		arrivals = []*core.Record{}
	}

	totalQuantity := SumField(arrivals, "quantity")

	totalContractQuantity := contract.GetFloat("total_quantity")

	if totalContractQuantity > 0 {
		executionPercent := ComputePercent(totalQuantity, totalContractQuantity)
		contract.Set("executed_quantity", totalQuantity)
		contract.Set("execution_percent", executionPercent)
	}

	return updatePurchaseContractStatus(app, contract)
}

func updatePurchaseContractStatus(app core.App, contract *core.Record) error {
	executionPercent := contract.GetFloat("execution_percent")
	invoicedPercent := contract.GetFloat("invoiced_percent")
	paidPercent := contract.GetFloat("paid_percent")
	currentStatus := contract.GetString("status")

	if executionPercent >= 100 && invoicedPercent >= 100 && paidPercent >= 100 && currentStatus != "cancelled" {
		contract.Set("status", "completed")
	} else if currentStatus == "completed" {
		contract.Set("status", "executing")
	}

	return SaveRecord(app, contract)
}
