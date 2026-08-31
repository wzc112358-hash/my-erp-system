package hooks

import (
	"errors"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func newInventoryTestApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}

	inventory := core.NewBaseCollection("inventory")
	inventory.Fields.Add(
		&core.TextField{Name: "product_name", Required: true},
		&core.NumberField{Name: "remaining_quantity"},
		&core.NumberField{Name: "total_in_quantity"},
		&core.NumberField{Name: "total_out_quantity"},
		&core.DateField{Name: "last_in_date"},
		&core.DateField{Name: "last_out_date"},
	)
	if err := app.Save(inventory); err != nil {
		app.Cleanup()
		t.Fatal(err)
	}

	movements := core.NewBaseCollection("stock_movements")
	movements.Fields.Add(
		&core.RelationField{Name: "inventory", CollectionId: inventory.Id, MaxSelect: 1, Required: true},
		&core.SelectField{Name: "movement_type", Values: []string{"in", "out"}, MaxSelect: 1, Required: true},
		&core.NumberField{Name: "quantity", Required: true},
	)
	if err := app.Save(movements); err != nil {
		app.Cleanup()
		t.Fatal(err)
	}
	return app
}

func newInventoryTestRecord(t *testing.T, app core.App, remaining float64) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("inventory")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("product_name", "事务测试商品")
	record.Set("remaining_quantity", remaining)
	record.Set("total_in_quantity", 0)
	record.Set("total_out_quantity", 0)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func newMovementTestRecord(t *testing.T, app core.App, inventoryID, movementType string, quantity float64) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("stock_movements")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("inventory", inventoryID)
	record.Set("movement_type", movementType)
	record.Set("quantity", quantity)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func TestRecalculateInventoryPreservesOpeningStock(t *testing.T) {
	app := newInventoryTestApp(t)
	defer app.Cleanup()

	inventory := newInventoryTestRecord(t, app, 5)
	newMovementTestRecord(t, app, inventory.Id, "in", 10)
	newMovementTestRecord(t, app, inventory.Id, "out", 3)

	if err := recalculateInventory(app, inventory.Id); err != nil {
		t.Fatal(err)
	}
	updated, err := app.FindRecordById("inventory", inventory.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := updated.GetFloat("remaining_quantity"); got != 12 {
		t.Fatalf("remaining_quantity: want 12, got %v", got)
	}
	if got := updated.GetFloat("total_in_quantity"); got != 10 {
		t.Fatalf("total_in_quantity: want 10, got %v", got)
	}
	if got := updated.GetFloat("total_out_quantity"); got != 3 {
		t.Fatalf("total_out_quantity: want 3, got %v", got)
	}
}

func TestInsufficientMovementRollsBackTransaction(t *testing.T) {
	app := newInventoryTestApp(t)
	defer app.Cleanup()

	inventory := newInventoryTestRecord(t, app, 2)
	err := app.RunInTransaction(func(txApp core.App) error {
		newMovementTestRecord(t, txApp, inventory.Id, "out", 3)
		return recalculateInventory(txApp, inventory.Id)
	})
	if !errors.Is(err, errInsufficientInventory) {
		t.Fatalf("expected insufficient inventory error, got %v", err)
	}

	movements, err := app.FindRecordsByFilter(
		"stock_movements",
		"inventory = {:inventory}",
		"",
		0,
		0,
		dbx.Params{"inventory": inventory.Id},
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, movement := range movements {
		if movement.GetString("inventory") == inventory.Id {
			t.Fatalf("movement %s was not rolled back", movement.Id)
		}
	}
	updated, err := app.FindRecordById("inventory", inventory.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := updated.GetFloat("remaining_quantity"); got != 2 {
		t.Fatalf("remaining_quantity after rollback: want 2, got %v", got)
	}
}
