import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateBusinessDealFinancials } from './business-deal-financials.ts';

test('aggregates a one-to-many deal without allocating profit to individual contracts', () => {
  const result = calculateBusinessDealFinancials({
    salesContracts: [{
      id: 'sale-1', total_quantity: 100, unit_price: 10, total_amount: 1_000,
      is_price_excluding_tax: true, is_cross_border: false, executed_quantity: 60,
    }],
    purchaseContracts: [
      { id: 'purchase-1', total_quantity: 40, total_amount: 226, is_cross_border: false },
      { id: 'purchase-2', total_quantity: 60, total_amount: 339, is_cross_border: false },
    ],
    salesShipments: [{ sales_contract: 'sale-1', quantity: 60 }],
    purchaseArrivals: [
      { purchase_contract: 'purchase-1', quantity: 40, freight_1: 5, freight_1_currency: 'CNY' },
      { purchase_contract: 'purchase-2', quantity: 30, freight_1: 5, freight_1_currency: 'CNY' },
    ],
    exchangeRate: 7,
  });

  assert.equal(result.profit.salesAmountIncTax, 1_130);
  assert.equal(result.profit.purchaseAmountIncTax, 565);
  assert.equal(result.costs.freight, 10);
  assert.ok(Math.abs(result.realizedProfit.salesAmountIncTax - 678) < 0.000001);
  assert.equal(result.realizedProfit.purchaseAmountIncTax, 395.5);
  assert.equal(result.quantityMatched, true);
});

test('converts cross-border payments and contract amounts to CNY per purchase contract', () => {
  const result = calculateBusinessDealFinancials({
    salesContracts: [],
    purchaseContracts: [
      { id: 'domestic', total_quantity: 1, total_amount: 100, is_cross_border: false },
      { id: 'overseas', total_quantity: 1, total_amount: 100, is_cross_border: true },
    ],
    purchasePayments: [
      { purchase_contract: 'domestic', amount: 50 },
      { purchase_contract: 'overseas', amount: 50 },
    ],
    exchangeRate: 7,
  });

  assert.equal(result.profit.purchaseAmountIncTax, 800);
  assert.equal(result.purchasePaidAmount, 400);
});
