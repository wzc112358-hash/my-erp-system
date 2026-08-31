import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContractRelationIndex,
  getPurchaseAllocationRatio,
  hasPurchaseContractRelation,
  hasSalesContractRelation,
  matchesContractRelationFilter,
} from './contract-relations.ts';

test('combines both relation directions and deduplicates mirrored edges', () => {
  const salesContracts = [
    { id: 'sales-1', purchase_contract: 'purchase-1', total_quantity: 10 },
    { id: 'sales-2', purchase_contract: 'purchase-1', total_quantity: 15 },
  ];
  const purchaseContracts = [
    { id: 'purchase-1', sales_contract: 'sales-1' },
    { id: 'purchase-2', sales_contract: 'sales-1' },
  ];

  const index = buildContractRelationIndex(salesContracts, purchaseContracts);

  assert.deepEqual(index.purchaseIdsBySales.get('sales-1'), ['purchase-1', 'purchase-2']);
  assert.deepEqual(index.purchaseIdsBySales.get('sales-2'), ['purchase-1']);
  assert.deepEqual(index.salesIdsByPurchase.get('purchase-1'), ['sales-1', 'sales-2']);
  assert.deepEqual(index.salesIdsByPurchase.get('purchase-2'), ['sales-1']);
  assert.deepEqual(index.edges, [
    { salesId: 'sales-1', purchaseId: 'purchase-1' },
    { salesId: 'sales-1', purchaseId: 'purchase-2' },
    { salesId: 'sales-2', purchaseId: 'purchase-1' },
  ]);
  assert.equal(getPurchaseAllocationRatio(index, salesContracts, 'purchase-1', 'sales-1'), 0.4);
  assert.equal(getPurchaseAllocationRatio(index, salesContracts, 'purchase-1', 'sales-2'), 0.6);
  assert.equal(getPurchaseAllocationRatio(index, salesContracts, 'purchase-2', 'sales-1'), 1);
});

test('ignores dangling relation ids that are outside the loaded contract set', () => {
  const index = buildContractRelationIndex(
    [{ id: 'sales-1', purchase_contract: 'missing-purchase' }],
    [{ id: 'purchase-1', sales_contract: 'missing-sales' }],
  );

  assert.deepEqual(index.edges, []);
  assert.deepEqual(index.purchaseIdsBySales.get('sales-1'), []);
  assert.deepEqual(index.salesIdsByPurchase.get('purchase-1'), []);
});

test('detects direct and reverse contract relations for employee lists', () => {
  const salesContracts = [
    { id: 'sales-direct', purchase_contract: 'purchase-direct' },
    { id: 'sales-reverse' },
    { id: 'sales-unlinked' },
  ];
  const purchaseContracts = [
    { id: 'purchase-direct' },
    { id: 'purchase-reverse', sales_contract: 'sales-reverse' },
    { id: 'purchase-unlinked' },
  ];

  assert.equal(hasSalesContractRelation(salesContracts[0], purchaseContracts), true);
  assert.equal(hasSalesContractRelation(salesContracts[1], purchaseContracts), true);
  assert.equal(hasSalesContractRelation(salesContracts[2], purchaseContracts), false);
  assert.equal(hasPurchaseContractRelation(purchaseContracts[0], salesContracts), true);
  assert.equal(hasPurchaseContractRelation(purchaseContracts[1], salesContracts), true);
  assert.equal(hasPurchaseContractRelation(purchaseContracts[2], salesContracts), false);
});

test('matches all, linked, and unlinked relation filters', () => {
  assert.equal(matchesContractRelationFilter(false, 'all'), true);
  assert.equal(matchesContractRelationFilter(true, 'all'), true);
  assert.equal(matchesContractRelationFilter(true, 'linked'), true);
  assert.equal(matchesContractRelationFilter(false, 'linked'), false);
  assert.equal(matchesContractRelationFilter(false, 'unlinked'), true);
  assert.equal(matchesContractRelationFilter(true, 'unlinked'), false);
});
