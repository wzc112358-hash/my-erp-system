import assert from 'node:assert/strict';
import test from 'node:test';

import type { OverviewContract } from '../../../types/comparison.ts';
import { buildRelationRows } from './overview-model.ts';
import type { OverviewRelationFilter } from './overview-model.ts';

const contract = (values: Partial<OverviewContract> & Pick<OverviewContract, 'id' | 'type'>): OverviewContract => ({
  no: values.id,
  productName: '测试产品',
  quantity: 1,
  totalAmount: 100,
  created: '2026-08-01',
  ...values,
});

const salesContracts = [
  contract({ id: 'sales-linked', type: 'sales', businessDealId: 'deal-one', associatedPurchaseIds: ['purchase-linked'] }),
  contract({ id: 'sales-unlinked', type: 'sales' }),
];

const purchaseContracts = [
  contract({ id: 'purchase-linked', type: 'purchase', businessDealId: 'deal-one', associatedSalesIds: ['sales-linked'] }),
  contract({ id: 'purchase-unlinked', type: 'purchase' }),
];

const rowsFor = (relationFilter: OverviewRelationFilter) => buildRelationRows({
  salesContracts,
  purchaseContracts,
  searchText: '',
  dateRange: null,
  relationFilter,
  sortField: 'no',
  sortDescending: false,
});

test('keeps the current mixed overview as the default all-contract view', () => {
  assert.deepEqual(rowsFor('all').map((row) => row.id), [
    'purchase-purchase-unlinked',
    'deal-deal-one',
    'sales-sales-unlinked',
  ]);
});

test('shows only standalone sales and purchase contracts', () => {
  const rows = rowsFor('unlinked');

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => !row.dealId));
  assert.deepEqual(new Set(rows.map((row) => row.sales[0]?.id || row.purchases[0]?.id)), new Set([
    'sales-unlinked',
    'purchase-unlinked',
  ]));
});

test('shows only aligned sales-purchase relationships', () => {
  const rows = rowsFor('linked');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sales[0]?.id, 'sales-linked');
  assert.deepEqual(rows[0].purchases.map((purchase) => purchase.id), ['purchase-linked']);
});
