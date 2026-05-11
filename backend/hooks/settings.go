package hooks

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterSettingsHooks(app *pocketbase.PocketBase) {
	app.OnRecordAfterUpdateSuccess("settings").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			key := e.Record.GetString("key")
			if key != "default" {
				return e.Next()
			}

			newRate := e.Record.GetFloat("usd_to_cny")
			title := "汇率变更通知"
			message := fmt.Sprintf("美元兑人民币汇率已更新为 %.4f，请关注跨境合同金额变化。", newRate)

			salesUsers, err := GetUsersByType(app, "sales")
			if err != nil {
				log.Printf("[Settings] Failed to get sales users: %v\n", err)
			} else if len(salesUsers) > 0 {
				if err := CreateNotification02(app, "exchange_rate_changed", title, message, "sales", ""); err != nil {
					log.Printf("[Settings] Failed to create notification for sales: %v\n", err)
				}
			}

			purchaseUsers, err := GetUsersByType(app, "purchasing")
			if err != nil {
				log.Printf("[Settings] Failed to get purchasing users: %v\n", err)
			} else if len(purchaseUsers) > 0 {
				if err := CreateNotification(app, "exchange_rate_changed", title, message, "purchasing", ""); err != nil {
					log.Printf("[Settings] Failed to create notification for purchasing: %v\n", err)
				}
			}

			log.Printf("[Settings] Exchange rate updated to %.4f, notifications sent\n", newRate)
			return e.Next()
		},
		Priority: 0,
	})

	log.Println("Settings hooks registered")
}
