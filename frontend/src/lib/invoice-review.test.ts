import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceReviewEditPath, isInvoiceReviewCollection } from './invoice-review.ts';

test('invoice rejection notifications route to the matching employee invoice page', () => {
  assert.equal(invoiceReviewEditPath('sale_invoices', 'sale/id'), '/sales/invoices?edit=sale%2Fid');
  assert.equal(invoiceReviewEditPath('purchase_invoices', 'purchase/id'), '/purchase/invoices?edit=purchase%2Fid');
});

test('only invoice collections enter the resubmission flow', () => {
  assert.equal(isInvoiceReviewCollection('sale_invoices'), true);
  assert.equal(isInvoiceReviewCollection('purchase_invoices'), true);
  assert.equal(isInvoiceReviewCollection('sale_receipts'), false);
  assert.equal(isInvoiceReviewCollection(undefined), false);
});
