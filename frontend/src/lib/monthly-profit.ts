import type { MonthlyProfitContract, MonthlyProfitRow } from '../types/monthly-profit.ts';
import { businessMonthKey } from './business-month.ts';

const cnyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCny = (value: number) => cnyFormatter.format(value || 0);

export const summarizeMonthlyProfits = (
  year: number,
  contracts: MonthlyProfitContract[],
): MonthlyProfitRow[] => {
  const months: MonthlyProfitRow[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    monthKey: `${year}-${String(index + 1).padStart(2, '0')}`,
    label: `${index + 1}月`,
    contractCount: 0,
    salesAmountIncTax: 0,
    purchaseAmountIncTax: 0,
    expenses: 0,
    operatingProfit: 0,
    taxAmount: 0,
    netProfit: 0,
    contracts: [],
  }));

  contracts.forEach((contract) => {
    const monthKey = businessMonthKey(contract.signDate);
    if (!monthKey.startsWith(`${year}-`)) return;
    const month = months[Number(monthKey.slice(5, 7)) - 1];
    if (!month) return;
    month.contracts.push(contract);
    month.contractCount += 1;
    month.salesAmountIncTax += contract.salesAmountIncTax;
    month.purchaseAmountIncTax += contract.purchaseAmountIncTax;
    month.expenses += contract.freight
      + contract.miscellaneous
      + contract.tariff
      + contract.valueAddedTax;
    month.operatingProfit += contract.operatingProfit;
    month.taxAmount += contract.taxAmount;
    month.netProfit += contract.netProfit;
  });

  months.forEach((month) => {
    month.contracts.sort((left, right) => right.signDate.localeCompare(left.signDate));
  });
  return months;
};
