package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/wzc11/pocketbase-hooks/hooks"
)

func main() {
	app := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: "./pb_data",
	})

	hooks.RegisterHooks(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
