package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type contract struct {
	id        string
	legacyIDs []string
}

type component struct {
	sales     []string
	purchases []string
}

type metrics struct {
	progress []float64
	profit   []float64
}

func componentKey(sales, purchases []string) string {
	sales = append([]string(nil), sales...)
	purchases = append([]string(nil), purchases...)
	sort.Strings(sales)
	sort.Strings(purchases)
	return "s:" + strings.Join(sales, ",") + "|p:" + strings.Join(purchases, ",")
}

func componentFromKey(key string) component {
	parts := strings.SplitN(key, "|p:", 2)
	result := component{}
	if len(parts) > 0 {
		value := strings.TrimPrefix(parts[0], "s:")
		if value != "" {
			result.sales = strings.Split(value, ",")
		}
	}
	if len(parts) == 2 && parts[1] != "" {
		result.purchases = strings.Split(parts[1], ",")
	}
	return result
}

func readContracts(app core.App, collection, legacyField string) ([]contract, error) {
	filter := ""
	definition, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	if definition.Fields.GetByName("deleted_at") != nil {
		filter = "deleted_at = ''"
	}
	records, err := app.FindRecordsByFilter(collection, filter, "id", 0, 0)
	if err != nil {
		return nil, err
	}
	result := make([]contract, 0, len(records))
	for _, record := range records {
		result = append(result, contract{
			id:        record.Id,
			legacyIDs: record.GetStringSlice(legacyField),
		})
	}
	return result, nil
}

func legacyComponents(sales, purchases []contract) map[string]bool {
	validSales := map[string]bool{}
	validPurchases := map[string]bool{}
	for _, item := range sales {
		validSales[item.id] = true
	}
	for _, item := range purchases {
		validPurchases[item.id] = true
	}
	adjacency := map[string]map[string]bool{}
	addEdge := func(salesID, purchaseID string) {
		if !validSales[salesID] || !validPurchases[purchaseID] {
			return
		}
		salesKey, purchaseKey := "s:"+salesID, "p:"+purchaseID
		if adjacency[salesKey] == nil {
			adjacency[salesKey] = map[string]bool{}
		}
		if adjacency[purchaseKey] == nil {
			adjacency[purchaseKey] = map[string]bool{}
		}
		adjacency[salesKey][purchaseKey] = true
		adjacency[purchaseKey][salesKey] = true
	}
	for _, item := range sales {
		for _, id := range item.legacyIDs {
			addEdge(item.id, id)
		}
	}
	for _, item := range purchases {
		for _, id := range item.legacyIDs {
			addEdge(id, item.id)
		}
	}
	result := map[string]bool{}
	visited := map[string]bool{}
	for start := range adjacency {
		if visited[start] {
			continue
		}
		queue := []string{start}
		visited[start] = true
		part := component{}
		for len(queue) > 0 {
			current := queue[0]
			queue = queue[1:]
			if strings.HasPrefix(current, "s:") {
				part.sales = append(part.sales, current[2:])
			} else {
				part.purchases = append(part.purchases, current[2:])
			}
			for next := range adjacency[current] {
				if !visited[next] {
					visited[next] = true
					queue = append(queue, next)
				}
			}
		}
		if len(part.sales) > 0 && len(part.purchases) > 0 {
			result[componentKey(part.sales, part.purchases)] = true
		}
	}
	return result
}

func actualComponents(app core.App) (map[string]float64, map[string]int, error) {
	filter := ""
	definition, err := app.FindCollectionByNameOrId("business_deals")
	if err != nil {
		return nil, nil, err
	}
	if definition.Fields.GetByName("deleted_at") != nil {
		filter = "deleted_at = ''"
	}
	deals, err := app.FindRecordsByFilter("business_deals", filter, "id", 0, 0)
	if err != nil {
		return nil, nil, err
	}
	result := map[string]float64{}
	membership := map[string]int{}
	for _, deal := range deals {
		sales := deal.GetStringSlice("sales_contracts")
		purchases := deal.GetStringSlice("purchase_contracts")
		result[componentKey(sales, purchases)] = deal.GetFloat("tax_rate")
		for _, id := range sales {
			membership["s:"+id]++
		}
		for _, id := range purchases {
			membership["p:"+id]++
		}
	}
	return result, membership, nil
}

func currentExchangeRate(app core.App) float64 {
	record, err := app.FindFirstRecordByFilter("settings", "key = 'default'")
	if err != nil {
		return 7.25
	}
	rate := record.GetFloat("usd_to_cny")
	if rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
		return 7.25
	}
	return rate
}

func activeRecords(app core.App, collection string) ([]*core.Record, error) {
	definition, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	filter := ""
	if definition.Fields.GetByName("deleted_at") != nil {
		filter = "deleted_at = ''"
	}
	return app.FindRecordsByFilter(collection, filter, "id", 0, 0)
}

func calculateMetrics(app core.App, part component, exchangeRate, taxRate float64) (metrics, error) {
	result := metrics{progress: make([]float64, 6), profit: make([]float64, 10)}
	for _, id := range part.sales {
		record, err := app.FindRecordById("sales_contracts", id)
		if err != nil {
			return result, err
		}
		result.progress[0] += record.GetFloat("executed_quantity")
		result.progress[2] += record.GetFloat("invoiced_amount")
		result.progress[4] += record.GetFloat("receipted_amount")
		amount := record.GetFloat("total_amount")
		if record.GetBool("is_cross_border") {
			amount *= exchangeRate
		}
		if record.GetBool("is_price_excluding_tax") {
			result.profit[0] += amount * 1.13
			result.profit[1] += amount
		} else {
			result.profit[0] += amount
			result.profit[1] += amount / 1.13
		}
	}
	validPurchases := map[string]bool{}
	for _, id := range part.purchases {
		record, err := app.FindRecordById("purchase_contracts", id)
		if err != nil {
			return result, err
		}
		validPurchases[id] = true
		result.progress[1] += record.GetFloat("executed_quantity")
		result.progress[3] += record.GetFloat("invoiced_amount")
		result.progress[5] += record.GetFloat("paid_amount")
		amount := record.GetFloat("total_amount")
		if record.GetBool("is_cross_border") {
			amount *= exchangeRate
		}
		result.profit[2] += amount
	}
	arrivals, err := activeRecords(app, "purchase_arrivals")
	if err != nil {
		return result, err
	}
	for _, arrival := range arrivals {
		if !validPurchases[arrival.GetString("purchase_contract")] {
			continue
		}
		freight1 := arrival.GetFloat("freight_1")
		if arrival.GetString("freight_1_currency") == "USD" {
			freight1 *= exchangeRate
		}
		freight2 := arrival.GetFloat("freight_2")
		if arrival.GetString("freight_2_currency") == "USD" {
			freight2 *= exchangeRate
		}
		miscellaneous := arrival.GetFloat("miscellaneous_expenses")
		if arrival.GetString("miscellaneous_expenses_currency") == "USD" {
			miscellaneous *= exchangeRate
		}
		result.profit[3] += freight1 + freight2
		result.profit[4] += miscellaneous
		result.profit[5] += arrival.GetFloat("tariff")
		result.profit[6] += arrival.GetFloat("value_added_tax")
	}
	result.profit[7] = result.profit[1] - result.profit[2]/1.13 - result.profit[3] - result.profit[4] - result.profit[5] - result.profit[6]
	result.profit[8] = (result.profit[0] - result.profit[2]) * taxRate
	result.profit[9] = result.profit[0] - result.profit[2] - result.profit[8] - result.profit[3] - result.profit[4] - result.profit[5] - result.profit[6]
	return result, nil
}

func equalNumbers(left, right []float64) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		scale := math.Max(1, math.Max(math.Abs(left[index]), math.Abs(right[index])))
		if math.Abs(left[index]-right[index]) > 1e-9*scale {
			return false
		}
	}
	return true
}

func main() {
	dbPath := flag.String("db", "pb_data/data.db", "PocketBase data.db path")
	flag.Parse()
	dataDir := filepath.Dir(*dbPath)
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: dataDir})
	if err := app.Bootstrap(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	defer app.ResetBootstrapState()

	sales, err := readContracts(app, "sales_contracts", "purchase_contract")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	purchases, err := readContracts(app, "purchase_contracts", "sales_contract")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	expected := legacyComponents(sales, purchases)
	actual, membership, err := actualComponents(app)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	missing, unexpected, duplicates := []string{}, []string{}, []string{}
	progressMismatches, profitMismatches := []string{}, []string{}
	for key := range expected {
		if _, exists := actual[key]; !exists {
			missing = append(missing, key)
		}
	}
	for key := range actual {
		if !expected[key] {
			unexpected = append(unexpected, key)
		}
	}
	for key, count := range membership {
		if count > 1 {
			duplicates = append(duplicates, key)
		}
	}
	exchangeRate := currentExchangeRate(app)
	compared := 0
	for key := range expected {
		actualTaxRate, exists := actual[key]
		if !exists {
			continue
		}
		part := componentFromKey(key)
		legacyMetrics, legacyErr := calculateMetrics(app, part, exchangeRate, 0.1881)
		dealMetrics, dealErr := calculateMetrics(app, part, exchangeRate, actualTaxRate)
		if legacyErr != nil || dealErr != nil {
			fmt.Fprintln(os.Stderr, "calculate reconciliation metrics:", legacyErr, dealErr)
			os.Exit(2)
		}
		compared++
		if !equalNumbers(legacyMetrics.progress, dealMetrics.progress) {
			progressMismatches = append(progressMismatches, key)
		}
		if !equalNumbers(legacyMetrics.profit, dealMetrics.profit) {
			profitMismatches = append(profitMismatches, key)
		}
	}
	sort.Strings(missing)
	sort.Strings(unexpected)
	sort.Strings(duplicates)
	sort.Strings(progressMismatches)
	sort.Strings(profitMismatches)
	result := map[string]any{
		"legacyGroups": len(expected), "businessDeals": len(actual),
		"missing": missing, "unexpected": unexpected, "duplicateMembership": duplicates,
		"metricsCompared": compared, "exchangeRate": exchangeRate,
		"progressMismatches": progressMismatches, "profitMismatches": profitMismatches,
		"matched": len(missing) == 0 && len(unexpected) == 0 && len(duplicates) == 0 && len(progressMismatches) == 0 && len(profitMismatches) == 0,
	}
	encoded, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(encoded))
	if result["matched"] != true {
		os.Exit(1)
	}
}
