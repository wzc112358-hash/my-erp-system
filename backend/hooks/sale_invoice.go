package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterSaleInvoiceHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("sale_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			e.Record.Set("manager_confirmed", "pending")

			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SaleInvoice] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			invoices, err := GetRecordsByField(app, "sale_invoices", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get invoices: %v\n", err)
				invoices = []*core.Record{}
			}

			newInvoiceProductAmount := e.Record.GetFloat("product_amount")
			totalProductAmount := SumField(invoices, "product_amount") + newInvoiceProductAmount
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if totalProductAmount > contractTotalQuantity {
				return fmt.Errorf("发票产品数量总和(%.2f)不能超过合同总数量(%.2f)", totalProductAmount, contractTotalQuantity)
			}

			totalAmount := SumField(invoices, "amount") + e.Record.GetFloat("amount")
			totalContractAmount := contract.GetFloat("total_amount")
			var invoicePercent, uninvoicedAmount, uninvoicedPercent float64

			if totalContractAmount > 0 {
				invoicePercent = (totalAmount / totalContractAmount) * 100
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = (uninvoicedAmount / totalContractAmount) * 100
			}

			e.Record.Set("invoiced_amount", totalAmount)
			e.Record.Set("invoice_percent", invoicePercent)
			e.Record.Set("uninvoiced_amount", uninvoicedAmount)
			e.Record.Set("uninvoiced_percent", uninvoicedPercent)

			contract.Set("invoiced_amount", totalAmount)
			contract.Set("invoice_percent", invoicePercent)
			contract.Set("uninvoiced_amount", uninvoicedAmount)
			contract.Set("uninvoiced_percent", uninvoicedPercent)

			log.Printf("[SaleInvoice] Updating contract %s: invoiced_amount=%.2f, invoice_percent=%.2f\n",
				contractId, totalAmount, invoicePercent)

			if err := updateSalesContractStatus(app, contract); err != nil {
				return err
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("sale_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SaleInvoice] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			invoices, err := GetRecordsByField(app, "sale_invoices", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get invoices: %v\n", err)
				invoices = []*core.Record{}
			}

			currentInvoiceId := e.Record.Id
			newInvoiceProductAmount := e.Record.GetFloat("product_amount")
			newInvoiceAmount := e.Record.GetFloat("amount")

			totalProductAmount := SumField(invoices, "product_amount")
			totalAmount := SumField(invoices, "amount")
			for _, r := range invoices {
				if r.Id == currentInvoiceId {
					totalProductAmount = totalProductAmount - r.GetFloat("product_amount") + newInvoiceProductAmount
					totalAmount = totalAmount - r.GetFloat("amount") + newInvoiceAmount
					break
				}
			}
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if totalProductAmount > contractTotalQuantity {
				return fmt.Errorf("发票产品数量总和(%.2f)不能超过合同总数量(%.2f)", totalProductAmount, contractTotalQuantity)
			}

			totalContractAmount := contract.GetFloat("total_amount")
			var invoicePercent, uninvoicedAmount, uninvoicedPercent float64

			if totalContractAmount > 0 {
				invoicePercent = (totalAmount / totalContractAmount) * 100
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = (uninvoicedAmount / totalContractAmount) * 100
			}

			e.Record.Set("invoiced_amount", totalAmount)
			e.Record.Set("invoice_percent", invoicePercent)
			e.Record.Set("uninvoiced_amount", uninvoicedAmount)
			e.Record.Set("uninvoiced_percent", uninvoicedPercent)

			contract.Set("invoiced_amount", totalAmount)
			contract.Set("invoice_percent", invoicePercent)
			contract.Set("uninvoiced_amount", uninvoicedAmount)
			contract.Set("uninvoiced_percent", uninvoicedPercent)

			log.Printf("[SaleInvoice] Updating contract %s: invoiced_amount=%.2f, invoice_percent=%.2f\n",
				contractId, totalAmount, invoicePercent)

			if err := updateSalesContractStatus(app, contract); err != nil {
				return err
			}

			oldRecord, _ := GetRecordById(app, "sale_invoices", e.Record.Id)
			oldStatus := ""
			if oldRecord != nil {
				oldStatus = oldRecord.GetString("manager_confirmed")
			}
			newStatus := e.Record.GetString("manager_confirmed")

			if oldStatus == "pending" && newStatus == "approved" {
				creatorId := e.Record.GetString("creator")
				invoiceNo := e.Record.GetString("no")
				title := "销售开票已确认"
				message := fmt.Sprintf("经理已确认您的销售开票申请，发票号：%s", invoiceNo)

				log.Printf("[SaleInvoice] Sending notification to %s: %s\n", creatorId, title)
				if err := CreateNotification02(app, "manager_confirm", title, message, creatorId, ""); err != nil {
					log.Printf("[SaleInvoice] Failed to send notification: %v\n", err)
				}
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("sale_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SaleInvoice] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			invoices, err := GetRecordsByField(app, "sale_invoices", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get invoices: %v\n", err)
				invoices = []*core.Record{}
			}

			totalAmount := SumField(invoices, "amount")
			totalContractAmount := contract.GetFloat("total_amount")
			var invoicePercent, uninvoicedAmount, uninvoicedPercent float64

			if totalContractAmount > 0 {
				invoicePercent = (totalAmount / totalContractAmount) * 100
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = (uninvoicedAmount / totalContractAmount) * 100
			}

			contract.Set("invoiced_amount", totalAmount)
			contract.Set("invoice_percent", invoicePercent)
			contract.Set("uninvoiced_amount", uninvoicedAmount)
			contract.Set("uninvoiced_percent", uninvoicedPercent)

			return updateSalesContractStatus(app, contract)
		},
		Priority: 0,
	})
}
