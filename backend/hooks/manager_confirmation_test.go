package hooks

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestConfirmBusinessRecordUpdatesStatusAndWritesAuditLog(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	contract := newDuplicateSalesContract(t, app, "")
	invoice := newSalesChild(t, app, "sale_invoices", contract.Id, map[string]any{
		"manager_confirmed": "pending",
		"amount":            3200,
	})

	result, err := confirmBusinessRecord(app, "sale_invoices", invoice.Id, "approved", "manager-a", "经理甲", "manager")
	if err != nil {
		t.Fatal(err)
	}
	if !result.Changed || result.Status != "approved" {
		t.Fatalf("unexpected result: %#v", result)
	}

	updated, err := app.FindRecordById("sale_invoices", invoice.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := updated.GetString("manager_confirmed"); got != "approved" {
		t.Fatalf("confirmation status: want approved, got %q", got)
	}

	logs, err := app.FindRecordsByFilter("contract_operation_logs", "record_id = {:record}", "", 0, 0, map[string]any{"record": invoice.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs: want 1, got %d", len(logs))
	}
	entry := logs[0]
	if entry.GetString("operation") != "confirm_record" || entry.GetString("result") != "success" {
		t.Fatalf("unexpected audit operation: operation=%q result=%q", entry.GetString("operation"), entry.GetString("result"))
	}
	if entry.GetString("operator_name") != "经理甲" || entry.GetString("source_contract_no") != contract.GetString("no") {
		t.Fatalf("unexpected audit identity: operator=%q contract=%q", entry.GetString("operator_name"), entry.GetString("source_contract_no"))
	}
}

func TestConfirmBusinessRecordSupportsStandalonePurchaseAndIdempotentRetry(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	purchases, err := app.FindCollectionByNameOrId("purchase_contracts")
	if err != nil {
		t.Fatal(err)
	}
	contract := core.NewRecord(purchases)
	contract.Set("no", "CG-2026-09-01")
	contract.Set("product_name", "抗静电剂163")
	contract.Set("supplier", "supplier-a")
	contract.Set("total_quantity", 4.68)
	if err := app.Save(contract); err != nil {
		t.Fatal(err)
	}
	arrival := newPurchaseChild(t, app, "purchase_arrivals", contract.Id, map[string]any{
		"manager_confirmed": "pending",
		"quantity":          4.68,
	})

	first, err := confirmBusinessRecord(app, "purchase_arrivals", arrival.Id, "rejected", "manager-b", "经理乙", "manager")
	if err != nil || !first.Changed {
		t.Fatalf("first rejection failed: result=%#v err=%v", first, err)
	}
	second, err := confirmBusinessRecord(app, "purchase_arrivals", arrival.Id, "rejected", "manager-b", "经理乙", "manager")
	if err != nil {
		t.Fatalf("idempotent retry failed: %v", err)
	}
	if second.Changed {
		t.Fatal("idempotent retry unexpectedly changed the record")
	}
	if _, err := confirmBusinessRecord(app, "purchase_arrivals", arrival.Id, "approved", "manager-b", "经理乙", "manager"); !errors.Is(err, errConfirmationAlreadyResolved) {
		t.Fatalf("opposite decision after rejection: got %v", err)
	}

	logs, err := app.FindRecordsByFilter("contract_operation_logs", "record_id = {:record}", "", 0, 0, map[string]any{"record": arrival.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 3 {
		t.Fatalf("unexpected retry audit trail: %#v", logs)
	}
	successfulRejections := 0
	failedConfirmations := 0
	for _, entry := range logs {
		if entry.GetString("operation") == "reject_record" && entry.GetString("result") == "success" {
			successfulRejections++
		}
		if entry.GetString("operation") == "confirm_record" && entry.GetString("result") == "failed" {
			failedConfirmations++
		}
	}
	if successfulRejections != 2 || failedConfirmations != 1 {
		t.Fatalf("unexpected confirmation results: rejected=%d failedConfirmations=%d", successfulRejections, failedConfirmations)
	}
}

func TestConfirmBusinessRecordRejectsUnsupportedRequests(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	if _, err := confirmBusinessRecord(app, "sales_shipments", "record-a", "approved", "manager-a", "经理甲", "manager"); !errors.Is(err, errUnsupportedConfirmationCollection) {
		t.Fatalf("unsupported collection: got %v", err)
	}
	if _, err := confirmBusinessRecord(app, "sale_invoices", "record-a", "pending", "manager-a", "经理甲", "manager"); !errors.Is(err, errInvalidConfirmationDecision) {
		t.Fatalf("invalid decision: got %v", err)
	}
}
