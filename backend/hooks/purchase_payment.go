package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterPurchasePaymentHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
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

			if totalProductAmount > contractTotalQuantity {
				return fmt.Errorf("付款产品数量总和(%.2f)不能超过合同总数量(%.2f)", totalProductAmount, contractTotalQuantity)
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
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

			totalProductAmount := SumField(payments, "product_amount")
			for _, r := range payments {
				if r.Id == currentPaymentId {
					totalProductAmount = totalProductAmount - r.GetFloat("product_amount") + newPaymentProductAmount
					break
				}
			}
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if totalProductAmount > contractTotalQuantity {
				return fmt.Errorf("付款产品数量总和(%.2f)不能超过合同总数量(%.2f)", totalProductAmount, contractTotalQuantity)
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return updatePurchaseContractPaymentProgress(app, e.Record.GetString("purchase_contract"), e.Record)
		},
		Priority: 0,
	})

	app.OnRecordAfterUpdateSuccess("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return updatePurchaseContractPaymentProgress(app, e.Record.GetString("purchase_contract"), e.Record)
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("purchase_payments").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return updatePurchaseContractPaymentProgress(app, e.Record.GetString("purchase_contract"), nil)
		},
		Priority: 0,
	})
}

func updatePurchaseContractPaymentProgress(app *pocketbase.PocketBase, contractId string, currentRecord *core.Record) error {
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
		currentPaymentId := currentRecord.Id
		newPaymentAmount := currentRecord.GetFloat("amount")
		for _, r := range payments {
			if r.Id == currentPaymentId {
				totalAmount = totalAmount - r.GetFloat("amount") + newPaymentAmount
				break
			}
		}
	}

	totalContractAmount := contract.GetFloat("total_amount")
	if totalContractAmount > 0 {
		paidPercent := (totalAmount / totalContractAmount) * 100
		unpaidAmount := totalContractAmount - totalAmount
		unpaidPercent := (unpaidAmount / totalContractAmount) * 100

		contract.Set("paid_amount", totalAmount)
		contract.Set("paid_percent", paidPercent)
		contract.Set("unpaid_amount", unpaidAmount)
		contract.Set("unpaid_percent", unpaidPercent)
	}

	return updatePurchaseContractStatus(app, contract)
}
