package hooks

import (
	"context"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type contractProgressRefreshContextKey struct{}
type previousChildContractContextKey struct{}

type contractProgressSnapshot struct {
	executedQuantity   float64
	executionPercent   float64
	invoicedAmount     float64
	invoicePercent     float64
	uninvoicedAmount   float64
	uninvoicedPercent  float64
	settledAmount      float64
	settlementPercent  float64
	outstandingAmount  float64
	outstandingPercent float64
	status             string
}

func isContractProgressRefresh(ctx context.Context) bool {
	marked, _ := ctx.Value(contractProgressRefreshContextKey{}).(bool)
	return marked
}

func rememberChildContractBeforeUpdate(e *core.RecordEvent, relationField string) {
	if e == nil || e.Record == nil {
		return
	}
	e.Context = context.WithValue(
		e.Context,
		previousChildContractContextKey{},
		e.Record.Original().GetString(relationField),
	)
}

func sumActiveContractChildren(
	app core.App,
	collectionName string,
	relationField string,
	valueField string,
	contractID string,
) (float64, error) {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return 0, fmt.Errorf("find %s collection: %w", collectionName, err)
	}
	filter := relationField + " = {:contract}"
	if collection.Fields.GetByName("deleted_at") != nil {
		filter += " && deleted_at = ''"
	}
	records, err := app.FindRecordsByFilter(
		collectionName,
		filter,
		"",
		0,
		0,
		dbx.Params{"contract": contractID},
	)
	if err != nil {
		return 0, fmt.Errorf("load %s for contract %s: %w", collectionName, contractID, err)
	}
	return SumField(records, valueField), nil
}

func calculateContractProgress(app core.App, contractType string, contract *core.Record) (contractProgressSnapshot, error) {
	if contract == nil || contract.Id == "" {
		return contractProgressSnapshot{}, fmt.Errorf("contract is required")
	}

	totalQuantity := contract.GetFloat("total_quantity")
	totalAmount := contract.GetFloat("total_amount")
	status := contract.GetString("status")

	if contractType == "sales" {
		executed, err := sumActiveContractChildren(app, "sales_shipments", "sales_contract", "quantity", contract.Id)
		if err != nil {
			return contractProgressSnapshot{}, err
		}
		receipted, err := sumActiveContractChildren(app, "sale_receipts", "sales_contract", "amount", contract.Id)
		if err != nil {
			return contractProgressSnapshot{}, err
		}
		invoiced, err := sumActiveContractChildren(app, "sale_invoices", "sales_contract", "amount", contract.Id)
		if err != nil {
			return contractProgressSnapshot{}, err
		}
		receivable := executed * contract.GetFloat("unit_price")
		snapshot := contractProgressSnapshot{
			executedQuantity:   executed,
			executionPercent:   ComputePercent(executed, totalQuantity),
			invoicedAmount:     invoiced,
			invoicePercent:     ComputePercent(invoiced, totalAmount),
			uninvoicedAmount:   totalAmount - invoiced,
			uninvoicedPercent:  ComputePercent(totalAmount-invoiced, totalAmount),
			settledAmount:      receipted,
			settlementPercent:  ComputePercent(receipted, receivable),
			outstandingAmount:  receivable - receipted,
			outstandingPercent: ComputePercent(receivable-receipted, receivable),
			status:             status,
		}
		if status != "cancelled" {
			if snapshot.executionPercent >= 100 && snapshot.settlementPercent >= 100 && snapshot.invoicePercent >= 100 {
				snapshot.status = "completed"
			} else {
				snapshot.status = "executing"
			}
		}
		return snapshot, nil
	}

	if contractType != "purchase" {
		return contractProgressSnapshot{}, fmt.Errorf("unsupported contract type %q", contractType)
	}
	executed, err := sumActiveContractChildren(app, "purchase_arrivals", "purchase_contract", "quantity", contract.Id)
	if err != nil {
		return contractProgressSnapshot{}, err
	}
	invoiced, err := sumActiveContractChildren(app, "purchase_invoices", "purchase_contract", "amount", contract.Id)
	if err != nil {
		return contractProgressSnapshot{}, err
	}
	paid, err := sumActiveContractChildren(app, "purchase_payments", "purchase_contract", "amount", contract.Id)
	if err != nil {
		return contractProgressSnapshot{}, err
	}
	snapshot := contractProgressSnapshot{
		executedQuantity:   executed,
		executionPercent:   ComputePercent(executed, totalQuantity),
		invoicedAmount:     invoiced,
		invoicePercent:     ComputePercent(invoiced, totalAmount),
		uninvoicedAmount:   totalAmount - invoiced,
		uninvoicedPercent:  ComputePercent(totalAmount-invoiced, totalAmount),
		settledAmount:      paid,
		settlementPercent:  ComputePercent(paid, totalAmount),
		outstandingAmount:  totalAmount - paid,
		outstandingPercent: ComputePercent(totalAmount-paid, totalAmount),
		status:             status,
	}
	if status != "cancelled" {
		if snapshot.executionPercent >= 100 && snapshot.invoicePercent >= 100 && snapshot.settlementPercent >= 100 {
			snapshot.status = "completed"
		} else {
			snapshot.status = "executing"
		}
	}
	return snapshot, nil
}

func applyContractProgress(contractType string, contract *core.Record, snapshot contractProgressSnapshot) {
	contract.Set("executed_quantity", snapshot.executedQuantity)
	contract.Set("execution_percent", snapshot.executionPercent)
	contract.Set("invoiced_amount", snapshot.invoicedAmount)
	contract.Set("uninvoiced_amount", snapshot.uninvoicedAmount)
	contract.Set("uninvoiced_percent", snapshot.uninvoicedPercent)
	contract.Set("status", snapshot.status)
	if contractType == "sales" {
		contract.Set("invoice_percent", snapshot.invoicePercent)
		contract.Set("receipted_amount", snapshot.settledAmount)
		contract.Set("receipt_percent", snapshot.settlementPercent)
		contract.Set("debt_amount", snapshot.outstandingAmount)
		contract.Set("debt_percent", snapshot.outstandingPercent)
		return
	}
	contract.Set("invoiced_percent", snapshot.invoicePercent)
	contract.Set("paid_amount", snapshot.settledAmount)
	contract.Set("paid_percent", snapshot.settlementPercent)
	contract.Set("unpaid_amount", snapshot.outstandingAmount)
	contract.Set("unpaid_percent", snapshot.outstandingPercent)
}

func refreshContractProgressFields(app core.App, contractType string, contract *core.Record) error {
	snapshot, err := calculateContractProgress(app, contractType, contract)
	if err != nil {
		return err
	}
	applyContractProgress(contractType, contract, snapshot)
	return nil
}

// recalculateContractProgress is the only post-persist writer for denormalized
// contract progress. Child records remain the source of truth.
func recalculateContractProgress(app core.App, contractType string, contract *core.Record) error {
	if err := refreshContractProgressFields(app, contractType, contract); err != nil {
		return err
	}
	ctx := context.WithValue(context.Background(), contractProgressRefreshContextKey{}, true)
	return app.SaveWithContext(ctx, contract)
}

func recalculateContractProgressByID(app core.App, contractType, contractID string) error {
	if contractID == "" {
		return nil
	}
	collectionName, err := contractCollectionName(contractType)
	if err != nil {
		return err
	}
	contract, err := app.FindRecordById(collectionName, contractID)
	if err != nil {
		return err
	}
	return recalculateContractProgress(app, contractType, contract)
}

// recalculateChildContractProgress refreshes both sides when a child record is
// moved to a different contract. For creates and deletes the current/original
// relation ids are identical or one side is empty, so the same helper applies.
func recalculateChildContractProgress(
	ctx context.Context,
	app core.App,
	contractType,
	relationField string,
	child *core.Record,
) error {
	if child == nil {
		return nil
	}
	previousContractID, _ := ctx.Value(previousChildContractContextKey{}).(string)
	contractIDs := []string{
		child.GetString(relationField),
		previousContractID,
	}
	seen := make(map[string]struct{}, len(contractIDs))
	errs := make([]error, 0, len(contractIDs))
	for _, contractID := range contractIDs {
		if contractID == "" {
			continue
		}
		if _, exists := seen[contractID]; exists {
			continue
		}
		seen[contractID] = struct{}{}
		if err := recalculateContractProgressByID(app, contractType, contractID); err != nil {
			errs = append(errs, fmt.Errorf("contract %s: %w", contractID, err))
		}
	}
	return errors.Join(errs...)
}
