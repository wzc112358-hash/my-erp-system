import dayjs from 'dayjs';

import type { OverviewContract } from '@/types/comparison';

export interface RelationRow {
  id: string;
  sales?: OverviewContract;
  purchases: OverviewContract[];
}

export type OverviewDateRange = [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
export type OverviewSortField = 'date' | 'no' | 'progress';
export type OverviewRelationFilter = 'all' | 'unlinked' | 'linked';

interface BuildRelationRowsInput {
  salesContracts: OverviewContract[];
  purchaseContracts: OverviewContract[];
  searchText: string;
  customerFilter?: string;
  supplierFilter?: string;
  dateRange: OverviewDateRange;
  relationFilter: OverviewRelationFilter;
  sortField: OverviewSortField;
  sortDescending: boolean;
}

const contractDate = (contract: OverviewContract) => contract.signDate || contract.created;

const matchesSearch = (contract: OverviewContract, rawSearch: string) => {
  const search = rawSearch.trim().toLocaleLowerCase();
  if (!search) return true;
  const counterpart = contract.type === 'sales' ? contract.customerName : contract.supplierName;
  return [contract.no, contract.productName, counterpart]
    .some((value) => (value || '').toLocaleLowerCase().includes(search));
};

const matchesDate = (contract: OverviewContract, range: OverviewDateRange) => {
  if (!range?.[0] || !range?.[1]) return true;
  const value = contractDate(contract);
  if (!value) return false;
  const date = dayjs(value);
  return !date.isBefore(range[0], 'day') && !date.isAfter(range[1], 'day');
};

export const buildRelationRows = ({
  salesContracts,
  purchaseContracts,
  searchText,
  customerFilter,
  supplierFilter,
  dateRange,
  relationFilter,
  sortField,
  sortDescending,
}: BuildRelationRowsInput): RelationRow[] => {
  const rows: RelationRow[] = [];
  const purchaseById = new Map(purchaseContracts.map((contract) => [contract.id, contract]));
  const linkedPurchaseIds = new Set<string>();

  salesContracts.forEach((sales) => {
    const allPurchases = (sales.associatedPurchaseIds || [])
      .map((id) => purchaseById.get(id))
      .filter((contract): contract is OverviewContract => Boolean(contract));
    allPurchases.forEach((contract) => linkedPurchaseIds.add(contract.id));

    if (customerFilter && sales.customerName !== customerFilter) return;
    if (!matchesDate(sales, dateRange) && !allPurchases.some((contract) => matchesDate(contract, dateRange))) return;

    const salesMatches = matchesSearch(sales, searchText);
    let purchases = allPurchases;
    if (supplierFilter) {
      purchases = purchases.filter((contract) => contract.supplierName === supplierFilter);
      if (purchases.length === 0) return;
    }
    if (searchText && !salesMatches) {
      purchases = purchases.filter((contract) => matchesSearch(contract, searchText));
      if (purchases.length === 0) return;
    }
    if (dateRange?.[0] && dateRange?.[1] && !matchesDate(sales, dateRange)) {
      purchases = purchases.filter((contract) => matchesDate(contract, dateRange));
      if (purchases.length === 0) return;
    }
    rows.push({ id: `sales-${sales.id}`, sales, purchases });
  });

  if (!customerFilter) {
    purchaseContracts.forEach((purchase) => {
      if (linkedPurchaseIds.has(purchase.id)) return;
      if (supplierFilter && purchase.supplierName !== supplierFilter) return;
      if (!matchesSearch(purchase, searchText) || !matchesDate(purchase, dateRange)) return;
      rows.push({ id: `purchase-${purchase.id}`, purchases: [purchase] });
    });
  }

  const filteredRows = rows.filter((row) => {
    const isLinked = Boolean(row.sales && row.purchases.length > 0);
    if (relationFilter === 'linked') return isLinked;
    if (relationFilter === 'unlinked') return !isLinked;
    return true;
  });

  return filteredRows.sort((left, right) => {
    const leftContract = left.sales || left.purchases[0];
    const rightContract = right.sales || right.purchases[0];
    if (!leftContract || !rightContract) return 0;
    let comparison = 0;
    if (sortField === 'no') {
      comparison = leftContract.no.localeCompare(rightContract.no, 'zh-CN');
    } else if (sortField === 'progress') {
      comparison = (leftContract.executionProgress || 0) - (rightContract.executionProgress || 0);
    } else {
      comparison = dayjs(contractDate(leftContract) || 0).valueOf() - dayjs(contractDate(rightContract) || 0).valueOf();
    }
    return sortDescending ? -comparison : comparison;
  });
};

export const buildVisibleContractIds = (rows: RelationRow[]) => {
  const sales = new Set<string>();
  const purchases = new Set<string>();
  rows.forEach((row) => {
    if (row.sales) sales.add(row.sales.id);
    row.purchases.forEach((contract) => purchases.add(contract.id));
  });
  return { sales, purchases };
};
