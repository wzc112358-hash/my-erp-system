import type { OverviewContract } from '../../../types/comparison.ts';

export interface DashboardContractReminders {
  outstandingSales: OverviewContract[];
  unverifiedPurchases: OverviewContract[];
  unverifiedInvoiceCount: number;
}

const contractDate = (contract: OverviewContract) => contract.signDate || contract.created || '';

const byAmountThenDate = (left: OverviewContract, right: OverviewContract) => (
  (Number(right.outstandingAmount) || 0) - (Number(left.outstandingAmount) || 0)
  || contractDate(right).localeCompare(contractDate(left))
  || left.no.localeCompare(right.no)
);

const byInvoiceCountThenDate = (left: OverviewContract, right: OverviewContract) => (
  (Number(right.unverifiedInvoiceCount) || 0) - (Number(left.unverifiedInvoiceCount) || 0)
  || contractDate(right).localeCompare(contractDate(left))
  || left.no.localeCompare(right.no)
);

export const buildDashboardContractReminders = (
  salesContracts: OverviewContract[],
  purchaseContracts: OverviewContract[],
): DashboardContractReminders => {
  const outstandingSales = salesContracts
    .filter((contract) => contract.status !== 'cancelled' && (Number(contract.outstandingAmount) || 0) > 0.005)
    .sort(byAmountThenDate);
  const unverifiedPurchases = purchaseContracts
    .filter((contract) => contract.status !== 'cancelled' && (Number(contract.unverifiedInvoiceCount) || 0) > 0)
    .sort(byInvoiceCountThenDate);

  return {
    outstandingSales,
    unverifiedPurchases,
    unverifiedInvoiceCount: unverifiedPurchases.reduce(
      (total, contract) => total + (Number(contract.unverifiedInvoiceCount) || 0),
      0,
    ),
  };
};
