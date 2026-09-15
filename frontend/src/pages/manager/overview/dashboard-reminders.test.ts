import assert from 'node:assert/strict';
import test from 'node:test';

import type { OverviewContract } from '../../../types/comparison.ts';
import { buildDashboardContractReminders } from './dashboard-reminders.ts';

const contract = (values: Partial<OverviewContract> & Pick<OverviewContract, 'id' | 'type'>): OverviewContract => ({
  no: values.id,
  productName: '测试产品',
  quantity: 1,
  totalAmount: 100,
  created: '2026-09-01',
  status: 'executing',
  ...values,
});

test('only active sales contracts with a positive outstanding amount are reminded', () => {
  const reminders = buildDashboardContractReminders([
    contract({ id: 's-paid', type: 'sales', outstandingAmount: 0 }),
    contract({ id: 's-rounding', type: 'sales', outstandingAmount: 0.004 }),
    contract({ id: 's-due', type: 'sales', outstandingAmount: 320 }),
    contract({ id: 's-cancelled', type: 'sales', outstandingAmount: 500, status: 'cancelled' }),
  ], []);

  assert.deepEqual(reminders.outstandingSales.map((item) => item.id), ['s-due']);
});

test('groups purchase reminders by contract and reports the invoice total', () => {
  const reminders = buildDashboardContractReminders([], [
    contract({ id: 'p-one', type: 'purchase', unverifiedInvoiceCount: 1 }),
    contract({ id: 'p-three', type: 'purchase', unverifiedInvoiceCount: 3 }),
    contract({ id: 'p-verified', type: 'purchase', unverifiedInvoiceCount: 0 }),
    contract({ id: 'p-cancelled', type: 'purchase', unverifiedInvoiceCount: 4, status: 'cancelled' }),
  ]);

  assert.deepEqual(reminders.unverifiedPurchases.map((item) => item.id), ['p-three', 'p-one']);
  assert.equal(reminders.unverifiedInvoiceCount, 4);
});
