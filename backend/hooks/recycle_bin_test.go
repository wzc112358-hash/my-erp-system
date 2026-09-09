package hooks

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestAuditOperatorPrefersUserNameAndFallsBackToName(t *testing.T) {
	users := core.NewBaseCollection("users")
	users.Fields.Add(
		&core.TextField{Name: "user_name"},
		&core.TextField{Name: "name"},
		&core.TextField{Name: "email"},
		&core.TextField{Name: "type"},
	)
	user := core.NewRecord(users)
	user.Id = "employee-a"
	user.Set("user_name", "销售甲")
	user.Set("name", "旧姓名")
	user.Set("email", "employee@example.com")
	user.Set("type", "sales")

	id, name, role := auditOperator(user)
	if id != "employee-a" || name != "销售甲" || role != "sales" {
		t.Fatalf("unexpected operator: id=%q name=%q role=%q", id, name, role)
	}

	user.Set("user_name", "")
	_, name, _ = auditOperator(user)
	if name != "旧姓名" {
		t.Fatalf("name fallback: want %q, got %q", "旧姓名", name)
	}
}

func TestDuplicateContractNumberValidationDoesNotChangeExistingRecords(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	existing := newDuplicateSalesContract(t, app, "")
	config, ok := auditConfigForCollection("sales_contracts")
	if !ok {
		t.Fatal("sales contract audit configuration missing")
	}

	if err := validateNewContractNumber(app, config, "  lzx 2507057  "); err == nil {
		t.Fatal("normalized duplicate contract number was accepted")
	}
	if err := validateNewContractNumber(app, config, "LZX2507058"); err != nil {
		t.Fatalf("unique contract number was rejected: %v", err)
	}

	preserved, err := app.FindRecordById("sales_contracts", existing.Id)
	if err != nil {
		t.Fatal(err)
	}
	if preserved.GetString("no") != "LZX2507057" || preserved.GetString("deleted_at") != "" {
		t.Fatal("duplicate validation changed the existing contract")
	}
}

func TestSoftDeleteAndRestoreChildRecalculatesContract(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	contract := newDuplicateSalesContract(t, app, "")
	shipment := newSalesChild(t, app, "sales_shipments", contract.Id, map[string]any{"quantity": 3})
	if err := recalculateMergedContract(app, "sales", contract); err != nil {
		t.Fatal(err)
	}

	batchID, err := softDeleteBusinessRecord(app, "sales_shipments", shipment.Id, "sales-a", "销售甲", "sales")
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(batchID) == "" {
		t.Fatal("missing recycle batch id")
	}
	recycled, err := app.FindRecordById("sales_shipments", shipment.Id)
	if err != nil || recycled.GetString("deleted_at") == "" {
		t.Fatal("shipment was not retained in recycle bin")
	}
	afterDelete, _ := app.FindRecordById("sales_contracts", contract.Id)
	if got := afterDelete.GetFloat("executed_quantity"); got != 0 {
		t.Fatalf("executed quantity after recycle: want 0, got %v", got)
	}

	if err := restoreRecycleBatch(app, batchID, "manager-a", "经理甲", "manager"); err != nil {
		t.Fatal(err)
	}
	restored, err := app.FindRecordById("sales_shipments", shipment.Id)
	if err != nil || restored.GetString("deleted_at") != "" || restored.GetString("delete_batch_id") != "" {
		t.Fatal("shipment was not restored")
	}
	afterRestore, _ := app.FindRecordById("sales_contracts", contract.Id)
	if got := afterRestore.GetFloat("executed_quantity"); got != 3 {
		t.Fatalf("executed quantity after restore: want 3, got %v", got)
	}

	logs, err := app.FindRecordsByFilter("contract_operation_logs", "record_id = {:record}", "", 0, 0, map[string]any{"record": shipment.Id})
	if err != nil {
		t.Fatal(err)
	}
	operations := map[string]bool{}
	for _, entry := range logs {
		operations[entry.GetString("operation")] = true
	}
	if len(logs) != 2 || !operations["soft_delete"] || !operations["restore_record"] {
		t.Fatalf("unexpected recycle audit trail: %#v", logs)
	}
}

func TestSoftDeleteContractPreservesAttachmentAndRestoresBatch(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	contract := newDuplicateSalesContract(t, app, "contract.pdf")
	shipment := newSalesChild(t, app, "sales_shipments", contract.Id, map[string]any{"quantity": 2})
	attachments := contract.GetStringSlice("attachments")
	if len(attachments) != 1 {
		t.Fatal("test attachment was not saved")
	}

	batchID, err := softDeleteBusinessRecord(app, "sales_contracts", contract.Id, "manager-a", "经理甲", "manager")
	if err != nil {
		t.Fatal(err)
	}
	recycledContract, _ := app.FindRecordById("sales_contracts", contract.Id)
	recycledShipment, _ := app.FindRecordById("sales_shipments", shipment.Id)
	if recycledContract.GetString("delete_batch_id") != batchID || recycledShipment.GetString("delete_batch_id") != batchID {
		t.Fatal("contract and child were not recycled atomically")
	}
	if got := recycledContract.GetStringSlice("attachments"); len(got) != 1 || got[0] != attachments[0] {
		t.Fatal("contract attachment reference changed during recycle")
	}
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatal(err)
	}
	defer fsys.Close()
	reader, err := fsys.GetReader(recycledContract.BaseFilesPath() + "/" + attachments[0])
	if err != nil {
		t.Fatalf("contract attachment was removed: %v", err)
	}
	reader.Close()

	if err := restoreRecycleBatch(app, batchID, "manager-a", "经理甲", "manager"); err != nil {
		t.Fatal(err)
	}
	restoredContract, _ := app.FindRecordById("sales_contracts", contract.Id)
	restoredShipment, _ := app.FindRecordById("sales_shipments", shipment.Id)
	if restoredContract.GetString("deleted_at") != "" || restoredShipment.GetString("deleted_at") != "" {
		t.Fatal("contract recycle batch was not fully restored")
	}
}
