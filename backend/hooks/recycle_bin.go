package hooks

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/pocketbase/pocketbase/tools/types"
)

type recycleMutationContextKey struct{}

func isRecycleMutation(ctx context.Context) bool {
	marked, _ := ctx.Value(recycleMutationContextKey{}).(bool)
	return marked
}

type recycleBinItem struct {
	BatchID         string         `json:"batchId"`
	RootCollection  string         `json:"rootCollection"`
	RootRecordID    string         `json:"rootRecordId"`
	ContractType    string         `json:"contractType"`
	RecordNo        string         `json:"recordNo"`
	ProductName     string         `json:"productName"`
	DeletedAt       string         `json:"deletedAt"`
	DeletedBy       string         `json:"deletedBy"`
	DeletedByName   string         `json:"deletedByName"`
	RecordCount     int            `json:"recordCount"`
	AttachmentCount int            `json:"attachmentCount"`
	ChildCounts     map[string]int `json:"childCounts"`
}

var errRecycleRecordNotFound = errors.New("recycle record not found")

func RegisterRecycleBinRoutes(app core.App) {
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			e.Router.POST("/api/erp/recycle/delete", func(request *core.RequestEvent) error {
				body := struct {
					Collection string `json:"collection"`
					RecordID   string `json:"recordId"`
				}{}
				if err := request.BindBody(&body); err != nil {
					return router.NewBadRequestError("删除参数不正确", err)
				}
				config, ok := auditConfigForCollection(body.Collection)
				if !ok {
					return router.NewBadRequestError("不支持删除这类数据", nil)
				}
				if err := requireRecycleDeleteRole(request, config.contractType); err != nil {
					return err
				}
				operatorID, operatorName, operatorRole := auditOperator(request.Auth)
				batchID, err := softDeleteBusinessRecord(request.App, body.Collection, body.RecordID, operatorID, operatorName, operatorRole)
				if errors.Is(err, errRecycleRecordNotFound) {
					return router.NewNotFoundError("记录不存在或已经进入回收站", err)
				}
				if err != nil {
					return router.NewBadRequestError("移入回收站失败", err)
				}
				return request.JSON(http.StatusOK, map[string]any{"success": true, "batchId": batchID})
			}).Bind(apis.RequireAuth())

			e.Router.POST("/api/erp/recycle/list", func(request *core.RequestEvent) error {
				if err := requireManagerRequest(request); err != nil {
					return err
				}
				items, err := listRecycleBin(request.App)
				if err != nil {
					return router.NewInternalServerError("加载回收站失败", err)
				}
				return request.JSON(http.StatusOK, map[string]any{"items": items})
			}).Bind(apis.RequireAuth())

			e.Router.POST("/api/erp/recycle/restore", func(request *core.RequestEvent) error {
				if err := requireManagerRequest(request); err != nil {
					return err
				}
				body := struct {
					BatchID string `json:"batchId"`
				}{}
				if err := request.BindBody(&body); err != nil || strings.TrimSpace(body.BatchID) == "" {
					return router.NewBadRequestError("恢复参数不正确", err)
				}
				operatorID, operatorName, operatorRole := auditOperator(request.Auth)
				if err := restoreRecycleBatch(request.App, body.BatchID, operatorID, operatorName, operatorRole); err != nil {
					if errors.Is(err, errRecycleRecordNotFound) {
						return router.NewNotFoundError("回收站记录不存在或已经恢复", err)
					}
					return router.NewBadRequestError("恢复失败", err)
				}
				return request.JSON(http.StatusOK, map[string]any{"success": true})
			}).Bind(apis.RequireAuth())

			return e.Next()
		},
	})
}

func requireRecycleDeleteRole(e *core.RequestEvent, contractType string) error {
	if e.HasSuperuserAuth() || (e.Auth != nil && e.Auth.GetString("type") == "manager") {
		return nil
	}
	role := ""
	if e.Auth != nil {
		role = e.Auth.GetString("type")
	}
	if (contractType == "sales" && role == "sales") || (contractType == "purchase" && role == "purchasing") {
		return nil
	}
	return router.NewForbiddenError("当前账号不能删除该业务数据", nil)
}

func softDeleteBusinessRecord(app core.App, collectionName, recordID, operatorID, operatorName, operatorRole string) (string, error) {
	config, ok := auditConfigForCollection(collectionName)
	if !ok || strings.TrimSpace(recordID) == "" {
		return "", errRecycleRecordNotFound
	}
	batchID := security.PseudorandomString(15)
	err := app.RunInTransaction(func(txApp core.App) error {
		record, err := txApp.FindRecordById(collectionName, recordID)
		if err != nil || record.GetString("deleted_at") != "" {
			return errRecycleRecordNotFound
		}
		ctx := context.WithValue(context.Background(), recycleMutationContextKey{}, true)

		if config.parentField == "" {
			for _, childConfig := range businessRecordAuditConfigs {
				if childConfig.parentTable != collectionName {
					continue
				}
				children, findErr := txApp.FindRecordsByFilter(
					childConfig.collection,
					childConfig.parentField+" = {:parent} && deleted_at = ''",
					"",
					0,
					0,
					dbx.Params{"parent": recordID},
				)
				if findErr != nil {
					return findErr
				}
				for _, child := range children {
					if err := markRecordDeleted(txApp, ctx, childConfig, child, batchID, operatorID, operatorName, operatorRole); err != nil {
						return err
					}
				}
			}
			if err := detachExternalContractReferences(txApp, config.contractType, record); err != nil {
				return err
			}
		}

		if err := markRecordDeleted(txApp, ctx, config, record, batchID, operatorID, operatorName, operatorRole); err != nil {
			return err
		}
		if config.parentField != "" {
			return recalculateParentContract(txApp, config.contractType, record.GetString(config.parentField))
		}
		return nil
	})
	return batchID, err
}

func markRecordDeleted(app core.App, ctx context.Context, config businessRecordAuditConfig, record *core.Record, batchID, operatorID, operatorName, operatorRole string) error {
	snapshot, err := recordSnapshotJSON(record)
	if err != nil {
		return err
	}
	record.Set("deleted_at", types.NowDateTime())
	record.Set("deleted_by", operatorID)
	record.Set("delete_batch_id", batchID)
	if config.parentField == "" {
		if config.contractType == "sales" {
			record.Set("purchase_contract", "")
		} else {
			record.Set("sales_contract", "")
		}
	}
	if err := app.SaveWithContext(ctx, record); err != nil {
		return err
	}
	return saveRecordOperationLog(app, config, record, "soft_delete", "success", batchID, "", operatorID, operatorName, operatorRole, string(snapshot))
}

func detachExternalContractReferences(app core.App, contractType string, contract *core.Record) error {
	references, err := app.FindCollectionReferences(contract.Collection())
	if err != nil {
		return err
	}
	for collection, fields := range references {
		for _, field := range fields {
			relation, ok := field.(*core.RelationField)
			if !ok {
				continue
			}
			if _, owned := ownedBusinessRecordConfig(contractType, collection.Name, relation.Name); owned {
				continue
			}
			if relation.IsMultiple() {
				return fmt.Errorf("multi-value relation %s.%s is not supported", collection.Name, relation.Name)
			}
			if err := updateRelationReferences(app, collection, relation.Name, contract.Id, ""); err != nil {
				return err
			}
		}
	}
	return nil
}

func restoreRecycleBatch(app core.App, batchID, operatorID, operatorName, operatorRole string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		recordsByConfig, err := findRecycleBatchRecords(txApp, batchID)
		if err != nil {
			return err
		}
		total := 0
		for _, records := range recordsByConfig {
			total += len(records)
		}
		if total == 0 {
			return errRecycleRecordNotFound
		}

		ctx := context.WithValue(context.Background(), recycleMutationContextKey{}, true)
		parents := map[string]string{}
		for _, config := range businessRecordAuditConfigs {
			for _, record := range recordsByConfig[config.collection] {
				snapshot, snapshotErr := recordSnapshotJSON(record)
				if snapshotErr != nil {
					return snapshotErr
				}
				record.Set("deleted_at", "")
				record.Set("deleted_by", "")
				record.Set("delete_batch_id", "")
				if err := txApp.SaveWithContext(ctx, record); err != nil {
					return err
				}
				if err := saveRecordOperationLog(txApp, config, record, "restore_record", "success", batchID, "", operatorID, operatorName, operatorRole, string(snapshot)); err != nil {
					return err
				}
				if config.parentField == "" {
					parents[config.contractType+":"+record.Id] = config.contractType
				} else if parentID := record.GetString(config.parentField); parentID != "" {
					parents[config.contractType+":"+parentID] = config.contractType
				}
			}
		}
		for key, contractType := range parents {
			contractID := strings.TrimPrefix(key, contractType+":")
			if err := recalculateParentContract(txApp, contractType, contractID); err != nil {
				return err
			}
		}
		return nil
	})
}

func findRecycleBatchRecords(app core.App, batchID string) (map[string][]*core.Record, error) {
	result := make(map[string][]*core.Record, len(businessRecordAuditConfigs))
	for _, config := range businessRecordAuditConfigs {
		records, err := app.FindRecordsByFilter(
			config.collection,
			"delete_batch_id = {:batch} && deleted_at != ''",
			"",
			0,
			0,
			dbx.Params{"batch": batchID},
		)
		if err != nil {
			return nil, err
		}
		result[config.collection] = records
	}
	return result, nil
}

func recalculateParentContract(app core.App, contractType, contractID string) error {
	if contractID == "" {
		return nil
	}
	collectionName, err := contractCollectionName(contractType)
	if err != nil {
		return err
	}
	contract, err := app.FindRecordById(collectionName, contractID)
	if err != nil || contract.GetString("deleted_at") != "" {
		return nil
	}
	return recalculateMergedContract(app, contractType, contract)
}

func listRecycleBin(app core.App) ([]recycleBinItem, error) {
	itemsByBatch := map[string]*recycleBinItem{}
	userNames := map[string]string{}
	for _, config := range businessRecordAuditConfigs {
		records, err := app.FindRecordsByFilter(config.collection, "deleted_at != ''", "-deleted_at", 0, 0)
		if err != nil {
			return nil, err
		}
		for _, record := range records {
			batchID := record.GetString("delete_batch_id")
			if batchID == "" {
				continue
			}
			item := itemsByBatch[batchID]
			if item == nil {
				deletedBy := record.GetString("deleted_by")
				item = &recycleBinItem{
					BatchID:        batchID,
					RootCollection: config.collection,
					RootRecordID:   record.Id,
					ContractType:   config.contractType,
					RecordNo:       recycleRecordNo(app, config, record),
					ProductName:    record.GetString("product_name"),
					DeletedAt:      record.GetString("deleted_at"),
					DeletedBy:      deletedBy,
					DeletedByName:  recycleUserName(app, deletedBy, userNames),
					ChildCounts:    map[string]int{},
				}
				itemsByBatch[batchID] = item
			}
			item.RecordCount++
			item.AttachmentCount += len(record.GetStringSlice("attachments"))
			item.ChildCounts[config.collection]++
			if config.parentField == "" {
				item.RootCollection = config.collection
				item.RootRecordID = record.Id
				item.ContractType = config.contractType
				item.RecordNo = record.GetString("no")
				item.ProductName = record.GetString("product_name")
			}
		}
	}

	items := make([]recycleBinItem, 0, len(itemsByBatch))
	for _, item := range itemsByBatch {
		items = append(items, *item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].DeletedAt > items[j].DeletedAt })
	return items, nil
}

func recycleRecordNo(app core.App, config businessRecordAuditConfig, record *core.Record) string {
	if no := record.GetString("no"); no != "" {
		return no
	}
	if no := record.GetString("tracking_contract_no"); no != "" {
		return no
	}
	if config.parentField != "" {
		if parent, err := app.FindRecordById(config.parentTable, record.GetString(config.parentField)); err == nil {
			return parent.GetString("no")
		}
	}
	return record.Id
}

func recycleUserName(app core.App, userID string, cache map[string]string) string {
	if userID == "" {
		return "系统"
	}
	if name, ok := cache[userID]; ok {
		return name
	}
	name := userID
	if user, err := app.FindRecordById("users", userID); err == nil {
		_, name, _ = auditOperator(user)
	}
	cache[userID] = name
	return name
}

func recycleCollectionLabels() map[string]string {
	labels := make(map[string]string, len(businessRecordAuditConfigs))
	for _, config := range businessRecordAuditConfigs {
		labels[config.collection] = config.label
	}
	return labels
}

func formatRecycleCounts(counts map[string]int) string {
	labels := recycleCollectionLabels()
	parts := make([]string, 0, len(counts))
	for collection, count := range counts {
		parts = append(parts, fmt.Sprintf("%s %d 条", labels[collection], count))
	}
	sort.Strings(parts)
	return strings.Join(parts, "、")
}
