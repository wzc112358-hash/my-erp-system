package hooks

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

const invoiceRouteRecordID = "apiinvoice00001"

func newInvoiceRouteTestApp(t testing.TB, status string, headers map[string]string) *tests.TestApp {
	t.Helper()
	app := newContractOperationsTestApp(t)
	contract := newDuplicateSalesContract(t, app, "")
	collection, err := app.FindCollectionByNameOrId("sale_invoices")
	if err != nil {
		t.Fatal(err)
	}
	invoice := core.NewRecord(collection)
	invoice.Id = invoiceRouteRecordID
	invoice.Set("sales_contract", contract.Id)
	invoice.Set("no", "SI-API-01")
	invoice.Set("product_name", "硫酸亚铁")
	invoice.Set("manager_confirmed", status)
	invoice.Set("creator_user", "sales-user")
	if status == "rejected" {
		invoice.Set("rejection_reason", "原附件不清晰")
	}
	if err := app.Save(invoice); err != nil {
		t.Fatal(err)
	}

	authRecords, err := app.FindAllRecords("users")
	if err != nil || len(authRecords) == 0 {
		t.Fatalf("load auth record: records=%d err=%v", len(authRecords), err)
	}
	token, err := authRecords[0].NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	headers["Authorization"] = token
	RegisterManagerConfirmationRoutes(app)
	RegisterInvoiceResubmissionRoutes(app)
	return app
}

func TestManagerConfirmationRouteRejectsInvoiceAndWritesNotificationAndAudit(t *testing.T) {
	headers := map[string]string{}
	scenario := tests.ApiScenario{
		Name:           "manager rejects invoice with reason",
		Method:         http.MethodPost,
		URL:            "/api/erp/manager-confirmations",
		Body:           strings.NewReader(`{"collection":"sale_invoices","recordId":"apiinvoice00001","decision":"rejected","reason":"附件与发票号不一致"}`),
		Headers:        headers,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"status":"rejected"`,
			`"changed":true`,
		},
		TestAppFactory: func(tb testing.TB) *tests.TestApp {
			return newInvoiceRouteTestApp(tb, "pending", headers)
		},
		AfterTestFunc: func(tb testing.TB, app *tests.TestApp, _ *http.Response) {
			invoice, err := app.FindRecordById("sale_invoices", invoiceRouteRecordID)
			if err != nil {
				tb.Fatal(err)
			}
			if invoice.GetString("manager_confirmed") != "rejected" || invoice.GetString("rejection_reason") != "附件与发票号不一致" {
				tb.Fatalf("unexpected invoice state: %#v", invoice.FieldsData())
			}
			notifications, err := app.FindRecordsByFilter("notifications_02", "record_id = {:id}", "", 0, 0, map[string]any{"id": invoiceRouteRecordID})
			if err != nil || len(notifications) != 1 {
				tb.Fatalf("sales rejection notification: records=%d err=%v", len(notifications), err)
			}
			logs, err := app.FindRecordsByFilter("contract_operation_logs", "record_id = {:id} && operation = 'reject_record'", "", 0, 0, map[string]any{"id": invoiceRouteRecordID})
			if err != nil || len(logs) != 1 || logs[0].GetString("result") != "success" {
				tb.Fatalf("rejection audit log: records=%d err=%v", len(logs), err)
			}
		},
	}
	scenario.Test(t)
}

func TestManagerConfirmationRouteRequiresInvoiceRejectionReason(t *testing.T) {
	headers := map[string]string{}
	scenario := tests.ApiScenario{
		Name:           "invoice rejection reason is required",
		Method:         http.MethodPost,
		URL:            "/api/erp/manager-confirmations",
		Body:           strings.NewReader(`{"collection":"sale_invoices","recordId":"apiinvoice00001","decision":"rejected"}`),
		Headers:        headers,
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"message":"确认参数不正确."`,
		},
		TestAppFactory: func(tb testing.TB) *tests.TestApp {
			return newInvoiceRouteTestApp(tb, "pending", headers)
		},
		AfterTestFunc: func(tb testing.TB, app *tests.TestApp, _ *http.Response) {
			invoice, err := app.FindRecordById("sale_invoices", invoiceRouteRecordID)
			if err != nil {
				tb.Fatal(err)
			}
			if invoice.GetString("manager_confirmed") != "pending" {
				tb.Fatalf("invoice changed after invalid rejection: %#v", invoice.FieldsData())
			}
		},
	}
	scenario.Test(t)
}

func TestInvoiceResubmissionRouteReturnsRejectedInvoiceToPending(t *testing.T) {
	headers := map[string]string{}
	scenario := tests.ApiScenario{
		Name:           "employee resubmits rejected invoice",
		Method:         http.MethodPost,
		URL:            "/api/erp/invoice-resubmissions",
		Body:           strings.NewReader(`{"collection":"sale_invoices","recordId":"apiinvoice00001"}`),
		Headers:        headers,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"status":"pending"`,
			`"changed":true`,
		},
		TestAppFactory: func(tb testing.TB) *tests.TestApp {
			return newInvoiceRouteTestApp(tb, "rejected", headers)
		},
		AfterTestFunc: func(tb testing.TB, app *tests.TestApp, _ *http.Response) {
			invoice, err := app.FindRecordById("sale_invoices", invoiceRouteRecordID)
			if err != nil {
				tb.Fatal(err)
			}
			if invoice.GetString("manager_confirmed") != "pending" {
				tb.Fatalf("unexpected resubmitted invoice state: %#v", invoice.FieldsData())
			}
			if invoice.Collection().Fields.GetByName("is_verified") != nil {
				tb.Fatal("sales invoice unexpectedly exposes purchase-only verification field")
			}
			logs, err := app.FindRecordsByFilter("contract_operation_logs", "record_id = {:id} && operation = 'resubmit_record'", "", 0, 0, map[string]any{"id": invoiceRouteRecordID})
			if err != nil || len(logs) != 1 || logs[0].GetString("result") != "success" {
				tb.Fatalf("resubmission audit log: records=%d err=%v", len(logs), err)
			}
		},
	}
	scenario.Test(t)
}
