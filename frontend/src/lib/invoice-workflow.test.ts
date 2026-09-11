import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceNeedsManagerAction } from './invoice-workflow.ts';

test('an invoice remains pending until both confirmation and verification are complete', () => {
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'pending', is_verified: 'no' }), true);
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'approved', is_verified: 'no' }), true);
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'pending', is_verified: 'yes' }), true);
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'approved', is_verified: 'yes' }), false);
});

test('legacy invoices without a verification value are treated as unverified', () => {
  assert.equal(invoiceNeedsManagerAction({ manager_confirmed: 'approved' }), true);
});
