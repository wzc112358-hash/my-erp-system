package hooks

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterBiddingRecordHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("bidding_records").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			creatorId := e.Record.GetString("creator_user")
			if creatorId == "" {
				creatorId = e.Record.GetString("creator")
			}
			if creatorId != "" {
				e.Record.Set("creator_user", creatorId)
			}

			if e.Record.GetString("bid_result") == "" {
				e.Record.Set("bid_result", "pending")
			}

			return e.Next()
		},
		Priority: 0,
	})

	log.Println("[Hooks] Bidding record hooks registered")
}
