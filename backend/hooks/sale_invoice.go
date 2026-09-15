package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterSaleInvoiceHooks(app core.App) {
	app.OnRecordCreate("sale_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			app := e.App
			e.Record.Set("manager_confirmed", "pending")

			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SaleInvoice] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get contract %s: %v\n", contractId, err)
				return err
			}

			invoices, err := GetRecordsByField(app, "sale_invoices", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get invoices: %v\n", err)
				return err
			}

			newInvoiceProductAmount := e.Record.GetFloat("product_amount")
			totalProductAmount := SumField(invoices, "product_amount") + newInvoiceProductAmount
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if err := CheckOverage(totalProductAmount, contractTotalQuantity, 1.0, "发票产品数量", "product_amount"); err != nil {
				return err
			}

			totalAmount := SumField(invoices, "amount") + e.Record.GetFloat("amount")
			totalContractAmount := contract.GetFloat("total_amount")
			var invoicePercent, uninvoicedAmount, uninvoicedPercent float64

			if totalContractAmount > 0 {
				invoicePercent = ComputePercent(totalAmount, totalContractAmount)
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = ComputePercent(uninvoicedAmount, totalContractAmount)
			}

			e.Record.Set("invoiced_amount", totalAmount)
			e.Record.Set("invoice_percent", invoicePercent)
			e.Record.Set("uninvoiced_amount", uninvoicedAmount)
			e.Record.Set("uninvoiced_percent", uninvoicedPercent)

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("sale_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return finishPostCommit(e, "SaleInvoice.AfterCreate", func() error {
				return recalculateChildContractProgress(e.Context, e.App, "sales", "sales_contract", e.Record)
			})
		},
		Priority: 0,
	})

	app.OnRecordUpdate("sale_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			rememberChildContractBeforeUpdate(e, "sales_contract")
			app := e.App
			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SaleInvoice] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get contract %s: %v\n", contractId, err)
				return err
			}

			invoices, err := GetRecordsByField(app, "sale_invoices", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SaleInvoice] Failed to get invoices: %v\n", err)
				return err
			}

			currentInvoiceId := e.Record.Id
			newInvoiceProductAmount := e.Record.GetFloat("product_amount")
			newInvoiceAmount := e.Record.GetFloat("amount")

			totalProductAmount := SumChildFieldExcluding(invoices, "product_amount", currentInvoiceId, newInvoiceProductAmount)
			totalAmount := SumChildFieldExcluding(invoices, "amount", currentInvoiceId, newInvoiceAmount)
			contractTotalQuantity := contract.GetFloat("total_quantity")

			oldRecord := e.Record.Original()
			// 仅当 product_amount 真正变化时才校验超额，避免纯状态变更（管理确认）被拦截
			if err := CheckOverageIfChanged(oldRecord, e.Record, "product_amount", totalProductAmount, contractTotalQuantity, 1.0, "发票产品数量"); err != nil {
				return err
			}

			totalContractAmount := contract.GetFloat("total_amount")
			var invoicePercent, uninvoicedAmount, uninvoicedPercent float64

			if totalContractAmount > 0 {
				invoicePercent = ComputePercent(totalAmount, totalContractAmount)
				uninvoicedAmount = totalContractAmount - totalAmount
				uninvoicedPercent = ComputePercent(uninvoicedAmount, totalContractAmount)
			}

			e.Record.Set("invoiced_amount", totalAmount)
			e.Record.Set("invoice_percent", invoicePercent)
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
				title := fmt.Sprintf("%s %s - 销售开票已确认", contractNo, productName)
				message := fmt.Sprintf("管理已确认您的销售开票申请，发票号：%s", invoiceNo)

				log.Printf("[SaleInvoice] Sending notification to %s: %s\n", creatorId, title)
				if err := CreateSalesNotification(app, "manager_confirm", title, message, creatorId, ""); err != nil {
					log.Printf("[SaleInvoice] Failed to send notification: %v\n", err)
				}
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterUpdateSuccess("sale_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			return finishPostCommit(e, "SaleInvoice.AfterUpdate", func() error {
				return recalculateChildContractProgress(e.Context, e.App, "sales", "sales_contract", e.Record)
			})
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("sale_invoices").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if isContractCascadeDelete(e.Context) {
				return e.Next()
			}
			return finishPostCommit(e, "SaleInvoice.AfterDelete", func() error {
				return recalculateChildContractProgress(e.Context, e.App, "sales", "sales_contract", e.Record)
			})
		},
		Priority: 0,
	})
}
