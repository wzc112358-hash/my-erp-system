package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterPurchaseContractHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("purchase_contracts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			unitPrice := e.Record.GetFloat("unit_price")
			totalQuantity := e.Record.GetFloat("total_quantity")
			e.Record.Set("total_amount", unitPrice*totalQuantity)

			e.Record.Set("executed_quantity", 0)
			e.Record.Set("execution_percent", 0)
			e.Record.Set("invoiced_amount", 0)
			e.Record.Set("invoiced_percent", 0)
			e.Record.Set("uninvoiced_amount", unitPrice*totalQuantity)
			e.Record.Set("uninvoiced_percent", 100)
			e.Record.Set("paid_amount", 0)
			e.Record.Set("paid_percent", 0)
			e.Record.Set("unpaid_amount", unitPrice*totalQuantity)
			e.Record.Set("unpaid_percent", 100)
			e.Record.Set("status", "executing")

			if !e.Record.GetBool("is_cross_border") {
				e.Record.Set("is_cross_border", false)
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("purchase_contracts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			salesContractId := e.Record.GetString("sales_contract")
			if salesContractId != "" {
				return e.Next()
			}

			supplierId := e.Record.GetString("supplier")
			var supplierName string
			if supplierId != "" {
				supplier, err := GetRecordById(app, "suppliers", supplierId)
				if err != nil {
					log.Printf("[PurchaseContract] Failed to get supplier: %v\n", err)
					supplierName = "未知"
				} else {
					supplierName = supplier.GetString("name")
				}
			}

			title := "新采购合同需要销售"
			var message string
			if e.Record.GetBool("is_cross_border") {
				message = fmt.Sprintf("采购合同 %s 已创建，客户: %s，品名: %s，数量: %.2f吨，金额: $%.2f USD",
					e.Record.GetString("no"),
					supplierName,
					e.Record.GetString("product_name"),
					e.Record.GetFloat("total_quantity"),
					e.Record.GetFloat("total_amount"))
			} else {
				message = fmt.Sprintf("采购合同 %s 已创建，客户: %s，品名: %s，数量: %.2f吨，金额: ¥%.2f元",
					e.Record.GetString("no"),
					supplierName,
					e.Record.GetString("product_name"),
					e.Record.GetFloat("total_quantity"),
					e.Record.GetFloat("total_amount"))
			}

			salesUsers, err := GetUsersByType(app, "sales")
			if err != nil {
				log.Printf("[PurchaseContract] Failed to get sales users: %v\n", err)
				return e.Next()
			}

			if len(salesUsers) == 0 {
				log.Println("[PurchaseContract] No sales users found")
				return e.Next()
			}

			for _, user := range salesUsers {
				err := CreateNotification02(app, "purchase_contract_reminder", title, message, user.Id, e.Record.Id)
				if err != nil {
					log.Printf("[PurchaseContract] Failed to create notification: %v\n", err)
				}
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("purchase_contracts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			unitPrice := e.Record.GetFloat("unit_price")
			totalQuantity := e.Record.GetFloat("total_quantity")
			newTotalAmount := unitPrice * totalQuantity

			e.Record.Set("total_amount", newTotalAmount)

			oldTotalAmount := e.Record.GetFloat("total_amount")
			if oldTotalAmount > 0 {
				currentInvoicedAmount := e.Record.GetFloat("invoiced_amount")
				currentPaidAmount := e.Record.GetFloat("paid_amount")

				invoicedAmount := currentInvoicedAmount * newTotalAmount / oldTotalAmount
				paidAmount := currentPaidAmount * newTotalAmount / oldTotalAmount

				e.Record.Set("invoiced_amount", invoicedAmount)
				e.Record.Set("invoiced_percent", (invoicedAmount/newTotalAmount)*100)
				e.Record.Set("uninvoiced_amount", newTotalAmount-invoicedAmount)
				e.Record.Set("uninvoiced_percent", ((newTotalAmount-invoicedAmount)/newTotalAmount)*100)

				e.Record.Set("paid_amount", paidAmount)
				e.Record.Set("paid_percent", (paidAmount/newTotalAmount)*100)
				e.Record.Set("unpaid_amount", newTotalAmount-paidAmount)
				e.Record.Set("unpaid_percent", ((newTotalAmount-paidAmount)/newTotalAmount)*100)
			}

			return e.Next()
		},
		Priority: 0,
	})
}
