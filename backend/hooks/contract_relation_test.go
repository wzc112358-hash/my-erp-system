package hooks

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

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

	deals, err := app.FindRecordsByFilter("business_deals", "deleted_at = ''", "", 0, 0)
	if err != nil || len(deals) != 1 {
		t.Fatalf("want one overall deal, got %d (%v)", len(deals), err)
	}
	if got := deals[0].GetStringSlice("sales_contracts"); len(got) != 2 || !containsContractID(got, salesOne.Id) || !containsContractID(got, salesTwo.Id) {
		t.Fatalf("deal sales members not preserved: %v", got)
	}
	if got := deals[0].GetStringSlice("purchase_contracts"); len(got) != 2 || !containsContractID(got, purchaseOne.Id) || !containsContractID(got, purchaseTwo.Id) {
		t.Fatalf("deal purchase members not preserved: %v", got)
	}
	if purchaseOne.GetString("sales_contract") != "" || purchaseTwo.GetString("sales_contract") != "" || salesTwo.GetString("purchase_contract") != "" {
		t.Fatal("new links must not write the frozen legacy fields")
	}

	if err := linkContracts(app, salesOne.Id, purchaseOne.Id, "viewer", "viewer-user", false); !errors.Is(err, errRelationManagerRequired) {
		t.Fatalf("unauthorized role: want %v, got %v", errRelationManagerRequired, err)
	}
}

func TestLinkContractsRejectsImplicitMergeOfTwoOverallDeals(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()
	purchaseCollection, _ := app.FindCollectionByNameOrId("purchase_contracts")
	newPurchase := func(no string) *core.Record {
		record := core.NewRecord(purchaseCollection)
		record.Set("no", no)
		record.Set("product_name", "产品")
		record.Set("supplier", "supplier")
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}
	salesOne := newDuplicateSalesContract(t, app, "")
	salesTwo := newDuplicateSalesContract(t, app, "")
	purchaseOne := newPurchase("P-1")
	purchaseTwo := newPurchase("P-2")
	if err := linkContracts(app, salesOne.Id, purchaseOne.Id, "manager", "", false); err != nil {
		t.Fatal(err)
	}
	if err := linkContracts(app, salesTwo.Id, purchaseTwo.Id, "manager", "", false); err != nil {
		t.Fatal(err)
	}
	if err := linkContracts(app, salesOne.Id, purchaseTwo.Id, "manager", "", false); !errors.Is(err, errContractsBelongDifferentDeals) {
		t.Fatalf("want different-deal conflict, got %v", err)
	}
}

func TestRemoveContractArchivesDealWhenOnlyOneSideRemains(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()
	sales := newDuplicateSalesContract(t, app, "")
	purchaseCollection, _ := app.FindCollectionByNameOrId("purchase_contracts")
	purchase := core.NewRecord(purchaseCollection)
	purchase.Set("no", "P-1")
	purchase.Set("product_name", "产品")
	purchase.Set("supplier", "supplier")
	if err := app.Save(purchase); err != nil {
		t.Fatal(err)
	}
	if err := linkContracts(app, sales.Id, purchase.Id, "manager", "", false); err != nil {
		t.Fatal(err)
	}
	if err := removeContractFromBusinessDeal(app, "purchase", purchase.Id, "manager-user"); err != nil {
		t.Fatal(err)
	}
	active, err := activeBusinessDeals(app)
	if err != nil || len(active) != 0 {
		t.Fatalf("deal should be archived, active=%d err=%v", len(active), err)
	}
	if contractIsInBusinessDeal(app, "sales", sales.Id) || contractIsInBusinessDeal(app, "purchase", purchase.Id) {
		t.Fatal("both contracts should be independent after deal archival")
	}
}

func TestBusinessDealSnapshotsEffectiveProfitTaxRate(t *testing.T) {
	app := newContractOperationsTestApp(t)
	defer app.Cleanup()
	if err := createProfitTaxRate(app, 0.2, "2026-01-01 00:00:00.000Z", ""); err != nil {
		t.Fatal(err)
	}
	sales := newDuplicateSalesContract(t, app, "")
	sales.Set("sign_date", "2026-02-01 00:00:00.000Z")
	if err := app.Save(sales); err != nil {
		t.Fatal(err)
	}
	purchaseCollection, _ := app.FindCollectionByNameOrId("purchase_contracts")
	purchase := core.NewRecord(purchaseCollection)
	purchase.Set("no", "P-1")
	purchase.Set("product_name", "产品")
	purchase.Set("supplier", "supplier")
	purchase.Set("sign_date", "2026-02-02 00:00:00.000Z")
	if err := app.Save(purchase); err != nil {
		t.Fatal(err)
	}
	if err := linkContracts(app, sales.Id, purchase.Id, "manager", "", false); err != nil {
		t.Fatal(err)
	}
	deals, err := activeBusinessDeals(app)
	if err != nil || len(deals) != 1 {
		t.Fatalf("want one deal, got %d (%v)", len(deals), err)
	}
	if got := deals[0].GetFloat("tax_rate"); got != 0.2 {
		t.Fatalf("want rate snapshot 0.2, got %v", got)
	}
}
