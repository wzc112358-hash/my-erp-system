import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateContractProfit } from './contract-profit.ts';

test('calculates the same CNY net-profit inputs used by linked contract detail', () => {
  const result = calculateContractProfit({
    salesAmount: 1_130,
    salesPriceExcludingTax: false,
    purchaseAmount: 565,
    freight: 20,
    miscellaneous: 10,
    tariff: 5,
    valueAddedTax: 3,
  });

  assert.ok(Math.abs(result.salesAmountExTax - 1_000) < 0.000001);
  assert.ok(Math.abs(result.purchaseAmountExTax - 500) < 0.000001);
  assert.ok(Math.abs(result.operatingProfit - 462) < 0.000001);
  assert.ok(Math.abs(result.taxAmount - 106.2765) < 0.000001);
  assert.ok(Math.abs(result.netProfit - 420.7235) < 0.000001);
});

test('adds tax to an excluding-tax sales contract before calculating net profit', () => {
  const result = calculateContractProfit({
    salesAmount: 1_000,
    salesPriceExcludingTax: true,
    purchaseAmount: 565,
    freight: 0,
    miscellaneous: 0,
    tariff: 0,
    valueAddedTax: 0,
  });

  assert.equal(result.salesAmountIncTax, 1_130);
  assert.ok(Math.abs(result.operatingProfit - 500) < 0.000001);
  assert.ok(Math.abs(result.netProfit - 458.7235) < 0.000001);
});

test('uses the tax-rate snapshot supplied by an overall business deal', () => {
  const result = calculateContractProfit({
    salesAmount: 1_130,
    salesPriceExcludingTax: false,
    purchaseAmount: 565,
    freight: 0,
    miscellaneous: 0,
    tariff: 0,
    valueAddedTax: 0,
    taxRate: 0.2,
  });
  assert.equal(result.taxAmount, 113);
  assert.equal(result.netProfit, 452);
});
