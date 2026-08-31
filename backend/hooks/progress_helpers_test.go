package hooks

import (
	"testing"

	validation "github.com/go-ozzo/ozzo-validation/v4"
)

func TestCheckOverageReturnsFieldValidationError(t *testing.T) {
	err := CheckOverage(14.62, 7.31, 1.0, "付款产品数量", "product_amount")

	validationErrors, ok := err.(validation.Errors)
	if !ok {
		t.Fatalf("expected validation.Errors, got %T: %v", err, err)
	}

	fieldErr, ok := validationErrors["product_amount"]
	if !ok {
		t.Fatalf("expected product_amount field error, got %#v", validationErrors)
	}

	want := "付款产品数量总和(14.62)不能超过合同总数量(7.31)"
	if fieldErr.Error() != want {
		t.Fatalf("expected %q, got %q", want, fieldErr.Error())
	}
}

func TestCheckOverageAllowsQuantityWithinLimit(t *testing.T) {
	if err := CheckOverage(7.31, 7.31, 1.0, "付款产品数量", "product_amount"); err != nil {
		t.Fatalf("expected no error at the contract limit, got %v", err)
	}
}
