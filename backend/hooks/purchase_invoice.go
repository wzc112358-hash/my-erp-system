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
			e.Record.Set("is_verified", "no")

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

			if totalProductAmount > contractTotalQuantity {
				return fmt.Errorf("发票产品数量总和(%.2f)不能超过合同总数量(%.2f)", totalProductAmount, contractTotalQuantity)
			}

			return e.Next()
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

			totalProductAmount := SumField(invoices, "product_amount")
			for _, r := range invoices {
				if r.Id == currentInvoiceId {
					totalProductAmount = totalProductAmount - r.GetFloat("product_amount") + newInvoiceProductAmount
					break
				}
			}
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if totalProductAmount > contractTotalQuantity {
				return fmt.Errorf("发票产品数量总和(%.2f)不能超过合同总数量(%.2f)", totalProductAmount, contractTotalQuantity)
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
				receivedPercent = (totalAmount / totalContractAmount) * 100
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = (uninvoicedAmount / totalContractAmount) * 100
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
			newInvoiceAmount := e.Record.GetFloat("amount")
			totalAmount := SumField(invoices, "amount")
			for _, r := range invoices {
				if r.Id == currentInvoiceId {
					totalAmount = totalAmount - r.GetFloat("amount") + newInvoiceAmount
					break
				}
			}

			totalContractAmount := contract.GetFloat("total_amount")
			var receivedPercent, uninvoicedAmount, uninvoicedPercent float64

			if totalContractAmount > 0 {
				receivedPercent = (totalAmount / totalContractAmount) * 100
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = (uninvoicedAmount / totalContractAmount) * 100
			}

			contract.Set("invoiced_amount", totalAmount)
			contract.Set("invoiced_percent", receivedPercent)
			contract.Set("uninvoiced_amount", uninvoicedAmount)
			contract.Set("uninvoiced_percent", uninvoicedPercent)

			e.Record.Set("received_amount", totalAmount)
			e.Record.Set("received_percent", receivedPercent)
			e.Record.Set("uninvoiced_amount", uninvoicedAmount)
			e.Record.Set("uninvoiced_percent", uninvoicedPercent)

			oldRecord, _ := GetRecordById(app, "purchase_invoices", e.Record.Id)
			oldStatus := ""
			if oldRecord != nil {
				oldStatus = oldRecord.GetString("manager_confirmed")
			}
			newStatus := e.Record.GetString("manager_confirmed")

			if oldStatus == "pending" && newStatus == "approved" {
				creatorId := e.Record.GetString("creator")
				invoiceNo := e.Record.GetString("no")
				title := "采购收票已确认"
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
		invoicePercent := (totalAmount / totalContractAmount) * 100
		uninvoicedAmount := totalContractAmount - totalAmount
		uninvoicedPercent := (uninvoicedAmount / totalContractAmount) * 100

		contract.Set("invoiced_amount", totalAmount)
		contract.Set("invoiced_percent", invoicePercent)
		contract.Set("uninvoiced_amount", uninvoicedAmount)
		contract.Set("uninvoiced_percent", uninvoicedPercent)
	}

	return updatePurchaseContractStatus(app, contract)
}
