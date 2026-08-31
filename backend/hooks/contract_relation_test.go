package hooks

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestValidateRelationChange(t *testing.T) {
	tests := []struct {
		name        string
		current     string
		requested   string
		isManager   bool
		expectedErr error
	}{
		{name: "unchanged is allowed", current: "sales-a", requested: "sales-a"},
		{name: "manager links empty field", requested: "sales-a", isManager: true},
		{name: "staff cannot link", requested: "sales-a", expectedErr: errRelationManagerRequired},
		{name: "occupied field cannot be overwritten", current: "sales-a", requested: "sales-b", isManager: true, expectedErr: errRelationAlreadyOccupied},
		{name: "manager can clear an occupied field", current: "sales-a", isManager: true},
		{name: "staff cannot clear an occupied field", current: "sales-a", expectedErr: errRelationManagerRequired},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateRelationChange(test.current, test.requested, test.isManager)
			if !errors.Is(err, test.expectedErr) {
				t.Fatalf("want %v, got %v", test.expectedErr, err)
			}
		})
	}
}

func TestCanRoleManageContractRelation(t *testing.T) {
	tests := []struct {
		name       string
		collection string
		role       string
		superuser  bool
		want       bool
	}{
		{name: "sales manages sales relation", collection: "sales_contracts", role: "sales", want: true},
		{name: "sales cannot directly manage purchase relation", collection: "purchase_contracts", role: "sales"},
		{name: "purchasing manages purchase relation", collection: "purchase_contracts", role: "purchasing", want: true},
		{name: "purchasing cannot directly manage sales relation", collection: "sales_contracts", role: "purchasing"},
		{name: "manager manages either relation", collection: "purchase_contracts", role: "manager", want: true},
		{name: "superuser manages either relation", collection: "sales_contracts", superuser: true, want: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := canRoleManageContractRelation(test.collection, test.role, test.superuser); got != test.want {
				t.Fatalf("want %v, got %v", test.want, got)
			}
		})
	}
}

func TestLinkContractsSupportsStaffAndMultipleRelationDirections(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()

	salesOne := newDuplicateSalesContract(t, app, "")
	salesTwo := newDuplicateSalesContract(t, app, "")
	purchaseCollection, err := app.FindCollectionByNameOrId("purchase_contracts")
	if err != nil {
		t.Fatal(err)
	}
	newPurchase := func(no string) *core.Record {
		record := core.NewRecord(purchaseCollection)
		record.Set("no", no)
		record.Set("product_name", "硫酸亚铁")
		record.Set("supplier", "supplier-a")
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}
	purchaseOne := newPurchase("P-ONE")
	purchaseTwo := newPurchase("P-TWO")

	if err := linkContracts(app, salesOne.Id, purchaseOne.Id, "sales", "sales-user", false); err != nil {
		t.Fatal(err)
	}
	if err := linkContracts(app, salesOne.Id, purchaseTwo.Id, "purchasing", "purchase-user", false); err != nil {
		t.Fatal(err)
	}
	if err := linkContracts(app, salesTwo.Id, purchaseOne.Id, "sales", "sales-user", false); err != nil {
		t.Fatal(err)
	}

	purchaseOne, _ = app.FindRecordById("purchase_contracts", purchaseOne.Id)
	purchaseTwo, _ = app.FindRecordById("purchase_contracts", purchaseTwo.Id)
	salesTwo, _ = app.FindRecordById("sales_contracts", salesTwo.Id)
	if purchaseOne.GetString("sales_contract") != salesOne.Id {
		t.Fatalf("first purchase should point to first sales contract")
	}
	if purchaseTwo.GetString("sales_contract") != salesOne.Id {
		t.Fatalf("second purchase should support one sales to many purchases")
	}
	if salesTwo.GetString("purchase_contract") != purchaseOne.Id {
		t.Fatalf("second sales should support one purchase to many sales")
	}

	if err := linkContracts(app, salesOne.Id, purchaseOne.Id, "viewer", "viewer-user", false); !errors.Is(err, errRelationManagerRequired) {
		t.Fatalf("unauthorized role: want %v, got %v", errRelationManagerRequired, err)
	}
}
