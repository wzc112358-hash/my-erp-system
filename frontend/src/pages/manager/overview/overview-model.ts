import dayjs from 'dayjs';

import type { OverviewContract } from '@/types/comparison';

export interface RelationRow {
  id: string;
  dealId?: string;
  sales: OverviewContract[];
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
  const grouped = new Map<string, RelationRow>();
  const rows: RelationRow[] = [];

  const addContract = (contract: OverviewContract) => {
    if (!contract.businessDealId) {
      rows.push({
        id: `${contract.type}-${contract.id}`,
        sales: contract.type === 'sales' ? [contract] : [],
        purchases: contract.type === 'purchase' ? [contract] : [],
      });
      return;
    }
    const row = grouped.get(contract.businessDealId) || {
      id: `deal-${contract.businessDealId}`,
      dealId: contract.businessDealId,
      sales: [],
      purchases: [],
    };
    if (contract.type === 'sales') row.sales.push(contract);
    else row.purchases.push(contract);
    grouped.set(contract.businessDealId, row);
  };

  salesContracts.forEach(addContract);
  purchaseContracts.forEach(addContract);
  rows.push(...grouped.values());

  const filteredRows = rows.filter((row) => {
    const contracts = [...row.sales, ...row.purchases];
    const isLinked = Boolean(row.dealId && row.sales.length > 0 && row.purchases.length > 0);
    if (relationFilter === 'linked' && !isLinked) return false;
    if (relationFilter === 'unlinked' && isLinked) return false;
    if (customerFilter && !row.sales.some((contract) => contract.customerName === customerFilter)) return false;
    if (supplierFilter && !row.purchases.some((contract) => contract.supplierName === supplierFilter)) return false;
    if (searchText && !contracts.some((contract) => matchesSearch(contract, searchText))) return false;
    return contracts.some((contract) => matchesDate(contract, dateRange));
  });

  return filteredRows.sort((left, right) => {
    const leftContract = [...left.sales, ...left.purchases][0];
    const rightContract = [...right.sales, ...right.purchases][0];
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
    row.sales.forEach((contract) => sales.add(contract.id));
    row.purchases.forEach((contract) => purchases.add(contract.id));
  });
  return { sales, purchases };
};
