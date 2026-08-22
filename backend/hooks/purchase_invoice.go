package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterPurchaseInvoiceHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("purchase_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			e.Record.Set("manager_confirmed", "pending")
			// 仅当未提交时默认"未验票"，不覆盖用户提交的值
			if e.Record.GetString("is_verified") == "" {
				e.Record.Set("is_verified", "no")
			}

			contractId := e.Record.GetString("purchase_contract")
			if contractId == "" {
				log.Println("[PurchaseInvoice] purchase_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "purchase_contracts", contractId)
			if err != nil {
				log.Printf("[PurchaseInvoice] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			invoices, err := GetRecordsByField(app, "purchase_invoices", "purchase_contract", contractId)
			if err != nil {
				log.Printf("[PurchaseInvoice] Failed to get invoices: %v\n", err)
				invoices = []*core.Record{}
			}

			newInvoiceProductAmount := e.Record.GetFloat("product_amount")
			totalProductAmount := SumField(invoices, "product_amount") + newInvoiceProductAmount
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if err := CheckOverage(totalProductAmount, contractTotalQuantity, 1.0, "发票产品数量"); err != nil {
				return err
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("purchase_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			contractId := e.Record.GetString("purchase_contract")
			if contractId == "" {
				log.Println("[PurchaseInvoice] purchase_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "purchase_contracts", contractId)
			if err != nil {
				log.Printf("[PurchaseInvoice] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			invoices, err := GetRecordsByField(app, "purchase_invoices", "purchase_contract", contractId)
			if err != nil {
				log.Printf("[PurchaseInvoice] Failed to get invoices: %v\n", err)
				invoices = []*core.Record{}
			}

			totalAmount := SumField(invoices, "amount")

			totalContractAmount := contract.GetFloat("total_amount")
			var receivedPercent, uninvoicedAmount, uninvoicedPercent float64

			if totalContractAmount > 0 {
				receivedPercent = ComputePercent(totalAmount, totalContractAmount)
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = ComputePercent(uninvoicedAmount, totalContractAmount)
			}

			contract.Set("invoiced_amount", totalAmount)
			contract.Set("invoiced_percent", receivedPercent)
			contract.Set("uninvoiced_amount", uninvoicedAmount)
			contract.Set("uninvoiced_percent", uninvoicedPercent)

			log.Printf("[PurchaseInvoice] Updated contract %s: invoiced_amount=%.2f, invoiced_percent=%.2f\n",
				contractId, totalAmount, receivedPercent)

			return updatePurchaseContractStatus(app, contract)
		},
		Priority: 0,
	})

	app.OnRecordUpdate("purchase_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			contractId := e.Record.GetString("purchase_contract")
			if contractId == "" {
				log.Println("[PurchaseInvoice] purchase_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "purchase_contracts", contractId)
			if err != nil {
				log.Printf("[PurchaseInvoice] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			invoices, err := GetRecordsByField(app, "purchase_invoices", "purchase_contract", contractId)
			if err != nil {
				log.Printf("[PurchaseInvoice] Failed to get invoices: %v\n", err)
				invoices = []*core.Record{}
			}

			currentInvoiceId := e.Record.Id
			newInvoiceProductAmount := e.Record.GetFloat("product_amount")
			newInvoiceAmount := e.Record.GetFloat("amount")

			totalProductAmount := SumChildFieldExcluding(invoices, "product_amount", currentInvoiceId, newInvoiceProductAmount)
			contractTotalQuantity := contract.GetFloat("total_quantity")

			oldRecord, _ := GetRecordById(app, "purchase_invoices", e.Record.Id)
			// 仅当 product_amount 真正变化时才校验超额，避免纯状态变更（经理确认）被拦截
			if err := CheckOverageIfChanged(oldRecord, e.Record, "product_amount", totalProductAmount, contractTotalQuantity, 1.0, "发票产品数量"); err != nil {
				return err
			}

			totalAmount := SumChildFieldExcluding(invoices, "amount", currentInvoiceId, newInvoiceAmount)

			totalContractAmount := contract.GetFloat("total_amount")
			var receivedPercent, uninvoicedAmount, uninvoicedPercent float64

			if totalContractAmount > 0 {
				receivedPercent = ComputePercent(totalAmount, totalContractAmount)
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = ComputePercent(uninvoicedAmount, totalContractAmount)
			}

			contract.Set("invoiced_amount", totalAmount)
			contract.Set("invoiced_percent", receivedPercent)
			contract.Set("uninvoiced_amount", uninvoicedAmount)
			contract.Set("uninvoiced_percent", uninvoicedPercent)

			e.Record.Set("received_amount", totalAmount)
			e.Record.Set("received_percent", receivedPercent)
			e.Record.Set("uninvoiced_amount", uninvoicedAmount)
			e.Record.Set("uninvoiced_percent", uninvoicedPercent)

			oldStatus := ""
			if oldRecord != nil {
				oldStatus = oldRecord.GetString("manager_confirmed")
			}
			newStatus := e.Record.GetString("manager_confirmed")

			if oldStatus == "pending" && newStatus == "approved" {
				creatorId := e.Record.GetString("creator_user")
				invoiceNo := e.Record.GetString("no")
				contractNo := contract.GetString("no")
				productName := contract.GetString("product_name")
				title := fmt.Sprintf("%s %s - 采购收票已确认", contractNo, productName)
				message := fmt.Sprintf("经理已确认您的采购收票申请，发票号：%s", invoiceNo)

				log.Printf("[PurchaseInvoice] Sending notification to %s: %s\n", creatorId, title)
				if err := CreateNotification(app, "manager_confirm", title, message, creatorId, ""); err != nil {
					log.Printf("[PurchaseInvoice] Failed to send notification: %v\n", err)
				}
			}

			if err := updatePurchaseContractStatus(app, contract); err != nil {
				return err
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("purchase_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return updatePurchaseContractInvoiceProgress(app, e.Record.GetString("purchase_contract"))
		},
		Priority: 0,
	})
}

func updatePurchaseContractInvoiceProgress(app *pocketbase.PocketBase, contractId string) error {
	contract, err := GetRecordById(app, "purchase_contracts", contractId)
	if err != nil {
		return err
	}

	invoices, err := GetRecordsByField(app, "purchase_invoices", "purchase_contract", contractId)
	if err != nil {
		invoices = []*core.Record{}
	}

	totalAmount := SumField(invoices, "amount")

	totalContractAmount := contract.GetFloat("total_amount")
	if totalContractAmount > 0 {
		invoicePercent := ComputePercent(totalAmount, totalContractAmount)
		uninvoicedAmount := totalContractAmount - totalAmount
		uninvoicedPercent := ComputePercent(uninvoicedAmount, totalContractAmount)

		contract.Set("invoiced_amount", totalAmount)
		contract.Set("invoiced_percent", invoicePercent)
		contract.Set("uninvoiced_amount", uninvoicedAmount)
		contract.Set("uninvoiced_percent", uninvoicedPercent)
	}

	return updatePurchaseContractStatus(app, contract)
}
