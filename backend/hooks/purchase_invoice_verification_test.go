package hooks

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

const verificationRouteRecordID = "verifyinvoice01"

func newPurchaseInvoiceVerificationRouteTestApp(t testing.TB, headers map[string]string) *tests.TestApp {
	t.Helper()
	app := newContractOperationsTestApp(t)

	contracts, err := app.FindCollectionByNameOrId("purchase_contracts")
	if err != nil {
		t.Fatal(err)
	}
	contract := core.NewRecord(contracts)
	contract.Set("no", "CG-VERIFY-01")
	contract.Set("product_name", "凡士林脂")
	contract.Set("supplier", "supplier-a")
	contract.Set("total_quantity", 10)
	contract.Set("total_amount", 100000)
	contract.Set("status", "executing")
	if err := app.Save(contract); err != nil {
		t.Fatal(err)
	}

	invoices, err := app.FindCollectionByNameOrId("purchase_invoices")
	if err != nil {
		t.Fatal(err)
	}
	invoice := core.NewRecord(invoices)
	invoice.Id = verificationRouteRecordID
	invoice.Set("purchase_contract", contract.Id)
	invoice.Set("no", "PI-VERIFY-01")
	invoice.Set("product_name", "凡士林脂")
	invoice.Set("manager_confirmed", "approved")
	invoice.Set("is_verified", "no")
	invoice.Set("product_amount", 10)
	invoice.Set("amount", 100000)
	if err := app.Save(invoice); err != nil {
		t.Fatal(err)
	}

	authRecords, err := app.FindAllRecords("users")
	if err != nil || len(authRecords) == 0 {
		t.Fatalf("load auth record: records=%d err=%v", len(authRecords), err)
	}
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	if users.Fields.GetByName("type") == nil {
		users.Fields.Add(&core.TextField{Name: "type"})
	}
	if users.Fields.GetByName("user_name") == nil {
		users.Fields.Add(&core.TextField{Name: "user_name"})
	}
	if err := app.Save(users); err != nil {
		t.Fatal(err)
	}
	authRecord, err := app.FindRecordById("users", authRecords[0].Id)
	if err != nil {
		t.Fatal(err)
	}
	authRecord.Set("type", "manager")
	authRecord.Set("user_name", "管理甲")
	if err := app.Save(authRecord); err != nil {
		t.Fatal(err)
	}
	if authRecord.GetString("type") != "manager" {
		t.Fatalf("manager auth fixture has type %q", authRecord.GetString("type"))
	}
	token, err := authRecord.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	headers["Authorization"] = token

	RegisterPurchaseInvoiceHooks(app)
	RegisterPurchaseInvoiceVerificationRoutes(app)
	return app
}

func TestPurchaseInvoiceVerificationRouteUpdatesApprovedInvoiceWithoutReconfirming(t *testing.T) {
	headers := map[string]string{}
	scenario := tests.ApiScenario{
		Name:           "manager verifies an already approved purchase invoice",
		Method:         http.MethodPost,
		URL:            "/api/erp/purchase-invoice-verifications",
		Body:           strings.NewReader(`{"recordId":"verifyinvoice01","status":"yes"}`),
		Headers:        headers,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"status":"yes"`,
			`"managerConfirmed":"approved"`,
			`"changed":true`,
		},
		TestAppFactory: func(tb testing.TB) *tests.TestApp {
			return newPurchaseInvoiceVerificationRouteTestApp(tb, headers)
		},
		AfterTestFunc: func(tb testing.TB, app *tests.TestApp, _ *http.Response) {
			invoice, err := app.FindRecordById("purchase_invoices", verificationRouteRecordID)
			if err != nil {
				tb.Fatal(err)
			}
			if invoice.GetString("is_verified") != "yes" {
				t.Fatalf("verification status: want yes, got %q", invoice.GetString("is_verified"))
			}
			if invoice.GetString("manager_confirmed") != "approved" {
				t.Fatalf("manager confirmation changed unexpectedly: %q", invoice.GetString("manager_confirmed"))
			}

			logs, err := app.FindRecordsByFilter(
				"contract_operation_logs",
				"record_id = {:id} && operation = 'verify_invoice'",
				"",
				0,
				0,
				map[string]any{"id": verificationRouteRecordID},
			)
			if err != nil || len(logs) != 1 {
				t.Fatalf("verification audit log: records=%d err=%v", len(logs), err)
			}
			if logs[0].GetString("operator_name") != "管理甲" || logs[0].GetString("result") != "success" {
				t.Fatalf("unexpected verification audit: %#v", logs[0].FieldsData())
			}
		},
	}
	scenario.Test(t)
}
