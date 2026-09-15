import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceNeedsManagerAction, summarizeUnverifiedPurchaseInvoices } from './invoice-workflow.ts';

test('a purchase invoice remains pending until both confirmation and verification are complete', () => {
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'pending', is_verified: 'no' }, true), true);
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'approved', is_verified: 'no' }, true), true);
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'pending', is_verified: 'yes' }, true), true);
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'approved', is_verified: 'yes' }, true), false);
});

test('a sales invoice only requires manager confirmation', () => {
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'pending' }, false), true);
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'approved' }, false), false);
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'approved', is_verified: 'no' }, false), false);
});

test('legacy purchase invoices without a verification value are treated as unverified', () => {
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'approved' }, true), true);
});

test('unverified purchase invoices are grouped by their purchase contract', () => {
  const summaries = summarizeUnverifiedPurchaseInvoices([
    { purchase_contract: 'purchase-a', amount: 100, is_verified: 'no' },
    { purchase_contract: 'purchase-a', amount: 50 },
    { purchase_contract: 'purchase-a', amount: 80, is_verified: 'yes' },
    { purchase_contract: 'purchase-b', amount: 40, is_verified: 'no' },
    { amount: 999, is_verified: 'no' },
  ]);

  assert.deepEqual(summaries.get('purchase-a'), { count: 2, amount: 150 });
  assert.deepEqual(summaries.get('purchase-b'), { count: 1, amount: 40 });
  assert.equal(summaries.size, 2);
});
