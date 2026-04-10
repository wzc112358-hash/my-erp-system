package hooks

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterExpenseRecordHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("expense_records").Bind(&hook.Handler[*core.RecordEvent]{
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

	log.Println("[Hooks] Expense record hooks registered")
}
