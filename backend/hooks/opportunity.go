package hooks

import (
	"log"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/types"
)

func RegisterOpportunityHooks(app *pocketbase.PocketBase) {
	app.OnRecordCreate("monitor_sources").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if e.Record.GetString("login_type") == "" {
				e.Record.Set("login_type", "none")
			}
			if e.Record.GetString("status") == "" {
				e.Record.Set("status", "active")
			}
			if e.Record.GetString("schedule_times") == "" {
				e.Record.Set("schedule_times", "09:00,12:00,15:00,17:30")
			}
			if e.Record.GetString("crawl_strategy") == "" {
				if e.Record.GetString("status") == "manual_required" || e.Record.GetBool("requires_login") || e.Record.GetBool("may_have_captcha") {
					e.Record.Set("crawl_strategy", "manual_assist")
				} else {
					e.Record.Set("crawl_strategy", "http_html")
				}
			}
			if e.Record.GetString("site_search_behavior") == "" {
				e.Record.Set("site_search_behavior", "supplemental")
			}
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordCreate("monitor_runs").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if e.Record.GetString("status") == "" {
				e.Record.Set("status", "no_new")
			}
			if e.Record.GetDateTime("run_at").IsZero() {
				e.Record.Set("run_at", types.NowDateTime())
			}
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordAfterCreateSuccess("monitor_runs").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			sourceId := e.Record.GetString("source")
			if sourceId == "" {
				return e.Next()
			}
			source, err := GetRecordById(app, "monitor_sources", sourceId)
			if err != nil {
				log.Printf("[Opportunity] failed to find source %s: %v\n", sourceId, err)
				return e.Next()
			}
			runAt := e.Record.GetDateTime("run_at")
			if runAt.IsZero() {
				runAt = e.Record.GetDateTime("created")
			}
			source.Set("last_run_at", runAt)
			source.Set("last_result", e.Record.GetString("status"))
			if err := SaveRecord(app, source); err != nil {
				log.Printf("[Opportunity] failed to update source %s: %v\n", sourceId, err)
			}
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordCreate("bid_opportunities").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if e.Record.GetString("status") == "" {
				e.Record.Set("status", "pending_review")
			}
			if e.Record.GetString("relevance") == "" {
				e.Record.Set("relevance", "needs_manual_review")
			}
			if e.Record.GetString("classification_version") == "" {
				e.Record.Set("classification_version", "chemical-relevance-v1")
			}
			if e.Record.GetString("relevance") == "needs_manual_review" {
				e.Record.Set("needs_human_check", true)
			}
			if e.Record.GetString("urgency") == "" {
				e.Record.Set("urgency", inferUrgency(e.Record.GetString("deadline_date")))
			}
			if e.Record.GetString("fingerprint") == "" {
				e.Record.Set("fingerprint", strings.TrimSpace(e.Record.GetString("source_name")+"|"+e.Record.GetString("title")))
			}
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordCreate("opportunity_reviews").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if e.Record.GetString("review_type") == "" {
				e.Record.Set("review_type", "employee")
			}
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordCreate("agent_login_sessions").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if e.Record.GetString("status") == "" {
				e.Record.Set("status", "login_required")
			}
			if e.Record.GetString("security_note") == "" {
				e.Record.Set("security_note", "仅保存服务器浏览器会话状态引用，不在 ERP 明文展示 cookie、密码或 token。")
			}
			if e.Record.GetString("login_url") == "" {
				e.Record.Set("login_url", e.Record.GetString("browser_url"))
			}
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordCreate("agent_tasks").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if e.Record.GetString("status") == "" {
				e.Record.Set("status", "pending")
			}
			if e.Record.GetString("session_status") == "" && e.Record.GetString("session") != "" {
				e.Record.Set("session_status", "login_required")
			}
			if e.Record.GetDateTime("last_attempt_at").IsZero() {
				e.Record.Set("last_attempt_at", types.NowDateTime())
			}
			return e.Next()
		},
		Priority: 0,
	})

	app.OnRecordUpdate("bid_opportunities").Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			if e.Record.GetString("status") == "converted" && e.Record.GetDateTime("quote_ready_at").IsZero() {
				e.Record.Set("quote_ready_at", types.NowDateTime())
			}
			return e.Next()
		},
		Priority: 0,
	})

	log.Println("[Hooks] Opportunity hooks registered")
}

func inferUrgency(deadline string) string {
	if deadline == "" {
		return "unknown"
	}
	parsed, err := time.Parse("2006-01-02", strings.Split(deadline, " ")[0])
	if err != nil {
		return "unknown"
	}
	days := int(time.Until(parsed.Add(24*time.Hour)) / (24 * time.Hour))
	if days <= 3 {
		return "urgent"
	}
	if days <= 7 {
		return "soon"
	}
	return "normal"
}
