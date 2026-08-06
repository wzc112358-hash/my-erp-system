import assert from 'node:assert/strict';
import test from 'node:test';

import type { OverviewContract } from '../../../types/comparison.ts';
import { buildRecentContractDashboard, recentMonthKeys } from './recent-contract-overview.ts';

const contract = (values: Partial<OverviewContract> & Pick<OverviewContract, 'id' | 'type'>): OverviewContract => ({
  no: values.id,
  productName: '测试产品',
  quantity: 1,
  totalAmount: 100,
  created: '',
  status: 'executing',
  invoiceProgress: 0,
  settlementProgress: 0,
  ...values,
});

test('builds three calendar-month windows across a year boundary', () => {
  assert.deepEqual(
    recentMonthKeys(new Date(2026, 0, 15)).map((month) => month.key),
    ['2026-01', '2025-12', '2025-11'],
  );
});

test('links purchase contracts and calculates the current-month full collection rate', () => {
  const sales = [
    contract({ id: 's1', type: 'sales', signDate: '2026-08-02', associatedPurchaseIds: ['p1'], invoiceProgress: 100, settlementProgress: 100 }),
    contract({ id: 's2', type: 'sales', signDate: '2026-08-03', settlementProgress: 50 }),
    contract({ id: 's3', type: 'sales', signDate: '2026-07-03', associatedPurchaseIds: ['p2'], status: 'cancelled' }),
  ];
  const purchases = [
    contract({ id: 'p1', type: 'purchase', invoiceProgress: 80, settlementProgress: 60 }),
    contract({ id: 'p2', type: 'purchase', invoiceProgress: 100, settlementProgress: 100 }),
  ];

  const dashboard = buildRecentContractDashboard(sales, purchases, new Date(2026, 7, 6));

  assert.equal(dashboard.months[0].groups.length, 1);
  assert.equal(dashboard.months[0].groups[0].purchaseInvoiceProgress, 80);
  assert.equal(dashboard.collection.contractCount, 2);
  assert.equal(dashboard.collection.completedCount, 1);
  assert.equal(dashboard.collection.percent, 50);
});
