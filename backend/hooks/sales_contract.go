package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterSalesContractHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("sales_contracts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			unitPrice := e.Record.GetFloat("unit_price")
			totalQuantity := e.Record.GetFloat("total_quantity")
			e.Record.Set("total_amount", unitPrice*totalQuantity)

			e.Record.Set("executed_quantity", 0)
			e.Record.Set("execution_percent", 0)
			e.Record.Set("receipted_amount", 0)
			e.Record.Set("receipt_percent", 0)
			e.Record.Set("debt_amount", unitPrice*totalQuantity)
			e.Record.Set("debt_percent", 100)
			e.Record.Set("invoiced_amount", 0)
			e.Record.Set("invoice_percent", 0)
			e.Record.Set("uninvoiced_amount", unitPrice*totalQuantity)
			e.Record.Set("uninvoiced_percent", 100)
			e.Record.Set("status", "executing")

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("sales_contracts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			purchaseContractId := e.Record.GetString("purchase_contract")
			if purchaseContractId != "" {
				log.Println("[SalesContract] Sales contract has linked purchase contract, skip creating notification")
				return updatePurchaseContractSalesContract(app, purchaseContractId, e.Record.Id)
			}

			customerId := e.Record.GetString("customer")
			if customerId == "" {
				log.Println("[SalesContract] Customer is empty, skip creating notification")
				return e.Next()
			}

			customer, err := GetRecordById(app, "customers", customerId)
			if err != nil {
				log.Printf("[SalesContract] Failed to get customer: %v\n", err)
				return e.Next()
			}

			title := "新销售合同需要采购"
			message := fmt.Sprintf("销售合同 %s 已创建，客户: %s，品名: %s，数量: %.2f吨，金额: %.2f元",
				e.Record.GetString("no"),
				customer.GetString("name"),
				e.Record.GetString("product_name"),
				e.Record.GetFloat("total_quantity"),
				e.Record.GetFloat("total_amount"))

			purchasingUsers, err := GetUsersByType(app, "purchasing")
			if err != nil {
				log.Printf("[SalesContract] Failed to get purchasing users: %v\n", err)
				return e.Next()
			}

			if len(purchasingUsers) == 0 {
				log.Println("[SalesContract] No purchasing users found")
				return e.Next()
			}

			for _, user := range purchasingUsers {
				err := CreateNotification(app, "sales_contract_reminder", title, message, user.Id, e.Record.Id)
				if err != nil {
					log.Printf("[SalesContract] Failed to create notification: %v\n", err)
				}
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("sales_contracts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("sales_contracts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			unitPrice := e.Record.GetFloat("unit_price")
			totalQuantity := e.Record.GetFloat("total_quantity")
			newTotalAmount := unitPrice * totalQuantity

			oldTotalAmount := e.Record.GetFloat("total_amount")

			if newTotalAmount == oldTotalAmount {
				return e.Next()
			}

			e.Record.Set("total_amount", newTotalAmount)

			currentReceiptedAmount := e.Record.GetFloat("receipted_amount")
			currentInvoicedAmount := e.Record.GetFloat("invoiced_amount")

			var receiptedAmount, invoicedAmount float64
			if newTotalAmount > 0 && oldTotalAmount > 0 {
				receiptedAmount = currentReceiptedAmount * newTotalAmount / oldTotalAmount
				invoicedAmount = currentInvoicedAmount * newTotalAmount / oldTotalAmount
			} else {
				receiptedAmount = currentReceiptedAmount
				invoicedAmount = currentInvoicedAmount
			}

			e.Record.Set("receipted_amount", receiptedAmount)
			e.Record.Set("receipt_percent", (receiptedAmount/newTotalAmount)*100)
			e.Record.Set("debt_amount", newTotalAmount-receiptedAmount)
			e.Record.Set("debt_percent", ((newTotalAmount-receiptedAmount)/newTotalAmount)*100)

			e.Record.Set("invoiced_amount", invoicedAmount)
			e.Record.Set("invoice_percent", (invoicedAmount/newTotalAmount)*100)
			e.Record.Set("uninvoiced_amount", newTotalAmount-invoicedAmount)
			e.Record.Set("uninvoiced_percent", ((newTotalAmount-invoicedAmount)/newTotalAmount)*100)

			return e.Next()
		},
		Priority: 0,
	})
}

func updatePurchaseContractSalesContract(app *pocketbase.PocketBase, purchaseContractId, salesContractId string) error {
	contract, err := GetRecordById(app, "purchase_contracts", purchaseContractId)
	if err != nil {
		log.Printf("[SalesContract] Failed to get purchase contract %s: %v\n", purchaseContractId, err)
		return err
	}

	contract.Set("sales_contract", salesContractId)
	return SaveRecord(app, contract)
}
