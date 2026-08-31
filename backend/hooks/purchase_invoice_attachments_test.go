package hooks

import "testing"

func TestShouldPreservePurchaseInvoiceAttachments(t *testing.T) {
	tests := []struct {
		name            string
		oldAttachments  []string
		newAttachments  []string
		submittedFields map[string]any
		want            bool
	}{
		{
			name:            "verification update cannot clear an existing attachment",
			oldAttachments:  []string{"invoice.pdf"},
			submittedFields: map[string]any{"is_verified": "yes", "attachments": ""},
			want:            true,
		},
		{
			name:            "manager confirmation cannot clear an existing attachment",
			oldAttachments:  []string{"invoice.pdf"},
			submittedFields: map[string]any{"manager_confirmed": "approved", "attachments": ""},
			want:            true,
		},
		{
			name:            "partial verification update already preserves attachments",
			oldAttachments:  []string{"invoice.pdf"},
			newAttachments:  []string{"invoice.pdf"},
			submittedFields: map[string]any{"is_verified": "yes"},
			want:            false,
		},
		{
			name:            "ordinary attachment removal is not treated as a status update",
			oldAttachments:  []string{"invoice.pdf"},
			submittedFields: map[string]any{"attachments": ""},
			want:            false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := shouldPreservePurchaseInvoiceAttachments(
				test.oldAttachments,
				test.newAttachments,
				test.submittedFields,
			)
			if got != test.want {
				t.Fatalf("want %v, got %v", test.want, got)
			}
		})
	}
}
