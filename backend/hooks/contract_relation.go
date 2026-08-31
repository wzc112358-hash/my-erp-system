package hooks

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"
)

var (
	errRelationManagerRequired = errors.New("manager role required")
	errRelationAlreadyOccupied = errors.New("relation field already occupied")
)

// RegisterContractRelationHooks protects both legacy relation directions.
// The schema can represent sales->purchase and purchase->sales edges; together
// they support the one-to-many and many-to-one contract views used by reports.
func RegisterContractRelationHooks(app core.App) {
	bindContractRelationUpdate(app, "purchase_contracts", "sales_contract")
	bindContractRelationUpdate(app, "sales_contracts", "purchase_contract")
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

				role := ""
				if e.Auth != nil {
					role = e.Auth.GetString("type")
				}
				canManage := canRoleManageContractRelation(collection, role, e.HasSuperuserAuth())
				if err := validateRelationChange(current, requested, canManage); err != nil {
					switch {
					case errors.Is(err, errRelationManagerRequired):
						return router.NewForbiddenError("当前账号不能修改该模块的合同关联", err)
					case errors.Is(err, errRelationAlreadyOccupied):
						return router.NewBadRequestError("该合同已被其他关联占用，请刷新后重试", err)
					default:
						return err
					}
				}
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

func validateRelationChange(current, requested string, canManage bool) error {
	if current == requested {
		return nil
	}
	if !canManage {
		return errRelationManagerRequired
	}
	if requested == "" {
		return nil
	}
	if current != "" {
		return errRelationAlreadyOccupied
	}
	return nil
}
