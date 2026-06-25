package hooks

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// ComputePercent returns (total/denominator)*100, guarding against a zero
// denominator by returning 0 (matching the inline `if denominator > 0` guard
// repeated across the business hook files). Keeping the exact same semantics
// so the refactor is behavior-preserving.
func ComputePercent(total, denominator float64) float64 {
	if denominator <= 0 {
		return 0
	}
	return (total / denominator) * 100
}

// CheckOverage reproduces the inline "child sum must not exceed contract total"
// guard used by every business hook. toleranceMultiplier scales the contract
// total quantity (1.0 for most collections, 1.05 for sale_receipts which allow
// a 5% overage). itemLabel is used verbatim in the user-facing error message,
// e.g. "收款产品数量" / "发货数量".
func CheckOverage(totalProductAmount, contractTotalQuantity, toleranceMultiplier float64, itemLabel string) error {
	if totalProductAmount > contractTotalQuantity*toleranceMultiplier {
		return fmt.Errorf("%s总和(%.2f)不能超过合同总数量(%.2f)", itemLabel, totalProductAmount, contractTotalQuantity)
	}
	return nil
}

// SumChildFieldExcluding reproduces the Update-handler pattern of summing a
// child field across all records of a contract, then replacing the current
// record's stored value with its new value (subtract old persisted value, add
// the incoming new value). currentRecordId is the Id of the record being
// updated; newValue is the freshly submitted value for sumField.
//
// Returns the adjusted total. If currentRecordId is not found among records,
// the raw sum is returned unchanged (same as the inline loops, which `break`
// without adjusting if no match).
func SumChildFieldExcluding(records []*core.Record, sumField, currentRecordId string, newValue float64) float64 {
	total := SumField(records, sumField)
	for _, r := range records {
		if r.Id == currentRecordId {
			total = total - r.GetFloat(sumField) + newValue
			break
		}
	}
	return total
}

// CheckOverageIfChanged runs CheckOverage only when the validated field
// actually changed between the old persisted record and the incoming update.
// This prevents pure status changes (e.g. manager approving a record:
// manager_confirmed pending -> approved) from being blocked by an overage guard
// that was already satisfied (or that reflects pre-existing bad data) at create
// time. If oldRecord is nil (shouldn't normally happen on update) we fall back
// to always checking, preserving the previous behavior.
func CheckOverageIfChanged(oldRecord, newRecord *core.Record, fieldName string, totalProductAmount, contractTotalQuantity, toleranceMultiplier float64, itemLabel string) error {
	if oldRecord == nil {
		return CheckOverage(totalProductAmount, contractTotalQuantity, toleranceMultiplier, itemLabel)
	}
	if oldRecord.GetFloat(fieldName) == newRecord.GetFloat(fieldName) {
		return nil
	}
	return CheckOverage(totalProductAmount, contractTotalQuantity, toleranceMultiplier, itemLabel)
}
