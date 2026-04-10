package hooks

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func RegisterHooks(app *pocketbase.PocketBase) {
	RegisterSalesContractHooks(app)
	RegisterPurchaseContractHooks(app)
	RegisterSalesShipmentHooks(app)
	RegisterPurchaseArrivalHooks(app)
	RegisterSaleInvoiceHooks(app)
	RegisterPurchaseInvoiceHooks(app)
	RegisterSaleReceiptHooks(app)
	RegisterPurchasePaymentHooks(app)
	RegisterServiceContractHooks(app)
	RegisterExpenseRecordHooks(app)
	RegisterBiddingRecordHooks(app)

	log.Println("Hooks registered successfully")
}

func GetUsersByType(app *pocketbase.PocketBase, userType string) ([]*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		log.Printf("[GetUsersByType] Failed to find users collection: %v\n", err)
		return nil, err
	}

	records, err := app.FindAllRecords(collection)
	if err != nil {
		log.Printf("[GetUsersByType] Failed to find all records: %v\n", err)
		return nil, err
	}

	log.Printf("[GetUsersByType] Found %d total users\n", len(records))

	var result []*core.Record
	for _, r := range records {
		userTypeValue := r.GetString("type")
		log.Printf("[GetUsersByType] User: %s, type field value: '%s'\n", r.Id, userTypeValue)
		if userTypeValue == userType {
			result = append(result, r)
		}
	}

	log.Printf("[GetUsersByType] Found %d users with type '%s'\n", len(result), userType)

	return result, nil
}

func GetNotificationCollection(app *pocketbase.PocketBase) (*core.Collection, error) {
	return app.FindCollectionByNameOrId("notifications")
}

func GetNotification02Collection(app *pocketbase.PocketBase) (*core.Collection, error) {
	return app.FindCollectionByNameOrId("notifications_02")
}

func CreateNotification02(app *pocketbase.PocketBase, notificationType, title, message, recipientId, purchaseContractId string) error {
	collection, err := GetNotification02Collection(app)
	if err != nil {
		return err
	}

	notification := core.NewRecord(collection)
	notification.Set("type", notificationType)
	notification.Set("title", title)
	notification.Set("message", message)
	notification.Set("is_read", false)
	notification.Set("recipient", recipientId)
	if purchaseContractId != "" {
		notification.Set("purchase_contract", purchaseContractId)
	}

	return app.Save(notification)
}

func CreateNotification(app *pocketbase.PocketBase, notificationType, title, message, recipientId, salesContractId string) error {
	collection, err := GetNotificationCollection(app)
	if err != nil {
		return err
	}

	notification := core.NewRecord(collection)
	notification.Set("type", notificationType)
	notification.Set("title", title)
	notification.Set("message", message)
	notification.Set("is_read", false)
	notification.Set("recipient", recipientId)
	if salesContractId != "" {
		notification.Set("sales_contract", salesContractId)
	}

	return app.Save(notification)
}

func GetRecordsByFilter(app *pocketbase.PocketBase, collectionName, filter string) ([]*core.Record, error) {
	return app.FindRecordsByFilter(
		collectionName,
		filter,
		"-created",
		0,
		0,
	)
}

func CountRecords(app *pocketbase.PocketBase, collectionName, filter string) (int, error) {
	records, err := GetRecordsByFilter(app, collectionName, filter)
	if err != nil {
		return 0, err
	}
	return len(records), nil
}

func GetContractsByDatePrefix(app *pocketbase.PocketBase, collectionName, prefix string) ([]*core.Record, error) {
	filter := "no ~ '" + prefix + "%'"
	return GetRecordsByFilter(app, collectionName, filter)
}

func GetRecordsByField(app *pocketbase.PocketBase, collectionName, fieldName, fieldValue string) ([]*core.Record, error) {
	filter := fieldName + " = '" + fieldValue + "'"
	return GetRecordsByFilter(app, collectionName, filter)
}

func GetRecordById(app *pocketbase.PocketBase, collectionName, id string) (*core.Record, error) {
	return app.FindRecordById(collectionName, id)
}

func SaveRecord(app *pocketbase.PocketBase, record *core.Record) error {
	return app.Save(record)
}

func GetCollection(app *pocketbase.PocketBase, collectionName string) (*core.Collection, error) {
	return app.FindCollectionByNameOrId(collectionName)
}

func SumField(records []*core.Record, fieldName string) float64 {
	var total float64
	for _, r := range records {
		total += r.GetFloat(fieldName)
	}
	return total
}

func HasField(record *core.Record, fieldName string) bool {
	return record != nil && record.Get(fieldName) != nil
}

func GetStringField(record *core.Record, fieldName string) string {
	if record == nil {
		return ""
	}
	return record.GetString(fieldName)
}

func GetFloatField(record *core.Record, fieldName string) float64 {
	if record == nil {
		return 0
	}
	return record.GetFloat(fieldName)
}

func SetFields(record *core.Record, fields map[string]any) {
	for k, v := range fields {
		record.Set(k, v)
	}
}

func OnRecordBeforeCreateRequest(app *pocketbase.PocketBase, collection string, handler func(e *core.RecordEvent) error) {
	app.OnRecordCreate(collection).Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			err := handler(e)
			if err != nil {
				return err
			}
			return e.Next()
		},
		Priority: 0,
	})
}

func OnRecordAfterCreateRequest(app *pocketbase.PocketBase, collection string, handler func(e *core.RecordEvent) error) {
	app.OnRecordAfterCreateSuccess(collection).Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			err := handler(e)
			if err != nil {
				return err
			}
			return e.Next()
		},
		Priority: 0,
	})
}

func OnRecordAfterDeleteRequest(app *pocketbase.PocketBase, collection string, handler func(e *core.RecordEvent) error) {
	app.OnRecordAfterDeleteSuccess(collection).Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			err := handler(e)
			if err != nil {
				return err
			}
			return e.Next()
		},
		Priority: 0,
	})
}

func OnRecordAfterUpdateRequest(app *pocketbase.PocketBase, collection string, handler func(e *core.RecordEvent) error) {
	app.OnRecordAfterUpdateSuccess(collection).Bind(&hook.Handler[*core.RecordEvent]{
		Func: func(e *core.RecordEvent) error {
			err := handler(e)
			if err != nil {
				return err
			}
			return e.Next()
		},
		Priority: 0,
	})
}
