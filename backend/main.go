package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/wzc11/pocketbase-hooks/hooks"
)

func main() {
	app := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: "./pb_data",
	})

	hooks.RegisterHooks(app)
	jsvm.MustRegister(app, jsvm.Config{
		MigrationsDir: "./pb_migrations",
	})
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		TemplateLang: migratecmd.TemplateLangJS,
		Automigrate:  true,
		Dir:          "./pb_migrations",
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
