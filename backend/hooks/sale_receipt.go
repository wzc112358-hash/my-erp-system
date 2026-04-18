package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterSaleReceiptHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("sale_receipts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			e.Record.Set("manager_confirmed", "pending")

			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SaleReceipt] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SaleReceipt] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			receipts, err := GetRecordsByField(app, "sale_receipts", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SaleReceipt] Failed to get receipts: %v\n", err)
				receipts = []*core.Record{}
			}

			newReceiptProductAmount := e.Record.GetFloat("product_amount")
			totalProductAmount := SumField(receipts, "product_amount") + newReceiptProductAmount
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if totalProductAmount > contractTotalQuantity {
				return fmt.Errorf("收款产品数量总和(%.2f)不能超过合同总数量(%.2f)", totalProductAmount, contractTotalQuantity)
			}

			totalAmount := SumField(receipts, "amount") + e.Record.GetFloat("amount")
			executedQuantity := contract.GetFloat("executed_quantity")
			unitPrice := contract.GetFloat("unit_price")
			receivableAmount := executedQuantity * unitPrice

			var receiptPercent, debtAmount, debtPercent float64

			if receivableAmount > 0 {
				receiptPercent = (totalAmount / receivableAmount) * 100
				debtAmount = receivableAmount - totalAmount
				debtPercent = (totalAmount / receivableAmount) * 100
			}

			e.Record.Set("receipted_amount", totalAmount)
			e.Record.Set("receipt_percent", receiptPercent)
			e.Record.Set("debt_amount", debtAmount)
			e.Record.Set("debt_percent", debtPercent)

			contract.Set("receipted_amount", totalAmount)
			contract.Set("receipt_percent", receiptPercent)
			contract.Set("debt_amount", debtAmount)
			contract.Set("debt_percent", debtPercent)

			log.Printf("[SaleReceipt] Updating contract %s: receipted_amount=%.2f, receipt_percent=%.2f\n",
				contractId, totalAmount, receiptPercent)

			if err := updateSalesContractStatus(app, contract); err != nil {
				return err
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("sale_receipts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SaleReceipt] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SaleReceipt] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			receipts, err := GetRecordsByField(app, "sale_receipts", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SaleReceipt] Failed to get receipts: %v\n", err)
				receipts = []*core.Record{}
			}

			currentReceiptId := e.Record.Id
			newReceiptProductAmount := e.Record.GetFloat("product_amount")
			newReceiptAmount := e.Record.GetFloat("amount")

			totalProductAmount := SumField(receipts, "product_amount")
			totalAmount := SumField(receipts, "amount")
			for _, r := range receipts {
				if r.Id == currentReceiptId {
					totalProductAmount = totalProductAmount - r.GetFloat("product_amount") + newReceiptProductAmount
					totalAmount = totalAmount - r.GetFloat("amount") + newReceiptAmount
					break
				}
			}
			contractTotalQuantity := contract.GetFloat("total_quantity")

			if totalProductAmount > contractTotalQuantity {
				return fmt.Errorf("收款产品数量总和(%.2f)不能超过合同总数量(%.2f)", totalProductAmount, contractTotalQuantity)
			}

			totalContractAmount := contract.GetFloat("executed_quantity") * contract.GetFloat("unit_price")
			var receiptPercent, debtAmount, debtPercent float64

			if totalContractAmount > 0 {
				receiptPercent = (totalAmount / totalContractAmount) * 100
				debtAmount = totalContractAmount - totalAmount
				debtPercent = (totalAmount / totalContractAmount) * 100
			}

			e.Record.Set("receipted_amount", totalAmount)
			e.Record.Set("receipt_percent", receiptPercent)
			e.Record.Set("debt_amount", debtAmount)
			e.Record.Set("debt_percent", debtPercent)

			contract.Set("receipted_amount", totalAmount)
			contract.Set("receipt_percent", receiptPercent)
			contract.Set("debt_amount", debtAmount)
			contract.Set("debt_percent", debtPercent)

			err = SaveRecord(app, contract)
			if err != nil {
				log.Printf("[SaleReceipt] Failed to save contract: %v\n", err)
			}

			oldRecord, _ := GetRecordById(app, "sale_receipts", e.Record.Id)
			oldStatus := ""
			if oldRecord != nil {
				oldStatus = oldRecord.GetString("manager_confirmed")
			}
			newStatus := e.Record.GetString("manager_confirmed")

			if oldStatus == "pending" && newStatus == "approved" {
				creatorId := e.Record.GetString("creator")
				amount := e.Record.GetFloat("amount")
				title := "销售收款已确认"
				message := fmt.Sprintf("经理已确认您的销售收款登记，收款金额：%.2f", amount)

				log.Printf("[SaleReceipt] Sending notification to %s: %s\n", creatorId, title)
				if err := CreateNotification02(app, "manager_confirm", title, message, creatorId, ""); err != nil {
					log.Printf("[SaleReceipt] Failed to send notification: %v\n", err)
				}
			}

			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterDeleteSuccess("sale_receipts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			contractId := e.Record.GetString("sales_contract")
			if contractId == "" {
				log.Println("[SaleReceipt] sales_contract is empty")
				return e.Next()
			}

			contract, err := GetRecordById(app, "sales_contracts", contractId)
			if err != nil {
				log.Printf("[SaleReceipt] Failed to get contract %s: %v\n", contractId, err)
				return e.Next()
			}

			receipts, err := GetRecordsByField(app, "sale_receipts", "sales_contract", contractId)
			if err != nil {
				log.Printf("[SaleReceipt] Failed to get receipts: %v\n", err)
				receipts = []*core.Record{}
			}

			totalAmount := SumField(receipts, "amount")
			receivableAmount := contract.GetFloat("executed_quantity") * contract.GetFloat("unit_price")
			var receiptPercent, debtAmount, debtPercent float64

			if receivableAmount > 0 {
				receiptPercent = (totalAmount / receivableAmount) * 100
				debtAmount = receivableAmount - totalAmount
				debtPercent = (totalAmount / receivableAmount) * 100
			}

			contract.Set("receipted_amount", totalAmount)
			contract.Set("receipt_percent", receiptPercent)
			contract.Set("debt_amount", debtAmount)
			contract.Set("debt_percent", debtPercent)

			return updateSalesContractStatus(app, contract)
		},
		Priority: 0,
	})
}
