package hooks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
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
	errContractRelationNotFound = errors.New("contract relation not found")
)

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

func normalizeContractIdentity(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), ""))
}

func updateRelationReferences(app core.App, collection *core.Collection, field, currentID, nextID string) error {
	values := dbx.Params{field: nextID}
	if collection.Fields.GetByName("updated") != nil {
		values["updated"] = types.NowDateTime()
	}
	_, err := app.DB().Update(collection.Name, values, dbx.HashExp{field: currentID}).Execute()
	return err
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
