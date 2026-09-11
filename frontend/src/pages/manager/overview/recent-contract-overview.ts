import type { OverviewContract } from '../../../types/comparison.ts';
import { businessMonthKey } from '../../../lib/business-month.ts';

export interface RecentContractGroup {
  id: string;
  date: string;
  sales: OverviewContract[];
  purchases: OverviewContract[];
  salesInvoiceProgress: number;
  salesSettlementProgress: number;
  purchaseInvoiceProgress: number;
  purchaseSettlementProgress: number;
  completionScore: number;
}

export interface RecentMonthWindow {
  key: string;
  label: string;
  relativeLabel: string;
  groups: RecentContractGroup[];
  incompleteCount: number;
}

export interface RecentContractDashboard {
  months: RecentMonthWindow[];
  collection: {
    monthLabel: string;
    contractCount: number;
    completedCount: number;
    percent: number;
  };
}

const clampPercent = (value: number | undefined) => Math.min(100, Math.max(0, Number(value) || 0));

const averageProgress = (contracts: OverviewContract[], field: 'invoiceProgress' | 'settlementProgress') => {
  if (!contracts.length) return 0;
  return contracts.reduce((sum, contract) => sum + clampPercent(contract[field]), 0) / contracts.length;
};

const weightedProgress = (contracts: OverviewContract[], field: 'invoiceProgress' | 'settlementProgress') => {
  const amount = contracts.reduce((sum, contract) => sum + (Number(contract.totalAmount) || 0), 0);
  if (amount <= 0) return averageProgress(contracts, field);
  return contracts.reduce((sum, contract) => (
    sum + clampPercent(contract[field]) * (Number(contract.totalAmount) || 0)
  ), 0) / amount;
};

export const recentMonthKeys = (now = new Date()) => Array.from({ length: 3 }, (_, index) => {
  const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return {
    key: `${date.getFullYear()}-${month}`,
    label: `${date.getFullYear()}年${date.getMonth() + 1}月`,
    relativeLabel: index === 0 ? '本月' : index === 1 ? '上月' : '上上月',
  };
});

export const buildRecentContractDashboard = (
  salesContracts: OverviewContract[],
  purchaseContracts: OverviewContract[],
  now = new Date(),
): RecentContractDashboard => {
  const monthDescriptors = recentMonthKeys(now);
  const purchaseById = new Map(purchaseContracts.map((contract) => [contract.id, contract]));
  const activeSales = salesContracts.filter((contract) => contract.status !== 'cancelled');

  const salesByDeal = new Map<string, OverviewContract[]>();
  activeSales.forEach((sales) => {
    if (!sales.businessDealId) return;
    salesByDeal.set(sales.businessDealId, [...(salesByDeal.get(sales.businessDealId) || []), sales]);
  });
  const groups = Array.from(salesByDeal.entries()).flatMap(([dealId, sales]): RecentContractGroup[] => {
    const purchaseIds = new Set(sales.flatMap((contract) => contract.associatedPurchaseIds || []));
    const purchases = Array.from(purchaseIds).map((id) => purchaseById.get(id))
      .filter((contract): contract is OverviewContract => Boolean(contract) && contract?.status !== 'cancelled');
    if (!purchases.length) return [];
    const salesInvoiceProgress = weightedProgress(sales, 'invoiceProgress');
    const salesSettlementProgress = weightedProgress(sales, 'settlementProgress');
    const purchaseInvoiceProgress = weightedProgress(purchases, 'invoiceProgress');
    const purchaseSettlementProgress = weightedProgress(purchases, 'settlementProgress');
    return [{
      id: dealId,
      date: sales[0].businessDealDate || sales[0].signDate || sales[0].created,
      sales,
      purchases,
      salesInvoiceProgress,
      salesSettlementProgress,
      purchaseInvoiceProgress,
      purchaseSettlementProgress,
      completionScore: Math.min(salesInvoiceProgress, salesSettlementProgress, purchaseInvoiceProgress, purchaseSettlementProgress),
    }];
  });

  const months = monthDescriptors.map((descriptor) => {
    const monthGroups = groups
      .filter((group) => businessMonthKey(group.date) === descriptor.key)
      .sort((left, right) => left.completionScore - right.completionScore
        || String(right.date).localeCompare(String(left.date)));
    return {
      ...descriptor,
      groups: monthGroups,
      incompleteCount: monthGroups.filter((group) => group.completionScore < 99.995).length,
    };
  });

  const currentMonth = monthDescriptors[0];
  const currentSales = activeSales.filter(
    (contract) => businessMonthKey(contract.signDate) === currentMonth.key,
  );
  const completedCount = currentSales.filter(
    (contract) => clampPercent(contract.settlementProgress) >= 99.995,
  ).length;

  return {
    months,
    collection: {
      monthLabel: currentMonth.label,
      contractCount: currentSales.length,
      completedCount,
      percent: currentSales.length ? Math.round((completedCount / currentSales.length) * 100) : 0,
    },
  };
};
