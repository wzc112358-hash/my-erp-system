package hooks

import (
	"errors"
	"fmt"
	"math"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"
)

var errInsufficientInventory = errors.New("insufficient inventory")

type inventoryAggregate struct {
	remaining float64
	totalIn   float64
	totalOut  float64
	lastIn    string
	lastOut   string
}

// RegisterInventoryHooks keeps each stock movement and its inventory summary
// in one database transaction. This is the authoritative inventory write seam;
// clients only create/update/delete movements and never have to maintain totals.
func RegisterInventoryHooks(app core.App) {
	bindManagerOnlyCreate(app, "inventory")
	bindManagerOnlyDelete(app, "inventory")

	app.OnRecordUpdateRequest("inventory").Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			if err := requireManager(e); err != nil {
				return err
			}
			return runRecordRequestTransaction(e, func(txApp core.App) error {
				if err := e.Next(); err != nil {
					return err
				}
				return recalculateInventory(txApp, e.Record.Id)
			})
		},
	})

	bindStockMovementMutation(app, app.OnRecordCreateRequest("stock_movements"))
	bindStockMovementMutation(app, app.OnRecordUpdateRequest("stock_movements"))
	bindStockMovementMutation(app, app.OnRecordDeleteRequest("stock_movements"))
}

func bindManagerOnlyCreate(app core.App, collection string) {
	app.OnRecordCreateRequest(collection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			if err := requireManager(e); err != nil {
				return err
			}
			return e.Next()
		},
	})
}

func bindManagerOnlyDelete(app core.App, collection string) {
	app.OnRecordDeleteRequest(collection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			if err := requireManager(e); err != nil {
				return err
			}
			return e.Next()
		},
	})
}

func bindStockMovementMutation(app core.App, requestHook *hook.TaggedHook[*core.RecordRequestEvent]) {
	requestHook.Bind(&hook.Handler[*core.RecordRequestEvent]{
		Func: func(e *core.RecordRequestEvent) error {
			if err := requireManager(e); err != nil {
				return err
			}

			inventoryID := e.Record.GetString("inventory")
			if inventoryID == "" {
				return router.NewBadRequestError("请选择库存商品", nil)
			}

			return runRecordRequestTransaction(e, func(txApp core.App) error {
				if e.Request.Method != "DELETE" {
					if err := validateStockMovement(e.Record); err != nil {
						return router.NewBadRequestError("出入库数据不正确", err)
					}
				}
				if err := e.Next(); err != nil {
					return err
				}

				err := recalculateInventory(txApp, inventoryID)
				if errors.Is(err, errInsufficientInventory) {
					return router.NewBadRequestError("库存不足，无法出库", err)
				}
				if err != nil {
					return router.NewInternalServerError("库存汇总更新失败", err)
				}
				return nil
			})
		},
	})
}

func runRecordRequestTransaction(e *core.RecordRequestEvent, fn func(core.App) error) error {
	originalApp := e.App
	return originalApp.RunInTransaction(func(txApp core.App) error {
		e.App = txApp
		defer func() { e.App = originalApp }()
		return fn(txApp)
	})
}

func requireManager(e *core.RecordRequestEvent) error {
	if e.HasSuperuserAuth() || (e.Auth != nil && e.Auth.GetString("type") == "manager") {
		return nil
	}
	return router.NewForbiddenError("仅经理账号可以维护库存", nil)
}

func validateStockMovement(record *core.Record) error {
	movementType := record.GetString("movement_type")
	if movementType != "in" && movementType != "out" {
		return validation.Errors{
			"movement_type": validation.NewError("invalid_movement_type", "出入库类型必须是入库或出库"),
		}
	}
	if quantity := record.GetFloat("quantity"); quantity <= 0 || math.IsNaN(quantity) || math.IsInf(quantity, 0) {
		return validation.Errors{
			"quantity": validation.NewError("invalid_quantity", "数量必须大于 0"),
		}
	}
	return nil
}

func calculateInventoryAggregate(inventory *core.Record, movements []*core.Record) (inventoryAggregate, error) {
	// remaining - totalIn + totalOut is the manual opening/baseline stock.
	// Keeping it makes the new server compatible with existing manually adjusted
	// stock while allowing the movement totals to be rebuilt authoritatively.
	result := inventoryAggregate{
		remaining: inventory.GetFloat("remaining_quantity") -
			inventory.GetFloat("total_in_quantity") +
			inventory.GetFloat("total_out_quantity"),
	}

	for _, movement := range movements {
		quantity := movement.GetFloat("quantity")
		created := movement.GetString("created")
		switch movement.GetString("movement_type") {
		case "in":
			result.totalIn += quantity
			if created > result.lastIn {
				result.lastIn = created
			}
		case "out":
			result.totalOut += quantity
			if created > result.lastOut {
				result.lastOut = created
			}
		}
	}

	result.remaining += result.totalIn - result.totalOut
	if result.remaining < -1e-9 {
		return inventoryAggregate{}, fmt.Errorf("%w: remaining %.6f", errInsufficientInventory, result.remaining)
	}
	if math.Abs(result.remaining) < 1e-9 {
		result.remaining = 0
	}
	return result, nil
}

func recalculateInventory(app core.App, inventoryID string) error {
	inventory, err := app.FindRecordById("inventory", inventoryID)
	if err != nil {
		return err
	}
	movements, err := app.FindRecordsByFilter(
		"stock_movements",
		"inventory = {:inventory}",
		"",
		0,
		0,
		dbx.Params{"inventory": inventoryID},
	)
	if err != nil {
		return err
	}

	aggregate, err := calculateInventoryAggregate(inventory, movements)
	if err != nil {
		return err
	}
	inventory.Set("remaining_quantity", aggregate.remaining)
	inventory.Set("total_in_quantity", aggregate.totalIn)
	inventory.Set("total_out_quantity", aggregate.totalOut)
	inventory.Set("last_in_date", aggregate.lastIn)
	inventory.Set("last_out_date", aggregate.lastOut)
	return app.Save(inventory)
}
