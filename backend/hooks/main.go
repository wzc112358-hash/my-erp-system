package hooks

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
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
	RegisterSettingsHooks(app)
	RegisterInventoryHooks(app)
	RegisterContractRelationHooks(app)
	RegisterContractOperationRoutes(app)
	RegisterBusinessDealRoutes(app)
	RegisterRecycleBinRoutes(app)
	RegisterManagerConfirmationRoutes(app)
	RegisterInvoiceResubmissionRoutes(app)
	RegisterBusinessRecordAuditHooks(app)

	log.Println("Hooks registered successfully")
}

func GetUsersByType(app core.App, userType string) ([]*core.Record, error) {
	records, err := app.FindRecordsByFilter(
		"users",
		"type = {:userType}",
		"-created",
		0,
		0,
		dbx.Params{"userType": userType},
	)
	if err != nil {
		log.Printf("[GetUsersByType] Failed to get users: %v\n", err)
		return nil, err
	}

	log.Printf("[GetUsersByType] Found %d users with type '%s'\n", len(records), userType)

	return records, nil
}

func GetPurchasingNotificationCollection(app core.App) (*core.Collection, error) {
	return app.FindCollectionByNameOrId(purchasingNotificationsCollection)
}

func GetSalesNotificationCollection(app core.App) (*core.Collection, error) {
	return app.FindCollectionByNameOrId(salesNotificationsCollection)
}

func CreateSalesNotification(app core.App, notificationType, title, message, recipientId, purchaseContractId string) error {
	collection, err := GetSalesNotificationCollection(app)
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

func CreatePurchasingNotification(app core.App, notificationType, title, message, recipientId, salesContractId string) error {
	collection, err := GetPurchasingNotificationCollection(app)
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

func GetRecordsByField(app core.App, collectionName, fieldName, fieldValue string) ([]*core.Record, error) {
	filter := fieldName + " = {:fieldValue}"
	if collection, err := app.FindCollectionByNameOrId(collectionName); err == nil && collection.Fields.GetByName("deleted_at") != nil {
		filter += " && deleted_at = ''"
	}
	return app.FindRecordsByFilter(
		collectionName,
		filter,
		"",
		0,
		0,
		dbx.Params{"fieldValue": fieldValue},
	)
}

func GetRecordById(app core.App, collectionName, id string) (*core.Record, error) {
	return app.FindRecordById(collectionName, id)
}

func SumField(records []*core.Record, fieldName string) float64 {
	var total float64
	for _, r := range records {
		total += r.GetFloat(fieldName)
	}
	return total
}

// finishPostCommit keeps a successfully persisted record from being reported as
// failed just because a derived contract-progress refresh encountered an error.
// The refresh remains visible in server logs and can be recalculated later.
func finishPostCommit(e *core.RecordEvent, label string, refresh func() error) error {
	if isRecycleMutation(e.Context) {
		return e.Next()
	}
	if err := refresh(); err != nil {
		log.Printf("[%s] record was saved but progress refresh failed: %v", label, err)
	}
	return e.Next()
}
