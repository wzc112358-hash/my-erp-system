package hooks

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterServiceContractHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("service_contracts").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if !e.Record.GetBool("is_cross_border") {
				e.Record.Set("is_cross_border", false)
			}
			creatorId := e.Record.GetString("creator")
			if creatorId != "" {
				e.Record.Set("creator_user", creatorId)
			}
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordCreate("service_orders").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			creatorId := e.Record.GetString("creator_user")
			if creatorId == "" {
				creatorId = e.Record.GetString("creator")
			}
			if creatorId != "" {
				e.Record.Set("creator_user", creatorId)
			}

			return e.Next()
		},
		Priority: 0,
	})

	log.Println("[Hooks] Service contract hooks registered")
}
