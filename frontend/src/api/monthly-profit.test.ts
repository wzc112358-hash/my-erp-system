import assert from 'node:assert/strict';
import test from 'node:test';

import type { MonthlyProfitContract } from '../types/monthly-profit.ts';
import { summarizeMonthlyProfits } from '../lib/monthly-profit.ts';

const contract = (values: Partial<MonthlyProfitContract> & Pick<MonthlyProfitContract, 'id' | 'signDate' | 'netProfit'>): MonthlyProfitContract => ({
  primarySalesId: values.id,
  no: values.id,
  customerName: '客户',
  productName: '产品',
  purchaseContractCount: 1,
  salesContractCount: 1,
  taxRate: 0.1881,
  salesAmountIncTax: 100,
  purchaseAmountIncTax: 50,
  freight: 1,
  miscellaneous: 2,
  tariff: 3,
  valueAddedTax: 4,
  operatingProfit: 40,
  taxAmount: 5,
  ...values,
});

test('monthly profit equals the sum of its linked-contract details', () => {
  const months = summarizeMonthlyProfits(2026, [
    contract({ id: 'a', signDate: '2026-01-02', netProfit: 20 }),
    contract({ id: 'b', signDate: '2026-01-20', netProfit: -5 }),
    contract({ id: 'c', signDate: '2026-12-20', netProfit: 30 }),
    contract({ id: 'outside', signDate: '2025-12-20', netProfit: 99 }),
  ]);

  assert.equal(months.length, 12);
  assert.equal(months[0].contractCount, 2);
  assert.equal(months[0].netProfit, 15);
  assert.equal(months[0].expenses, 20);
  assert.equal(months[11].netProfit, 30);
});
