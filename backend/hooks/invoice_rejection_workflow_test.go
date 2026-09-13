package hooks

import (
	"errors"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestRejectInvoiceRequiresReason(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	contract := newDuplicateSalesContract(t, app, "")
	invoice := newSalesChild(t, app, "sale_invoices", contract.Id, map[string]any{
		"manager_confirmed": "pending",
		"creator_user":      "sales-user",
		"is_verified":       "yes",
	})

	_, err := confirmBusinessRecordWithReason(app, "sale_invoices", invoice.Id, "rejected", "manager-a", "经理甲", "manager", "  ")
	if !errors.Is(err, errRejectionReasonRequired) {
		t.Fatalf("empty rejection reason: got %v", err)
	}

	updated, findErr := app.FindRecordById("sale_invoices", invoice.Id)
	if findErr != nil {
		t.Fatal(findErr)
	}
	if got := updated.GetString("manager_confirmed"); got != "pending" {
		t.Fatalf("status changed after rejected validation: got %q", got)
	}
}

func TestRejectInvoiceCreatesRoleSpecificNotification(t *testing.T) {
	tests := []struct {
		name                   string
		collection             string
		notificationCollection string
		otherNotifications     string
		purchase               bool
		creator                string
	}{
		{name: "sales", collection: "sale_invoices", notificationCollection: "notifications_02", otherNotifications: "notifications", creator: "sales-user"},
		{name: "purchasing", collection: "purchase_invoices", notificationCollection: "notifications", otherNotifications: "notifications_02", purchase: true, creator: "purchase-user"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			app := newContractOperationsTestApp(t)
			defer app.Cleanup()

			var invoiceID string
			if test.purchase {
				contracts, err := app.FindCollectionByNameOrId("purchase_contracts")
				if err != nil {
					t.Fatal(err)
				}
				contract := core.NewRecord(contracts)
				contract.Set("no", "CG-REJECT-01")
				contract.Set("product_name", "抗氧剂")
				contract.Set("supplier", "supplier-a")
				contract.Set("total_quantity", 2)
				contract.Set("total_amount", 20000)
				if err := app.Save(contract); err != nil {
					t.Fatal(err)
				}
				invoiceID = newPurchaseChild(t, app, test.collection, contract.Id, map[string]any{
					"no": "PI-01", "manager_confirmed": "pending", "creator_user": test.creator, "is_verified": "yes",
				}).Id
			} else {
				contract := newDuplicateSalesContract(t, app, "")
				invoiceID = newSalesChild(t, app, test.collection, contract.Id, map[string]any{
					"no": "SI-01", "manager_confirmed": "pending", "creator_user": test.creator, "is_verified": "yes",
				}).Id
			}

			const reason = "发票附件与号码不一致，请更换附件"
			result, err := confirmBusinessRecordWithReason(app, test.collection, invoiceID, "rejected", "manager-a", "经理甲", "manager", reason)
			if err != nil || !result.Changed {
				t.Fatalf("reject invoice: result=%#v err=%v", result, err)
			}

			invoice, err := app.FindRecordById(test.collection, invoiceID)
			if err != nil {
				t.Fatal(err)
			}
			if invoice.GetString("manager_confirmed") != "rejected" || invoice.GetString("rejection_reason") != reason || invoice.GetString("is_verified") != "no" {
				t.Fatalf("unexpected rejected invoice: status=%q reason=%q verified=%q", invoice.GetString("manager_confirmed"), invoice.GetString("rejection_reason"), invoice.GetString("is_verified"))
			}

			notifications, err := app.FindRecordsByFilter(test.notificationCollection, "record_id = {:id}", "", 0, 0, map[string]any{"id": invoiceID})
			if err != nil {
				t.Fatal(err)
			}
			if len(notifications) != 1 {
				t.Fatalf("notifications: want 1, got %d", len(notifications))
			}
			notification := notifications[0]
			if notification.GetString("recipient") != test.creator || notification.GetString("type") != "manager_rejected" || notification.GetString("record_collection") != test.collection || notification.GetString("rejection_reason") != reason || !strings.Contains(notification.GetString("message"), reason) {
				t.Fatalf("unexpected notification: %#v", notification.FieldsData())
			}
			other, err := app.FindAllRecords(test.otherNotifications)
			if err != nil {
				t.Fatal(err)
			}
			if len(other) != 0 {
				t.Fatalf("notification leaked into %s: %d", test.otherNotifications, len(other))
			}
		})
	}
}

func TestResubmitRejectedInvoiceReturnsToPendingAndWritesAudit(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	contract := newDuplicateSalesContract(t, app, "")
	invoice := newSalesChild(t, app, "sale_invoices", contract.Id, map[string]any{
		"no":                "SI-RESUBMIT-01",
		"manager_confirmed": "rejected",
		"creator_user":      "sales-user",
		"rejection_reason":  "附件模糊",
		"is_verified":       "yes",
	})

	result, err := resubmitInvoice(app, "sale_invoices", invoice.Id, "sales-user", "销售甲", "sales")
	if err != nil || !result.Changed || result.Status != "pending" {
		t.Fatalf("resubmit invoice: result=%#v err=%v", result, err)
	}

	updated, err := app.FindRecordById("sale_invoices", invoice.Id)
	if err != nil {
		t.Fatal(err)
	}
	if updated.GetString("manager_confirmed") != "pending" || updated.GetString("is_verified") != "no" || updated.GetString("rejection_reason") != "附件模糊" {
		t.Fatalf("unexpected resubmitted invoice: status=%q verified=%q reason=%q", updated.GetString("manager_confirmed"), updated.GetString("is_verified"), updated.GetString("rejection_reason"))
	}

	logs, err := app.FindRecordsByFilter("contract_operation_logs", "record_id = {:id} && operation = 'resubmit_record'", "", 0, 0, map[string]any{"id": invoice.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 || logs[0].GetString("operator_name") != "销售甲" || logs[0].GetString("result") != "success" {
		t.Fatalf("unexpected resubmission logs: %#v", logs)
	}

	confirmed, err := confirmBusinessRecordWithReason(app, "sale_invoices", invoice.Id, "approved", "manager-a", "经理甲", "manager", "")
	if err != nil || !confirmed.Changed {
		t.Fatalf("confirm resubmitted invoice: result=%#v err=%v", confirmed, err)
	}
	approved, err := app.FindRecordById("sale_invoices", invoice.Id)
	if err != nil {
		t.Fatal(err)
	}
	if approved.GetString("manager_confirmed") != "approved" || approved.GetString("rejection_reason") != "" {
		t.Fatalf("unexpected approved invoice: status=%q reason=%q", approved.GetString("manager_confirmed"), approved.GetString("rejection_reason"))
	}
}
