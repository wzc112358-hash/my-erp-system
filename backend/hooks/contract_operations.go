package hooks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/types"
)

type contractCascadeDeleteContextKey struct{}

func isContractCascadeDelete(ctx context.Context) bool {
	marked, _ := ctx.Value(contractCascadeDeleteContextKey{}).(bool)
	return marked
}

var (
	errContractsNotDuplicates     = errors.New("contracts are not safe duplicates")
	errContractHasBusinessRecords = errors.New("contract has business records")
	errMergedQuantityExceeded     = errors.New("merged child quantity exceeds contract total")
	errMergeRelationConflict      = errors.New("merged contract relation cannot be preserved")
	errContractRelationNotFound   = errors.New("contract relation not found")
)

type contractOperationResult struct {
	TargetID    string         `json:"targetId"`
	SourceID    string         `json:"sourceId"`
	MovedCounts map[string]int `json:"movedCounts"`
}

type contractBusinessRecordsError struct {
	Counts map[string]int
}

func (e *contractBusinessRecordsError) Error() string {
	return "仍有关联业务记录：" + formatOperationCounts(e.Counts)
}

func (e *contractBusinessRecordsError) Unwrap() error {
	return errContractHasBusinessRecords
}

type mergeCapacityError struct {
	Label string
	Total float64
	Limit float64
}

func (e *mergeCapacityError) Error() string {
	return fmt.Sprintf("合并后%s合计 %.2f，超过合同数量 %.2f", e.Label, e.Total, e.Limit)
}

func (e *mergeCapacityError) Unwrap() error {
	return errMergedQuantityExceeded
}

func formatOperationCounts(counts map[string]int) string {
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s %d 条", key, counts[key]))
	}
	return strings.Join(parts, "、")
}

// RegisterContractOperationRoutes exposes transactional contract relation and
// manager-only deletion operations.
func RegisterContractOperationRoutes(app core.App) {
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			e.Router.POST("/api/erp/contracts/link", func(request *core.RequestEvent) error {
				body := struct {
					SalesID    string `json:"salesId"`
					PurchaseID string `json:"purchaseId"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("关联参数不正确", err)
				}
				role := ""
				operatorID := ""
				if request.Auth != nil {
					role = request.Auth.GetString("type")
					operatorID = request.Auth.Id
				}
				if err := linkContracts(request.App, body.SalesID, body.PurchaseID, role, operatorID, request.HasSuperuserAuth()); err != nil {
					switch {
					case errors.Is(err, errRelationManagerRequired):
						return router.NewForbiddenError("仅销售、采购或管理账号可以关联合同", err)
					case errors.Is(err, errContractsBelongDifferentDeals), errors.Is(err, errContractAlreadyInOtherDeal):
						return router.NewApiError(http.StatusConflict, "两个合同已分别属于不同的总体交易；请先由管理移出原交易，再重新关联", err)
					default:
						return router.NewBadRequestError("关联合同失败", err)
					}
				}
				return request.JSON(http.StatusOK, map[string]any{"success": true})
			}).Bind(apis.RequireAuth())

			e.Router.POST("/api/erp/contracts/unlink", func(request *core.RequestEvent) error {
				if err := requireManagerRequest(request); err != nil {
					return err
				}
				body := struct {
					SalesID    string `json:"salesId"`
					PurchaseID string `json:"purchaseId"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("解除关联参数不正确", err)
				}
				if err := unlinkContracts(request.App, body.SalesID, body.PurchaseID, request.Auth.Id); err != nil {
					return contractOperationAPIError(err)
				}
				return request.JSON(http.StatusOK, map[string]any{"success": true})
			}).Bind(apis.RequireAuth())

			e.Router.POST("/api/erp/contracts/unlink-delete", func(request *core.RequestEvent) error {
				if err := requireManagerRequest(request); err != nil {
					return err
				}
				body := struct {
					Type       string `json:"type"`
					ContractID string `json:"contractId"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("删除参数不正确", err)
				}
				if err := unlinkAndDeleteContract(request.App, body.Type, body.ContractID, request.Auth.Id); err != nil {
					return contractOperationAPIError(err)
				}
				return request.JSON(http.StatusOK, map[string]any{"success": true})
			}).Bind(apis.RequireAuth())

			return e.Next()
		},
	})
}

func requireManagerRequest(e *core.RequestEvent) error {
	if e.HasSuperuserAuth() || (e.Auth != nil && e.Auth.GetString("type") == "manager") {
		return nil
	}
	return router.NewForbiddenError("仅管理账号可以执行合同解除关联或删除", nil)
}

func contractOperationAPIError(err error) error {
	switch {
	case errors.Is(err, errContractsNotDuplicates):
		return router.NewApiError(http.StatusConflict, "仅可合并合同号、品名、客户/供应商、数量、单价及币种均一致的重复合同", err)
	case errors.Is(err, errMergedQuantityExceeded):
		return router.NewApiError(http.StatusConflict, err.Error()+"，请先核对重复子记录", err)
	case errors.Is(err, errMergeRelationConflict):
		return router.NewApiError(http.StatusConflict, err.Error()+"；请先解除冲突的合同关系后再合并", err)
	case errors.Is(err, errContractHasBusinessRecords):
		return router.NewApiError(http.StatusConflict, err.Error()+"；为避免数据丢失，请改用“合并重复合同”或先处理这些记录", err)
	case errors.Is(err, errContractRelationNotFound):
		return router.NewApiError(http.StatusConflict, "这两个合同当前没有关联，请刷新页面", err)
	default:
		return router.NewBadRequestError("合同操作失败", err)
	}
}

func contractCollectionName(contractType string) (string, error) {
	switch contractType {
	case "sales":
		return "sales_contracts", nil
	case "purchase":
		return "purchase_contracts", nil
	default:
		return "", fmt.Errorf("unsupported contract type %q", contractType)
	}
}

func mergeDuplicateContracts(app core.App, contractType, sourceID, targetID string, operatorID ...string) (*contractOperationResult, error) {
	collectionName, err := contractCollectionName(contractType)
	if err != nil {
		return nil, err
	}
	if sourceID == "" || targetID == "" || sourceID == targetID {
		return nil, fmt.Errorf("source and target contracts must be different")
	}

	result := &contractOperationResult{TargetID: targetID, SourceID: sourceID, MovedCounts: map[string]int{}}
	transactionErr := app.RunInTransaction(func(txApp core.App) error {
		source, err := txApp.FindRecordById(collectionName, sourceID)
		if err != nil {
			return fmt.Errorf("find source contract: %w", err)
		}
		target, err := txApp.FindRecordById(collectionName, targetID)
		if err != nil {
			return fmt.Errorf("find target contract: %w", err)
		}
		if !areSafeDuplicateContracts(contractType, source, target) {
			return errContractsNotDuplicates
		}
		if err := validateMergedCapacity(txApp, contractType, sourceID, targetID, target.GetFloat("total_quantity")); err != nil {
			return err
		}

		if err := copyContractAttachments(txApp, source, target); err != nil {
			return err
		}
		if err := preserveOutgoingContractRelation(txApp, contractType, source, target); err != nil {
			return err
		}
		if err := preserveBusinessDealMembership(txApp, contractType, source, target); err != nil {
			return err
		}

		counts, err := moveContractReferences(txApp, source, target)
		if err != nil {
			return err
		}
		result.MovedCounts = counts
		if err := recalculateMergedContract(txApp, contractType, target); err != nil {
			return err
		}
		if err := txApp.Delete(source); err != nil {
			return fmt.Errorf("delete merged source contract: %w", err)
		}
		operator := ""
		if len(operatorID) > 0 {
			operator = operatorID[0]
		}
		return saveContractOperationLog(txApp, "merge", contractType, source, target, operator, counts)
	})
	if transactionErr != nil {
		return nil, transactionErr
	}

	log.Printf("[ContractOperation] merged %s contract %s into %s; moved=%v", contractType, sourceID, targetID, result.MovedCounts)
	return result, nil
}

func areSafeDuplicateContracts(contractType string, source, target *core.Record) bool {
	if normalizeContractIdentity(source.GetString("no")) != normalizeContractIdentity(target.GetString("no")) ||
		normalizeContractIdentity(source.GetString("product_name")) != normalizeContractIdentity(target.GetString("product_name")) ||
		!nearlyEqual(source.GetFloat("unit_price"), target.GetFloat("unit_price")) ||
		!nearlyEqual(source.GetFloat("total_quantity"), target.GetFloat("total_quantity")) ||
		!nearlyEqual(source.GetFloat("total_amount"), target.GetFloat("total_amount")) ||
		source.GetBool("is_cross_border") != target.GetBool("is_cross_border") {
		return false
	}
	if contractType == "sales" {
		return source.GetString("customer") == target.GetString("customer") &&
			source.GetBool("is_price_excluding_tax") == target.GetBool("is_price_excluding_tax")
	}
	return source.GetString("supplier") == target.GetString("supplier")
}

func normalizeContractIdentity(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), ""))
}

func nearlyEqual(a, b float64) bool {
	return math.Abs(a-b) <= 0.000001
}

func validateMergedCapacity(app core.App, contractType, sourceID, targetID string, contractQuantity float64) error {
	type capacityCheck struct {
		collection string
		field      string
		label      string
		factor     float64
	}
	checks := []capacityCheck{}
	if contractType == "sales" {
		checks = []capacityCheck{
			{collection: "sales_shipments", field: "quantity", label: "发货数量", factor: 1},
			{collection: "sale_receipts", field: "product_amount", label: "收款产品数量", factor: 1.05},
			{collection: "sale_invoices", field: "product_amount", label: "开票产品数量", factor: 1},
		}
	} else {
		checks = []capacityCheck{
			{collection: "purchase_arrivals", field: "quantity", label: "到货数量", factor: 1},
			{collection: "purchase_payments", field: "product_amount", label: "付款产品数量", factor: 1},
			{collection: "purchase_invoices", field: "product_amount", label: "收票产品数量", factor: 1},
		}
	}
	for _, check := range checks {
		total, err := sumRelatedFieldForContracts(app, check.collection, contractType+"_contract", check.field, sourceID, targetID)
		if err != nil {
			return err
		}
		limit := contractQuantity * check.factor
		if total > limit+0.000001 {
			return &mergeCapacityError{Label: check.label, Total: total, Limit: limit}
		}
	}
	return nil
}

func sumRelatedFieldForContracts(app core.App, collectionName, relationField, valueField, sourceID, targetID string) (float64, error) {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return 0, nil
	}
	filter := relationField + " = {:source} || " + relationField + " = {:target}"
	if collection.Fields.GetByName("deleted_at") != nil {
		filter = "(" + filter + ") && deleted_at = ''"
	}
	records, err := app.FindRecordsByFilter(
		collectionName,
		filter,
		"",
		0,
		0,
		dbx.Params{"source": sourceID, "target": targetID},
	)
	if err != nil {
		return 0, err
	}
	return SumField(records, valueField), nil
}

func copyContractAttachments(app core.App, source, target *core.Record) error {
	merged := make([]any, 0, len(target.GetStringSlice("attachments"))+len(source.GetStringSlice("attachments")))
	present := map[string]bool{}
	for _, filename := range target.GetStringSlice("attachments") {
		present[filename] = true
		merged = append(merged, filename)
	}
	fsys, err := app.NewFilesystem()
	if err != nil {
		return err
	}
	defer fsys.Close()
	for _, filename := range source.GetStringSlice("attachments") {
		if present[filename] {
			continue
		}
		sourceKey := source.BaseFilesPath() + "/" + filename
		file, err := fsys.GetReuploadableFile(sourceKey, true)
		if err != nil {
			return fmt.Errorf("copy contract attachment %q: %w", filename, err)
		}
		present[filename] = true
		merged = append(merged, file)
	}
	target.Set("attachments", merged)
	return app.Save(target)
}

func preserveOutgoingContractRelation(app core.App, contractType string, source, target *core.Record) error {
	field := "purchase_contract"
	counterpartCollection := "purchase_contracts"
	reverseField := "sales_contract"
	if contractType == "purchase" {
		field = "sales_contract"
		counterpartCollection = "sales_contracts"
		reverseField = "purchase_contract"
	}
	sourceCounterpartID := source.GetString(field)
	if sourceCounterpartID == "" || target.GetString(field) == sourceCounterpartID {
		return nil
	}
	if target.GetString(field) == "" {
		target.Set(field, sourceCounterpartID)
		return app.Save(target)
	}

	// Both target and source already use their single outgoing slot. Preserve
	// the source edge through the counterpart's reverse slot when available.
	counterpart, err := app.FindRecordById(counterpartCollection, sourceCounterpartID)
	if err != nil {
		return err
	}
	reverseID := counterpart.GetString(reverseField)
	if reverseID != "" && reverseID != source.Id && reverseID != target.Id {
		return fmt.Errorf("%w: %s %s 的反向关联已被占用", errMergeRelationConflict, counterpart.GetString("no"), sourceCounterpartID)
	}
	counterpart.Set(reverseField, target.Id)
	return app.Save(counterpart)
}

func moveContractReferences(app core.App, source, target *core.Record) (map[string]int, error) {
	references, err := app.FindCollectionReferences(source.Collection())
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for collection, fields := range references {
		for _, field := range fields {
			relation, ok := field.(*core.RelationField)
			if !ok {
				continue
			}
			if relation.IsMultiple() {
				if collection.Name == "business_deals" {
					continue
				}
				return nil, fmt.Errorf("multi-value relation %s.%s is not supported for contract merge", collection.Name, relation.Name)
			}
			records, err := app.FindRecordsByFilter(collection, relation.Name+" = {:source}", "", 0, 0, dbx.Params{"source": source.Id})
			if err != nil {
				return nil, err
			}
			if len(records) == 0 {
				continue
			}
			if err := updateRelationReferences(app, collection, relation.Name, source.Id, target.Id); err != nil {
				return nil, err
			}
			counts[collection.Name] += len(records)
		}
	}
	return counts, nil
}

func preserveBusinessDealMembership(app core.App, contractType string, source, target *core.Record) error {
	sourceMembership, err := findBusinessDealForContract(app, contractType, source.Id)
	if err != nil || sourceMembership == nil {
		return err
	}
	targetMembership, err := findBusinessDealForContract(app, contractType, target.Id)
	if err != nil {
		return err
	}
	if targetMembership != nil && targetMembership.deal.Id != sourceMembership.deal.Id {
		return errMergeRelationConflict
	}
	deal := sourceMembership.deal
	if contractType == "sales" {
		ids := appendUniqueContractID(withoutContractID(sourceMembership.sales, source.Id), target.Id)
		deal.Set("sales_contracts", ids)
	} else {
		ids := appendUniqueContractID(withoutContractID(sourceMembership.purchases, source.Id), target.Id)
		deal.Set("purchase_contracts", ids)
	}
	if err := refreshBusinessDealMetadata(app, deal); err != nil {
		return err
	}
	return app.Save(deal)
}

func updateRelationReferences(app core.App, collection *core.Collection, field, currentID, nextID string) error {
	values := dbx.Params{field: nextID}
	if collection.Fields.GetByName("updated") != nil {
		values["updated"] = types.NowDateTime()
	}
	_, err := app.DB().Update(collection.Name, values, dbx.HashExp{field: currentID}).Execute()
	return err
}

func recalculateMergedContract(app core.App, contractType string, contract *core.Record) error {
	if contractType == "sales" {
		executed, err := sumRelatedFieldForContracts(app, "sales_shipments", "sales_contract", "quantity", contract.Id, contract.Id)
		if err != nil {
			return err
		}
		receipted, err := sumRelatedFieldForContracts(app, "sale_receipts", "sales_contract", "amount", contract.Id, contract.Id)
		if err != nil {
			return err
		}
		invoiced, err := sumRelatedFieldForContracts(app, "sale_invoices", "sales_contract", "amount", contract.Id, contract.Id)
		if err != nil {
			return err
		}
		totalQuantity := contract.GetFloat("total_quantity")
		totalAmount := contract.GetFloat("total_amount")
		receivable := executed * contract.GetFloat("unit_price")
		contract.Set("executed_quantity", executed)
		contract.Set("execution_percent", ComputePercent(executed, totalQuantity))
		contract.Set("receipted_amount", receipted)
		contract.Set("receipt_percent", ComputePercent(receipted, receivable))
		contract.Set("debt_amount", receivable-receipted)
		contract.Set("debt_percent", ComputePercent(receivable-receipted, receivable))
		contract.Set("invoiced_amount", invoiced)
		contract.Set("invoice_percent", ComputePercent(invoiced, totalAmount))
		contract.Set("uninvoiced_amount", totalAmount-invoiced)
		contract.Set("uninvoiced_percent", ComputePercent(totalAmount-invoiced, totalAmount))
		if contract.GetString("status") != "cancelled" {
			if contract.GetFloat("execution_percent") >= 100 && contract.GetFloat("receipt_percent") >= 100 && contract.GetFloat("invoice_percent") >= 100 {
				contract.Set("status", "completed")
			} else {
				contract.Set("status", "executing")
			}
		}
		return app.Save(contract)
	}

	executed, err := sumRelatedFieldForContracts(app, "purchase_arrivals", "purchase_contract", "quantity", contract.Id, contract.Id)
	if err != nil {
		return err
	}
	invoiced, err := sumRelatedFieldForContracts(app, "purchase_invoices", "purchase_contract", "amount", contract.Id, contract.Id)
	if err != nil {
		return err
	}
	paid, err := sumRelatedFieldForContracts(app, "purchase_payments", "purchase_contract", "amount", contract.Id, contract.Id)
	if err != nil {
		return err
	}
	totalQuantity := contract.GetFloat("total_quantity")
	totalAmount := contract.GetFloat("total_amount")
	contract.Set("executed_quantity", executed)
	contract.Set("execution_percent", ComputePercent(executed, totalQuantity))
	contract.Set("invoiced_amount", invoiced)
	contract.Set("invoiced_percent", ComputePercent(invoiced, totalAmount))
	contract.Set("uninvoiced_amount", totalAmount-invoiced)
	contract.Set("uninvoiced_percent", ComputePercent(totalAmount-invoiced, totalAmount))
	contract.Set("paid_amount", paid)
	contract.Set("paid_percent", ComputePercent(paid, totalAmount))
	contract.Set("unpaid_amount", totalAmount-paid)
	contract.Set("unpaid_percent", ComputePercent(totalAmount-paid, totalAmount))
	if contract.GetString("status") != "cancelled" {
		if contract.GetFloat("execution_percent") >= 100 && contract.GetFloat("invoiced_percent") >= 100 && contract.GetFloat("paid_percent") >= 100 {
			contract.Set("status", "completed")
		} else {
			contract.Set("status", "executing")
		}
	}
	return app.Save(contract)
}

func unlinkContracts(app core.App, salesID, purchaseID string, operatorID ...string) error {
	if salesID == "" || purchaseID == "" {
		return fmt.Errorf("sales and purchase contract ids are required")
	}
	return app.RunInTransaction(func(txApp core.App) error {
		salesMembership, err := findBusinessDealForContract(txApp, "sales", salesID)
		if err != nil {
			return err
		}
		purchaseMembership, err := findBusinessDealForContract(txApp, "purchase", purchaseID)
		if err != nil {
			return err
		}
		if salesMembership == nil || purchaseMembership == nil || salesMembership.deal.Id != purchaseMembership.deal.Id {
			return errContractRelationNotFound
		}
		operator := ""
		if len(operatorID) > 0 {
			operator = operatorID[0]
		}
		// Compatibility for old clients: a pair can only be unlinked without
		// ambiguity when one side has a single member. New clients use the
		// explicit remove-contract endpoint.
		if len(salesMembership.sales) == 1 {
			return removeContractFromBusinessDealInTransaction(txApp, "purchase", purchaseID, operator)
		}
		if len(salesMembership.purchases) == 1 {
			return removeContractFromBusinessDealInTransaction(txApp, "sales", salesID, operator)
		}
		return fmt.Errorf("总体交易包含多份销售和采购合同，请明确选择要移出的合同")
	})
}

func unlinkAndDeleteContract(app core.App, contractType, contractID string, operatorID ...string) error {
	collectionName, err := contractCollectionName(contractType)
	if err != nil {
		return err
	}
	operator, operatorName, operatorRole := "", "系统", "system"
	if len(operatorID) > 0 {
		operator = operatorID[0]
		operatorName = operator
		if user, findErr := app.FindRecordById("users", operator); findErr == nil {
			_, operatorName, operatorRole = auditOperator(user)
		}
	}
	_, err = softDeleteBusinessRecord(app, collectionName, contractID, operator, operatorName, operatorRole)
	return err
}

func saveContractOperationLog(app core.App, operation, contractType string, source, target *core.Record, operatorID string, details map[string]int) error {
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
	record := core.NewRecord(collection)
	record.Set("operation", operation)
	record.Set("contract_type", contractType)
	record.Set("operator_id", operatorID)
	record.Set("operator_name", operatorName)
	record.Set("operator_role", operatorRole)
	record.Set("result", "success")
	if source != nil {
		record.Set("source_contract_id", source.Id)
		record.Set("source_contract_no", source.GetString("no"))
		if snapshot, snapshotErr := recordSnapshotJSON(source); snapshotErr == nil {
			record.Set("record_snapshot", string(snapshot))
		}
	}
	if target != nil {
		record.Set("target_contract_id", target.Id)
		record.Set("target_contract_no", target.GetString("no"))
	}
	if details != nil {
		encoded, _ := json.Marshal(details)
		record.Set("details", string(encoded))
	}
	return app.Save(record)
}
