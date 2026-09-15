package hooks

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestSalesProgressAlwaysComesFromChildRecords(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	contract := newDuplicateSalesContract(t, app, "")
	newSalesChild(t, app, "sales_shipments", contract.Id, map[string]any{"quantity": 3})
	newSalesChild(t, app, "sale_receipts", contract.Id, map[string]any{"amount": 25500})
	newSalesChild(t, app, "sale_invoices", contract.Id, map[string]any{"amount": 17000})

	contract.Set("unit_price", 9000)
	contract.Set("total_quantity", 12)
	contract.Set("total_amount", 108000)
	contract.Set("receipted_amount", 99999)
	contract.Set("invoiced_amount", 99999)
	if err := refreshContractProgressFields(app, "sales", contract); err != nil {
		t.Fatal(err)
	}

	assertProgressNumber(t, contract, "executed_quantity", 3)
	assertProgressNumber(t, contract, "receipted_amount", 25500)
	assertProgressNumber(t, contract, "invoiced_amount", 17000)
	assertProgressNumber(t, contract, "receipt_percent", 25500.0/27000.0*100)
	assertProgressNumber(t, contract, "invoice_percent", 17000.0/108000.0*100)
}

func TestPurchaseProgressAlwaysComesFromChildRecords(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	collection, err := app.FindCollectionByNameOrId("purchase_contracts")
	if err != nil {
		t.Fatal(err)
	}
	contract := core.NewRecord(collection)
	contract.Set("no", "PC-1")
	contract.Set("product_name", "白油")
	contract.Set("supplier", "supplier-a")
	contract.Set("unit_price", 5000)
	contract.Set("total_quantity", 10)
	contract.Set("total_amount", 50000)
	contract.Set("status", "executing")
	if err := app.Save(contract); err != nil {
		t.Fatal(err)
	}
	newPurchaseChild(t, app, "purchase_arrivals", contract.Id, map[string]any{"quantity": 4})
	newPurchaseChild(t, app, "purchase_invoices", contract.Id, map[string]any{"amount": 15000})
	newPurchaseChild(t, app, "purchase_payments", contract.Id, map[string]any{"amount": 12000})

	contract.Set("unit_price", 6000)
	contract.Set("total_amount", 60000)
	contract.Set("invoiced_amount", 1)
	contract.Set("paid_amount", 1)
	if err := refreshContractProgressFields(app, "purchase", contract); err != nil {
		t.Fatal(err)
	}

	assertProgressNumber(t, contract, "executed_quantity", 4)
	assertProgressNumber(t, contract, "invoiced_amount", 15000)
	assertProgressNumber(t, contract, "paid_amount", 12000)
	assertProgressNumber(t, contract, "invoiced_percent", 25)
	assertProgressNumber(t, contract, "paid_percent", 20)
}

func TestContractProgressDoesNotTreatMissingCollectionAsEmpty(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	contract := newDuplicateSalesContract(t, app, "")
	invoices, err := app.FindCollectionByNameOrId("sale_invoices")
	if err != nil {
		t.Fatal(err)
	}
	if err := app.Delete(invoices); err != nil {
		t.Fatal(err)
	}
	contract.Set("invoiced_amount", 4321)

	if err := refreshContractProgressFields(app, "sales", contract); err == nil {
		t.Fatal("missing child collection must fail instead of overwriting progress with zero")
	}
	assertProgressNumber(t, contract, "invoiced_amount", 4321)
}

func TestChildMoveRefreshesOldAndNewContracts(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()
	RegisterSalesShipmentHooks(app)

	oldContract := newDuplicateSalesContract(t, app, "")
	newContract := newDuplicateSalesContract(t, app, "")
	shipment := newSalesChild(t, app, "sales_shipments", oldContract.Id, map[string]any{"quantity": 3})
	shipment, err := app.FindRecordById("sales_shipments", shipment.Id)
	if err != nil {
		t.Fatal(err)
	}

	shipment.Set("sales_contract", newContract.Id)
	if err := app.Save(shipment); err != nil {
		t.Fatal(err)
	}
	reloadedShipment, err := app.FindRecordById("sales_shipments", shipment.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := reloadedShipment.GetString("sales_contract"); got != newContract.Id {
		t.Fatalf("shipment relation: want %s, got %s", newContract.Id, got)
	}

	oldContract, _ = app.FindRecordById("sales_contracts", oldContract.Id)
	newContract, _ = app.FindRecordById("sales_contracts", newContract.Id)
	assertProgressNumber(t, oldContract, "executed_quantity", 0)
	assertProgressNumber(t, newContract, "executed_quantity", 3)
}

func assertProgressNumber(t testing.TB, record *core.Record, field string, want float64) {
	t.Helper()
	got := record.GetFloat(field)
	delta := got - want
	if delta < 0 {
		delta = -delta
	}
	if delta > 0.000001 {
		t.Fatalf("%s: want %v, got %v", field, want, got)
	}
}
