package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterPurchasePaymentHooks(app core.App) {
	app.OnRecordCreate("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			e.Record.Set("manager_confirmed", "pending")

			contractId := e.Record.GetString("purchase_contract")
			if contractId == "" {
				log.Println("[PurchasePayment] purchase_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "purchase_contracts", contractId)
			if err != nil {
				log.Printf("[PurchasePayment] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			payments, err := GetRecordsByField(app, "purchase_payments", "purchase_contract", contractId)
			if err != nil {
				log.Printf("[PurchasePayment] Failed to get payments: %v\n", err)
				payments = []*core.Record{}
			}

			newPaymentProductAmount := e.Record.GetFloat("product_amount")
			totalProductAmount := SumField(payments, "product_amount") + newPaymentProductAmount
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if err := CheckOverage(totalProductAmount, contractTotalQuantity, 1.0, "付款产品数量", "product_amount"); err != nil {
				return err
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			contractId := e.Record.GetString("purchase_contract")
			if contractId == "" {
				log.Println("[PurchasePayment] purchase_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "purchase_contracts", contractId)
			if err != nil {
				log.Printf("[PurchasePayment] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			payments, err := GetRecordsByField(app, "purchase_payments", "purchase_contract", contractId)
			if err != nil {
				log.Printf("[PurchasePayment] Failed to get payments: %v\n", err)
				payments = []*core.Record{}
			}

			currentPaymentId := e.Record.Id
			newPaymentProductAmount := e.Record.GetFloat("product_amount")

			totalProductAmount := SumChildFieldExcluding(payments, "product_amount", currentPaymentId, newPaymentProductAmount)
			contractTotalQuantity := contract.GetFloat("total_quantity")

			oldRecord := e.Record.Original()
			// 仅当 product_amount 真正变化时才校验超额，避免纯状态变更（经理确认）被拦截
			if err := CheckOverageIfChanged(oldRecord, e.Record, "product_amount", totalProductAmount, contractTotalQuantity, 1.0, "付款产品数量"); err != nil {
				return err
			}

			oldStatus := ""
			if oldRecord != nil {
				oldStatus = oldRecord.GetString("manager_confirmed")
			}
			newStatus := e.Record.GetString("manager_confirmed")

			if oldStatus == "pending" && newStatus == "approved" {
				creatorId := e.Record.GetString("creator_user")
				amount := e.Record.GetFloat("amount")
				contractNo := contract.GetString("no")
				productName := contract.GetString("product_name")
				title := fmt.Sprintf("%s %s - 采购付款已确认", contractNo, productName)
				message := fmt.Sprintf("经理已确认您的采购付款申请，付款金额：%.2f", amount)

				log.Printf("[PurchasePayment] Sending notification to %s: %s\n", creatorId, title)
				if err := CreateNotification(app, "manager_confirm", title, message, creatorId, ""); err != nil {
					log.Printf("[PurchasePayment] Failed to send notification: %v\n", err)
				}
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			return finishPostCommit(e, "PurchasePayment.AfterCreate", func() error {
				return updatePurchaseContractPaymentProgress(app, e.Record.GetString("purchase_contract"), e.Record)
			})
		},
		Priority: 0,
	})

	app.OnRecordAfterUpdateSuccess("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			return finishPostCommit(e, "PurchasePayment.AfterUpdate", func() error {
				return updatePurchaseContractPaymentProgress(app, e.Record.GetString("purchase_contract"), e.Record)
			})
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			if isContractCascadeDelete(e.Context) {
				return e.Next()
			}
			return updatePurchaseContractPaymentProgress(app, e.Record.GetString("purchase_contract"), nil)
		},
		Priority: 0,
	})
}

func updatePurchaseContractPaymentProgress(app core.App, contractId string, currentRecord *core.Record) error {
	contract, err := GetRecordById(app, "purchase_contracts", contractId)
	if err != nil {
		return err
	}

	payments, err := GetRecordsByField(app, "purchase_payments", "purchase_contract", contractId)
	if err != nil {
		payments = []*core.Record{}
	}

	totalAmount := SumField(payments, "amount")
	if currentRecord != nil {
		totalAmount = SumChildFieldExcluding(payments, "amount", currentRecord.Id, currentRecord.GetFloat("amount"))
	}

	totalContractAmount := contract.GetFloat("total_amount")
	if totalContractAmount > 0 {
		paidPercent := ComputePercent(totalAmount, totalContractAmount)
		unpaidAmount := totalContractAmount - totalAmount
		unpaidPercent := ComputePercent(unpaidAmount, totalContractAmount)

		contract.Set("paid_amount", totalAmount)
		contract.Set("paid_percent", paidPercent)
		contract.Set("unpaid_amount", unpaidAmount)
		contract.Set("unpaid_percent", unpaidPercent)
	}

	return updatePurchaseContractStatus(app, contract)
}
