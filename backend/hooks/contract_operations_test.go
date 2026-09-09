package hooks

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func newContractOperationsTestApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	recycleFields := func() []core.Field {
		return []core.Field{
			&core.DateField{Name: "deleted_at"},
			&core.TextField{Name: "deleted_by"},
			&core.TextField{Name: "delete_batch_id"},
		}
	}

	sales := core.NewBaseCollection("sales_contracts")
	sales.Fields.Add(
		&core.TextField{Name: "no", Required: true},
		&core.TextField{Name: "product_name", Required: true},
		&core.TextField{Name: "customer", Required: true},
		&core.NumberField{Name: "unit_price"},
		&core.NumberField{Name: "total_quantity"},
		&core.NumberField{Name: "total_amount"},
		&core.BoolField{Name: "is_cross_border"},
		&core.BoolField{Name: "is_price_excluding_tax"},
		&core.NumberField{Name: "executed_quantity"},
		&core.NumberField{Name: "execution_percent"},
		&core.NumberField{Name: "receipted_amount"},
		&core.NumberField{Name: "receipt_percent"},
		&core.NumberField{Name: "debt_amount"},
		&core.NumberField{Name: "debt_percent"},
		&core.NumberField{Name: "invoiced_amount"},
		&core.NumberField{Name: "invoice_percent"},
		&core.NumberField{Name: "uninvoiced_amount"},
		&core.NumberField{Name: "uninvoiced_percent"},
		&core.TextField{Name: "status"},
		&core.FileField{Name: "attachments", MaxSelect: 99, MaxSize: 100 * 1024 * 1024},
	)
	sales.Fields.Add(recycleFields()...)
	if err := app.Save(sales); err != nil {
		app.Cleanup()
		t.Fatal(err)
	}

	purchases := core.NewBaseCollection("purchase_contracts")
	purchases.Fields.Add(
		&core.TextField{Name: "no", Required: true},
		&core.TextField{Name: "product_name", Required: true},
		&core.TextField{Name: "supplier", Required: true},
		&core.NumberField{Name: "unit_price"},
		&core.NumberField{Name: "total_quantity"},
		&core.NumberField{Name: "total_amount"},
		&core.RelationField{Name: "sales_contract", CollectionId: sales.Id, MaxSelect: 1},
	)
	purchases.Fields.Add(recycleFields()...)
	if err := app.Save(purchases); err != nil {
		app.Cleanup()
		t.Fatal(err)
	}

	sales.Fields.Add(&core.RelationField{Name: "purchase_contract", CollectionId: purchases.Id, MaxSelect: 1})
	if err := app.Save(sales); err != nil {
		app.Cleanup()
		t.Fatal(err)
	}

	addSalesChild := func(name string, fields ...core.Field) {
		collection := core.NewBaseCollection(name)
		collection.Fields.Add(&core.RelationField{Name: "sales_contract", CollectionId: sales.Id, MaxSelect: 1})
		collection.Fields.Add(&core.TextField{Name: "manager_confirmed"})
		collection.Fields.Add(fields...)
		collection.Fields.Add(recycleFields()...)
		if err := app.Save(collection); err != nil {
			app.Cleanup()
			t.Fatal(err)
		}
	}
	addSalesChild("sales_shipments", &core.NumberField{Name: "quantity"})
	addSalesChild("sale_receipts", &core.NumberField{Name: "product_amount"}, &core.NumberField{Name: "amount"})
	addSalesChild("sale_invoices", &core.NumberField{Name: "product_amount"}, &core.NumberField{Name: "amount"})
	addSalesChild("bidding_records", &core.TextField{Name: "title"})
	saleInvoices, _ := app.FindCollectionByNameOrId("sale_invoices")
	saleInvoices.Fields.Add(&core.RelationField{Name: "purchase_contract", CollectionId: purchases.Id, MaxSelect: 1})
	if err := app.Save(saleInvoices); err != nil {
		app.Cleanup()
		t.Fatal(err)
	}

	addPurchaseChild := func(name string, fields ...core.Field) {
		collection := core.NewBaseCollection(name)
		collection.Fields.Add(&core.RelationField{Name: "purchase_contract", CollectionId: purchases.Id, MaxSelect: 1})
		collection.Fields.Add(&core.RelationField{Name: "sales_contract", CollectionId: sales.Id, MaxSelect: 1})
		collection.Fields.Add(&core.TextField{Name: "manager_confirmed"})
		collection.Fields.Add(fields...)
		collection.Fields.Add(recycleFields()...)
		if err := app.Save(collection); err != nil {
			app.Cleanup()
			t.Fatal(err)
		}
	}
	addPurchaseChild("purchase_arrivals", &core.NumberField{Name: "quantity"})
	addPurchaseChild("purchase_invoices", &core.NumberField{Name: "product_amount"}, &core.NumberField{Name: "amount"})
	addPurchaseChild("purchase_payments", &core.NumberField{Name: "product_amount"}, &core.NumberField{Name: "amount"})

	auditLogs := core.NewBaseCollection("contract_operation_logs")
	auditLogs.Fields.Add(
		&core.TextField{Name: "operation"},
		&core.TextField{Name: "contract_type"},
		&core.TextField{Name: "operator_id"},
		&core.TextField{Name: "source_contract_id"},
		&core.TextField{Name: "source_contract_no"},
		&core.TextField{Name: "target_contract_id"},
		&core.TextField{Name: "target_contract_no"},
		&core.TextField{Name: "details", Max: 200000},
		&core.TextField{Name: "collection_name"},
		&core.TextField{Name: "record_id"},
		&core.TextField{Name: "record_snapshot", Max: 200000},
		&core.TextField{Name: "result"},
		&core.TextField{Name: "operator_name"},
		&core.TextField{Name: "operator_role"},
		&core.TextField{Name: "error_message", Max: 200000},
		&core.TextField{Name: "delete_batch_id"},
	)
	if err := app.Save(auditLogs); err != nil {
		app.Cleanup()
		t.Fatal(err)
	}

	return app
}

func newDuplicateSalesContract(t *testing.T, app core.App, attachmentName string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("sales_contracts")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("no", "LZX2507057")
	record.Set("product_name", "硫酸亚铁")
	record.Set("customer", "customer-a")
	record.Set("unit_price", 8500)
	record.Set("total_quantity", 12)
	record.Set("total_amount", 102000)
	record.Set("status", "executing")
	if attachmentName != "" {
		file, fileErr := filesystem.NewFileFromBytes([]byte(attachmentName), attachmentName)
		if fileErr != nil {
			t.Fatal(fileErr)
		}
		record.Set("attachments", []*filesystem.File{file})
	}
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func newSalesChild(t *testing.T, app core.App, collectionName, contractID string, values map[string]any) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("sales_contract", contractID)
	for key, value := range values {
		record.Set(key, value)
	}
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func newPurchaseChild(t *testing.T, app core.App, collectionName, contractID string, values map[string]any) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("purchase_contract", contractID)
	for key, value := range values {
		record.Set(key, value)
	}
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func TestMergeDuplicateSalesContractsPreservesChildrenAndAttachments(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	target := newDuplicateSalesContract(t, app, "target.pdf")
	source := newDuplicateSalesContract(t, app, "source.pdf")
	purchaseCollection, _ := app.FindCollectionByNameOrId("purchase_contracts")
	linkedPurchase := core.NewRecord(purchaseCollection)
	linkedPurchase.Set("no", "P-OUTGOING")
	linkedPurchase.Set("product_name", "硫酸亚铁")
	linkedPurchase.Set("supplier", "supplier-a")
	if err := app.Save(linkedPurchase); err != nil {
		t.Fatal(err)
	}
	source.Set("purchase_contract", linkedPurchase.Id)
	if err := app.Save(source); err != nil {
		t.Fatal(err)
	}
	newSalesChild(t, app, "sales_shipments", target.Id, map[string]any{"quantity": 9})
	movedShipment := newSalesChild(t, app, "sales_shipments", source.Id, map[string]any{"quantity": 3})
	newSalesChild(t, app, "sale_receipts", target.Id, map[string]any{"product_amount": 9, "amount": 76500})
	newSalesChild(t, app, "sale_receipts", source.Id, map[string]any{"product_amount": 3, "amount": 25500})
	newSalesChild(t, app, "sale_invoices", target.Id, map[string]any{"product_amount": 9, "amount": 76500})
	newSalesChild(t, app, "sale_invoices", source.Id, map[string]any{"product_amount": 3, "amount": 25500})

	result, err := mergeDuplicateContracts(app, "sales", source.Id, target.Id)
	if err != nil {
		t.Fatal(err)
	}
	if result.MovedCounts["sales_shipments"] != 1 {
		t.Fatalf("expected one moved shipment, got %#v", result.MovedCounts)
	}
	if _, err := app.FindRecordById("sales_contracts", source.Id); err == nil {
		t.Fatal("source duplicate still exists")
	}
	moved, err := app.FindRecordById("sales_shipments", movedShipment.Id)
	if err != nil {
		t.Fatal(err)
	}
	if moved.GetString("sales_contract") != target.Id {
		t.Fatalf("shipment relation: want %s, got %s", target.Id, moved.GetString("sales_contract"))
	}
	merged, err := app.FindRecordById("sales_contracts", target.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := merged.GetFloat("executed_quantity"); got != 12 {
		t.Fatalf("executed_quantity: want 12, got %v", got)
	}
	if got := merged.GetFloat("receipt_percent"); got != 100 {
		t.Fatalf("receipt_percent: want 100, got %v", got)
	}
	if got := merged.GetFloat("invoice_percent"); got != 100 {
		t.Fatalf("invoice_percent: want 100, got %v", got)
	}
	if got := len(merged.GetStringSlice("attachments")); got != 2 {
		t.Fatalf("attachments: want 2, got %d (%v)", got, merged.GetStringSlice("attachments"))
	}
	if got := merged.GetString("purchase_contract"); got != linkedPurchase.Id {
		t.Fatalf("outgoing purchase relation: want %s, got %s", linkedPurchase.Id, got)
	}
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatal(err)
	}
	defer fsys.Close()
	for _, filename := range merged.GetStringSlice("attachments") {
		if _, err := fsys.GetReader(merged.BaseFilesPath() + "/" + filename); err != nil {
			t.Fatalf("merged attachment %s is missing: %v", filename, err)
		}
	}
}

func TestMergeRejectsContractsWithDifferentNumbers(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	target := newDuplicateSalesContract(t, app, "")
	source := newDuplicateSalesContract(t, app, "")
	source.Set("no", "LZX2507058")
	if err := app.Save(source); err != nil {
		t.Fatal(err)
	}

	_, err := mergeDuplicateContracts(app, "sales", source.Id, target.Id)
	if err != errContractsNotDuplicates {
		t.Fatalf("want duplicate validation error, got %v", err)
	}
	if _, err := app.FindRecordById("sales_contracts", source.Id); err != nil {
		t.Fatal("source was changed despite rejected merge")
	}
}

func TestUnlinkAndDeleteClearsContractRelation(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	sales := newDuplicateSalesContract(t, app, "")
	purchaseCollection, _ := app.FindCollectionByNameOrId("purchase_contracts")
	purchase := core.NewRecord(purchaseCollection)
	purchase.Set("no", "P-1")
	purchase.Set("product_name", "硫酸亚铁")
	purchase.Set("supplier", "supplier-a")
	purchase.Set("sales_contract", sales.Id)
	if err := app.Save(purchase); err != nil {
		t.Fatal(err)
	}

	if err := unlinkAndDeleteContract(app, "sales", sales.Id); err != nil {
		t.Fatal(err)
	}
	recycled, err := app.FindRecordById("sales_contracts", sales.Id)
	if err != nil || recycled.GetString("deleted_at") == "" {
		t.Fatal("sales contract was not retained in the recycle bin")
	}
	if recycled.GetString("purchase_contract") != "" {
		t.Fatal("recycled contract still has an outgoing relation")
	}
	preserved, err := app.FindRecordById("purchase_contracts", purchase.Id)
	if err != nil {
		t.Fatal(err)
	}
	if preserved.GetString("sales_contract") != "" {
		t.Fatalf("reverse relation was not cleared: %s", preserved.GetString("sales_contract"))
	}
}

func TestUnlinkAndDeleteCascadesOwnedChildrenAndAuditsSnapshots(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()
	app.OnRecordAfterDeleteSuccess("sales_shipments").BindFunc(func(e *core.RecordEvent) error {
		if isContractCascadeDelete(e.Context) {
			return e.Next()
		}
		_, err := e.App.FindRecordById("sales_contracts", e.Record.GetString("sales_contract"))
		return err
	})

	sales := newDuplicateSalesContract(t, app, "")
	shipment := newSalesChild(t, app, "sales_shipments", sales.Id, map[string]any{"quantity": 3})
	purchaseCollection, _ := app.FindCollectionByNameOrId("purchase_contracts")
	purchase := core.NewRecord(purchaseCollection)
	purchase.Set("no", "P-1")
	purchase.Set("product_name", "硫酸亚铁")
	purchase.Set("supplier", "supplier-a")
	purchase.Set("sales_contract", sales.Id)
	if err := app.Save(purchase); err != nil {
		t.Fatal(err)
	}

	if err := unlinkAndDeleteContract(app, "sales", sales.Id, "manager-a"); err != nil {
		t.Fatal(err)
	}
	recycledContract, err := app.FindRecordById("sales_contracts", sales.Id)
	if err != nil || recycledContract.GetString("deleted_at") == "" {
		t.Fatal("sales contract was not retained in the recycle bin")
	}
	recycledShipment, err := app.FindRecordById("sales_shipments", shipment.Id)
	if err != nil || recycledShipment.GetString("deleted_at") == "" {
		t.Fatal("owned shipment was not retained in the recycle bin")
	}
	if recycledShipment.GetString("delete_batch_id") != recycledContract.GetString("delete_batch_id") {
		t.Fatal("contract and child must share a recycle batch")
	}

	preserved, err := app.FindRecordById("purchase_contracts", purchase.Id)
	if err != nil {
		t.Fatal(err)
	}
	if preserved.GetString("sales_contract") != "" {
		t.Fatalf("reverse relation was not cleared: %s", preserved.GetString("sales_contract"))
	}

	logs, err := app.FindRecordsByFilter("contract_operation_logs", "", "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 2 {
		t.Fatalf("want child and contract audit logs, got %d", len(logs))
	}
	var childLogged, contractLogged bool
	for _, record := range logs {
		if record.GetString("operation") == "soft_delete" {
			if record.GetString("collection_name") == "sales_shipments" {
				childLogged =
					record.GetString("record_id") == shipment.Id &&
						record.GetString("operator_id") == "manager-a" &&
						strings.Contains(record.GetString("record_snapshot"), shipment.Id)
			}
			if record.GetString("collection_name") == "sales_contracts" {
				contractLogged = record.GetString("source_contract_id") == sales.Id &&
					record.GetString("operator_id") == "manager-a" &&
					strings.Contains(record.GetString("record_snapshot"), sales.Id)
			}
		}
	}
	if !childLogged || !contractLogged {
		t.Fatalf("incomplete audit logs: child=%v contract=%v", childLogged, contractLogged)
	}
}

func TestUnlinkAndDeletePurchaseCascadesOnlyPurchaseChildren(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	sales := newDuplicateSalesContract(t, app, "")
	purchaseCollection, _ := app.FindCollectionByNameOrId("purchase_contracts")
	purchase := core.NewRecord(purchaseCollection)
	purchase.Set("no", "LZC2502013-29")
	purchase.Set("product_name", "工业白油68号")
	purchase.Set("supplier", "supplier-a")
	purchase.Set("sales_contract", sales.Id)
	if err := app.Save(purchase); err != nil {
		t.Fatal(err)
	}
	sales.Set("purchase_contract", purchase.Id)
	if err := app.Save(sales); err != nil {
		t.Fatal(err)
	}

	arrival := newPurchaseChild(t, app, "purchase_arrivals", purchase.Id, map[string]any{"quantity": 3})
	purchaseInvoice := newPurchaseChild(t, app, "purchase_invoices", purchase.Id, map[string]any{"product_amount": 3, "amount": 3000})
	payment := newPurchaseChild(t, app, "purchase_payments", purchase.Id, map[string]any{"product_amount": 3, "amount": 3000})
	salesInvoice := newSalesChild(t, app, "sale_invoices", sales.Id, map[string]any{
		"purchase_contract": purchase.Id,
		"product_amount":    3,
		"amount":            3600,
	})

	if err := unlinkAndDeleteContract(app, "purchase", purchase.Id, "manager-b"); err != nil {
		t.Fatal(err)
	}
	for collection, id := range map[string]string{
		"purchase_arrivals": arrival.Id,
		"purchase_invoices": purchaseInvoice.Id,
		"purchase_payments": payment.Id,
	} {
		recycled, err := app.FindRecordById(collection, id)
		if err != nil || recycled.GetString("deleted_at") == "" {
			t.Fatalf("owned child %s was not retained in the recycle bin", collection)
		}
	}
	preservedSales, err := app.FindRecordById("sales_contracts", sales.Id)
	if err != nil {
		t.Fatal(err)
	}
	if preservedSales.GetString("purchase_contract") != "" {
		t.Fatalf("sales relation was not cleared: %s", preservedSales.GetString("purchase_contract"))
	}
	preservedInvoice, err := app.FindRecordById("sale_invoices", salesInvoice.Id)
	if err != nil {
		t.Fatal("sales invoice was incorrectly deleted")
	}
	if preservedInvoice.GetString("purchase_contract") != "" {
		t.Fatalf("sales invoice cross-reference was not cleared: %s", preservedInvoice.GetString("purchase_contract"))
	}

	logs, err := app.FindRecordsByFilter("contract_operation_logs", "", "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 4 {
		t.Fatalf("want three child logs and one contract log, got %d", len(logs))
	}
}
