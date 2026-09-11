package hooks

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"
)

var (
	errRelationManagerRequired = errors.New("manager role required")
)

// RegisterContractRelationHooks treats the old single-value relation fields as
// an input compatibility layer only. New relationships are persisted in
// business_deals; the old fields remain frozen for rollback and reconciliation.
func RegisterContractRelationHooks(app core.App) {
	bindContractRelationCreate(app, "purchase_contracts", "sales_contract")
	bindContractRelationCreate(app, "sales_contracts", "purchase_contract")
	bindContractRelationUpdate(app, "purchase_contracts", "sales_contract")
	bindContractRelationUpdate(app, "sales_contracts", "purchase_contract")
}

func bindContractRelationCreate(app core.App, collection, field string) {
	app.OnRecordCreateRequest(collection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			counterpartID := e.Record.GetString(field)
			if counterpartID == "" {
				return e.Next()
			}
			role := ""
			operatorID := ""
			if e.Auth != nil {
				role = e.Auth.GetString("type")
				operatorID = e.Auth.Id
			}
			if !canRoleManageContractRelation(collection, role, e.HasSuperuserAuth()) {
				return router.NewForbiddenError("当前账号不能修改该模块的合同关联", errRelationManagerRequired)
			}

			// Do not persist a new legacy edge. The selected counterpart is added
			// to the overall deal inside the same transaction as contract create.
			e.Record.Set(field, "")
			return runRecordRequestTransaction(e, func(txApp core.App) error {
				if err := e.Next(); err != nil {
					return err
				}
				if collection == "sales_contracts" {
					return linkContractsInTransaction(txApp, e.Record.Id, counterpartID, operatorID)
				}
				return linkContractsInTransaction(txApp, counterpartID, e.Record.Id, operatorID)
			})
		},
	})
}

func bindContractRelationUpdate(app core.App, collection, field string) {
	app.OnRecordUpdateRequest(collection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			requestInfo, err := e.RequestInfo()
			if err != nil {
				return router.NewBadRequestError("无法读取合同关联请求", err)
			}
			_, submitted := requestInfo.Body[field]

			return runRecordRequestTransaction(e, func(txApp core.App) error {
				fresh, err := txApp.FindRecordById(collection, e.Record.Id)
				if err != nil {
					return router.NewBadRequestError("合同已不存在，请刷新页面", err)
				}
				current := fresh.GetString(field)
				requested := e.Record.GetString(field)

				// PocketBase saves a full record even for PATCH. Preserve a relation
				// committed after this request loaded when the field wasn't submitted.
				if !submitted {
					e.Record.Set(field, current)
					return e.Next()
				}

				if requested != current {
					return router.NewBadRequestError("请使用合同列表或关联合同总览中的“关联/移出交易”功能", errors.New("legacy relation field is read-only"))
				}
				e.Record.Set(field, current)
				return e.Next()
			})
		},
	})
}

func canRoleManageContractRelation(collection, role string, isSuperuser bool) bool {
	if isSuperuser || role == "manager" {
		return true
	}
	return (collection == "sales_contracts" && role == "sales") ||
		(collection == "purchase_contracts" && role == "purchasing")
}
