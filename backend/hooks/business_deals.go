package hooks

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/types"
)

const defaultProfitTaxRate = 0.1881

var (
	errContractsBelongDifferentDeals = errors.New("contracts belong to different business deals")
	errContractAlreadyInOtherDeal    = errors.New("contract already belongs to another business deal")
	errBusinessDealNotFound          = errors.New("business deal not found")
)

type businessDealMembership struct {
	deal      *core.Record
	sales     []string
	purchases []string
}

// RegisterBusinessDealRoutes exposes the only mutation seams for overall
// business deals and versioned profit tax rates. Direct collection writes are
// deliberately disabled by collection rules.
func RegisterBusinessDealRoutes(app core.App) {
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			e.Router.POST("/api/erp/business-deals/remove-contract", func(request *core.RequestEvent) error {
				if err := requireManagerRequest(request); err != nil {
					return err
				}
				body := struct {
					Type       string `json:"type"`
					ContractID string `json:"contractId"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("移出总体交易参数不正确", err)
				}
				if err := removeContractFromBusinessDeal(request.App, body.Type, body.ContractID, request.Auth.Id); err != nil {
					if errors.Is(err, errBusinessDealNotFound) {
						return router.NewApiError(http.StatusConflict, "该合同当前不在总体交易中，请刷新页面", err)
					}
					return router.NewBadRequestError("移出总体交易失败", err)
				}
				return request.JSON(http.StatusOK, map[string]any{"success": true})
			}).Bind(apis.RequireAuth())

			e.Router.POST("/api/erp/profit-tax-rates", func(request *core.RequestEvent) error {
				if err := requireManagerRequest(request); err != nil {
					return err
				}
				body := struct {
					Rate          float64 `json:"rate"`
					EffectiveFrom string  `json:"effectiveFrom"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("税率参数不正确", err)
				}
				effectiveFrom, err := normalizeEffectiveDate(body.EffectiveFrom)
				if err != nil || body.Rate < 0 || body.Rate > 1 || math.IsNaN(body.Rate) || math.IsInf(body.Rate, 0) {
					return router.NewBadRequestError("税率须在 0% 到 100% 之间，并填写正确的生效日期", err)
				}
				if err := createProfitTaxRate(request.App, body.Rate, effectiveFrom, request.Auth.Id); err != nil {
					return router.NewBadRequestError("保存利润税率失败；同一生效日期不能重复", err)
				}
				return request.JSON(http.StatusOK, map[string]any{"success": true})
			}).Bind(apis.RequireAuth())

			return e.Next()
		},
	})
}

func normalizeEffectiveDate(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", errors.New("effective date is required")
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed.UTC().Format("2006-01-02 15:04:05.000Z"), nil
	}
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.000Z", "2006-01-02 15:04:05Z"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC().Format("2006-01-02 15:04:05.000Z"), nil
		}
	}
	return "", fmt.Errorf("invalid effective date %q", value)
}

func createProfitTaxRate(app core.App, rate float64, effectiveFrom, operatorID string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId("profit_tax_rates")
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Set("rate", rate)
		record.Set("effective_from", effectiveFrom)
		record.Set("created_by", operatorID)
		if err := txApp.Save(record); err != nil {
			return err
		}
		return saveProfitTaxRateLog(txApp, record, operatorID)
	})
}

func saveProfitTaxRateLog(app core.App, rate *core.Record, operatorID string) error {
	collection, err := app.FindCollectionByNameOrId("contract_operation_logs")
	if err != nil {
		return nil
	}
	operatorName, operatorRole := "系统", "system"
	if operatorID != "" {
		operatorName = "未知用户"
		operatorRole = ""
		if operator, findErr := app.FindRecordById("users", operatorID); findErr == nil {
			_, operatorName, operatorRole = auditOperator(operator)
		}
	}
	details, _ := json.Marshal(map[string]any{
		"rate":           rate.GetFloat("rate"),
		"effective_from": rate.GetString("effective_from"),
	})
	logRecord := core.NewRecord(collection)
	logRecord.Set("operation", "tax_rate_change")
	logRecord.Set("contract_type", "sales_purchase")
	logRecord.Set("operator_id", operatorID)
	logRecord.Set("operator_name", operatorName)
	logRecord.Set("operator_role", operatorRole)
	logRecord.Set("result", "success")
	logRecord.Set("collection_name", "profit_tax_rates")
	logRecord.Set("record_id", rate.Id)
	logRecord.Set("details", string(details))
	return app.Save(logRecord)
}

func profitTaxRateForDate(app core.App, dealDate string) float64 {
	date := strings.TrimSpace(dealDate)
	if date == "" {
		date = types.NowDateTime().String()
	}
	records, err := app.FindRecordsByFilter(
		"profit_tax_rates",
		"effective_from <= {:date}",
		"-effective_from",
		1,
		0,
		dbx.Params{"date": date},
	)
	if err != nil || len(records) == 0 {
		return defaultProfitTaxRate
	}
	rate := records[0].GetFloat("rate")
	if rate < 0 || rate > 1 || math.IsNaN(rate) || math.IsInf(rate, 0) {
		return defaultProfitTaxRate
	}
	return rate
}

func activeBusinessDeals(app core.App) ([]*core.Record, error) {
	return app.FindRecordsByFilter("business_deals", "deleted_at = ''", "created", 0, 0)
}

func containsContractID(ids []string, contractID string) bool {
	for _, id := range ids {
		if id == contractID {
			return true
		}
	}
	return false
}

func appendUniqueContractID(ids []string, contractID string) []string {
	if containsContractID(ids, contractID) {
		return ids
	}
	return append(ids, contractID)
}

func withoutContractID(ids []string, contractID string) []string {
	result := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != contractID {
			result = append(result, id)
		}
	}
	return result
}

func findBusinessDealForContract(app core.App, contractType, contractID string) (*businessDealMembership, error) {
	deals, err := activeBusinessDeals(app)
	if err != nil {
		return nil, err
	}
	for _, deal := range deals {
		sales := deal.GetStringSlice("sales_contracts")
		purchases := deal.GetStringSlice("purchase_contracts")
		ids := sales
		if contractType == "purchase" {
			ids = purchases
		}
		if containsContractID(ids, contractID) {
			return &businessDealMembership{deal: deal, sales: sales, purchases: purchases}, nil
		}
	}
	return nil, nil
}

func contractIsInBusinessDeal(app core.App, contractType, contractID string) bool {
	membership, err := findBusinessDealForContract(app, contractType, contractID)
	return err == nil && membership != nil
}

func linkContracts(app core.App, salesID, purchaseID, role, operatorID string, isSuperuser bool) error {
	if salesID == "" || purchaseID == "" {
		return fmt.Errorf("sales and purchase contract ids are required")
	}
	if !isSuperuser && role != "manager" && role != "sales" && role != "purchasing" {
		return errRelationManagerRequired
	}
	return app.RunInTransaction(func(txApp core.App) error {
		return linkContractsInTransaction(txApp, salesID, purchaseID, operatorID)
	})
}

func linkContractsInTransaction(app core.App, salesID, purchaseID, operatorID string) error {
	sales, err := app.FindRecordById("sales_contracts", salesID)
	if err != nil {
		return fmt.Errorf("find active sales contract: %w", err)
	}
	if sales.GetString("deleted_at") != "" {
		return errors.New("sales contract is in recycle bin")
	}
	purchase, err := app.FindRecordById("purchase_contracts", purchaseID)
	if err != nil {
		return fmt.Errorf("find active purchase contract: %w", err)
	}
	if purchase.GetString("deleted_at") != "" {
		return errors.New("purchase contract is in recycle bin")
	}
	salesMembership, err := findBusinessDealForContract(app, "sales", salesID)
	if err != nil {
		return err
	}
	purchaseMembership, err := findBusinessDealForContract(app, "purchase", purchaseID)
	if err != nil {
		return err
	}

	if salesMembership != nil && purchaseMembership != nil {
		if salesMembership.deal.Id == purchaseMembership.deal.Id {
			return nil
		}
		return errContractsBelongDifferentDeals
	}

	var deal *core.Record
	if salesMembership != nil {
		deal = salesMembership.deal
		deal.Set("purchase_contracts", appendUniqueContractID(salesMembership.purchases, purchaseID))
	} else if purchaseMembership != nil {
		deal = purchaseMembership.deal
		deal.Set("sales_contracts", appendUniqueContractID(purchaseMembership.sales, salesID))
	} else {
		collection, findErr := app.FindCollectionByNameOrId("business_deals")
		if findErr != nil {
			return findErr
		}
		deal = core.NewRecord(collection)
		deal.Set("sales_contracts", []string{salesID})
		deal.Set("purchase_contracts", []string{purchaseID})
		deal.Set("created_by", operatorID)
		dealDate := earliestContractDate(sales, purchase)
		deal.Set("deal_date", dealDate)
		deal.Set("tax_rate", profitTaxRateForDate(app, dealDate))
	}
	if err := refreshBusinessDealMetadata(app, deal); err != nil {
		return err
	}
	if err := app.Save(deal); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return errContractAlreadyInOtherDeal
		}
		return err
	}
	return saveContractOperationLog(app, "link", "sales_purchase", sales, purchase, operatorID, map[string]int{
		"sales_contracts":    len(deal.GetStringSlice("sales_contracts")),
		"purchase_contracts": len(deal.GetStringSlice("purchase_contracts")),
	})
}

func earliestContractDate(records ...*core.Record) string {
	dates := make([]string, 0, len(records))
	for _, record := range records {
		if record != nil && record.GetString("sign_date") != "" {
			dates = append(dates, record.GetString("sign_date"))
		}
	}
	if len(dates) == 0 {
		return types.NowDateTime().String()
	}
	sort.Strings(dates)
	return dates[0]
}

func refreshBusinessDealMetadata(app core.App, deal *core.Record) error {
	salesIDs := deal.GetStringSlice("sales_contracts")
	purchaseIDs := deal.GetStringSlice("purchase_contracts")
	records := make([]*core.Record, 0, len(salesIDs)+len(purchaseIDs))
	salesNos := make([]string, 0, len(salesIDs))
	purchaseNos := make([]string, 0, len(purchaseIDs))
	for _, id := range salesIDs {
		record, err := app.FindRecordById("sales_contracts", id)
		if err != nil {
			return err
		}
		records = append(records, record)
		salesNos = append(salesNos, record.GetString("no"))
	}
	for _, id := range purchaseIDs {
		record, err := app.FindRecordById("purchase_contracts", id)
		if err != nil {
			return err
		}
		records = append(records, record)
		purchaseNos = append(purchaseNos, record.GetString("no"))
	}
	deal.Set("name", strings.TrimSpace(fmt.Sprintf("销售 %s / 采购 %s", strings.Join(salesNos, "、"), strings.Join(purchaseNos, "、"))))
	deal.Set("deal_date", earliestContractDate(records...))
	return nil
}

func removeContractFromBusinessDeal(app core.App, contractType, contractID, operatorID string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		return removeContractFromBusinessDealInTransaction(txApp, contractType, contractID, operatorID)
	})
}

func removeContractFromBusinessDealInTransaction(app core.App, contractType, contractID, operatorID string) error {
	if contractType != "sales" && contractType != "purchase" {
		return fmt.Errorf("unsupported contract type %q", contractType)
	}
	membership, err := findBusinessDealForContract(app, contractType, contractID)
	if err != nil {
		return err
	}
	if membership == nil {
		return errBusinessDealNotFound
	}
	contract, err := app.FindRecordById(contractType+"_contracts", contractID)
	if err != nil {
		return err
	}
	if contractType == "sales" {
		membership.sales = withoutContractID(membership.sales, contractID)
		membership.deal.Set("sales_contracts", membership.sales)
	} else {
		membership.purchases = withoutContractID(membership.purchases, contractID)
		membership.deal.Set("purchase_contracts", membership.purchases)
	}
	if len(membership.sales) == 0 || len(membership.purchases) == 0 {
		membership.deal.Set("deleted_at", types.NowDateTime())
		membership.deal.Set("deleted_by", operatorID)
	} else if err := refreshBusinessDealMetadata(app, membership.deal); err != nil {
		return err
	}
	if err := app.Save(membership.deal); err != nil {
		return err
	}
	return saveContractOperationLog(app, "unlink", contractType, contract, nil, operatorID, map[string]int{
		"sales_contracts":    len(membership.sales),
		"purchase_contracts": len(membership.purchases),
	})
}
