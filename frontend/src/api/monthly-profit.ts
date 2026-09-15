import { pb } from '@/lib/pocketbase';
import { calculateBusinessDealFinancials } from '@/lib/business-deal-financials';
import { businessYearUtcRange } from '@/lib/business-month';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { summarizeMonthlyProfits } from '@/lib/monthly-profit';
import type {
  BusinessDeal,
  ComparisonPurchaseContract,
  ComparisonSalesContract,
  PurchaseArrivalRecord,
} from '@/types/comparison';
import type {
  MonthlyProfitContract,
  MonthlyProfitOverview,
} from '@/types/monthly-profit';

const FILTER_CHUNK_SIZE = 40;

const listByRelationIds = async <T>(
  collectionName: string,
  relationField: string,
  ids: string[],
): Promise<T[]> => {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += FILTER_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + FILTER_CHUNK_SIZE));
  }
  const records = await Promise.all(chunks.map((chunk) => (
    pb.collection(collectionName).getFullList<T>({
      filter: chunk.map((id) => `${relationField}="${id}"`).join(' || '),
    })
  )));
  return records.flat();
};

const uniqueText = (values: (string | undefined)[]) => Array.from(
  new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
).join('、');

export const MonthlyProfitAPI = {
  getYearOverview: async (year: number): Promise<MonthlyProfitOverview> => {
    const exchangeRate = await getUsdToCnyRate();
    const yearRange = businessYearUtcRange(year);
    const [allSalesContracts, allPurchaseContracts, allDeals] = await Promise.all([
      pb.collection('sales_contracts').getFullList<ComparisonSalesContract>({
        filter: 'status != "cancelled"',
        expand: 'customer',
        sort: 'sign_date',
      }),
      pb.collection('purchase_contracts').getFullList<ComparisonPurchaseContract>({
        filter: 'status != "cancelled"',
      }),
      pb.collection('business_deals').getFullList<BusinessDeal>({ sort: 'deal_date' }),
    ]);
    const deals = allDeals.filter((deal) => deal.deal_date >= yearRange.start && deal.deal_date < yearRange.end);
    const salesById = new Map(allSalesContracts.map((contract) => [contract.id, contract]));
    const purchaseById = new Map(allPurchaseContracts.map((contract) => [contract.id, contract]));
    const purchaseIds = Array.from(new Set(deals.flatMap((deal) => deal.purchase_contracts || [])));
    const arrivals = await listByRelationIds<PurchaseArrivalRecord>(
      'purchase_arrivals',
      'purchase_contract',
      purchaseIds,
    );
    const arrivalsByPurchase = new Map<string, PurchaseArrivalRecord[]>();
    arrivals.forEach((arrival) => {
      const related = arrivalsByPurchase.get(arrival.purchase_contract) || [];
      related.push(arrival);
      arrivalsByPurchase.set(arrival.purchase_contract, related);
    });

    const linkedSalesIds = new Set(allDeals.flatMap((deal) => deal.sales_contracts || []));
    const unlinkedSalesCount = allSalesContracts.filter((contract) => (
      contract.sign_date >= yearRange.start
      && contract.sign_date < yearRange.end
      && !linkedSalesIds.has(contract.id)
    )).length;

    const contractProfits = deals.flatMap((deal): MonthlyProfitContract[] => {
      const salesContracts = (deal.sales_contracts || [])
        .map((id) => salesById.get(id))
        .filter((contract): contract is ComparisonSalesContract => Boolean(contract));
      const purchaseContracts = (deal.purchase_contracts || [])
        .map((id) => purchaseById.get(id))
        .filter((contract): contract is ComparisonPurchaseContract => Boolean(contract));
      if (!salesContracts.length || !purchaseContracts.length) return [];

      const financials = calculateBusinessDealFinancials({
        salesContracts,
        purchaseContracts,
        purchaseArrivals: purchaseContracts.flatMap((contract) => arrivalsByPurchase.get(contract.id) || []),
        exchangeRate,
        taxRate: deal.tax_rate,
      });
      const { profit, costs } = financials;

      return [{
        id: deal.id,
        primarySalesId: salesContracts[0].id,
        no: salesContracts.map((contract) => contract.no).join('、'),
        signDate: deal.deal_date,
        customerName: uniqueText(salesContracts.map((contract) => contract.expand?.customer?.name || contract.customer_name)) || '-',
        productName: uniqueText([...salesContracts, ...purchaseContracts].map((contract) => contract.product_name)) || '-',
        salesContractCount: salesContracts.length,
        purchaseContractCount: purchaseContracts.length,
        taxRate: deal.tax_rate,
        salesAmountIncTax: profit.salesAmountIncTax,
        purchaseAmountIncTax: profit.purchaseAmountIncTax,
        freight: costs.freight,
        miscellaneous: costs.miscellaneous,
        tariff: costs.tariff,
        valueAddedTax: costs.valueAddedTax,
        operatingProfit: profit.operatingProfit,
        taxAmount: profit.taxAmount,
        netProfit: profit.netProfit,
      }];
    });

    const months = summarizeMonthlyProfits(year, contractProfits);
    const totals = months.reduce((summary, month) => ({
      contractCount: summary.contractCount + month.contractCount,
      salesAmountIncTax: summary.salesAmountIncTax + month.salesAmountIncTax,
      purchaseAmountIncTax: summary.purchaseAmountIncTax + month.purchaseAmountIncTax,
      expenses: summary.expenses + month.expenses,
      operatingProfit: summary.operatingProfit + month.operatingProfit,
      taxAmount: summary.taxAmount + month.taxAmount,
      netProfit: summary.netProfit + month.netProfit,
    }), {
      contractCount: 0,
      salesAmountIncTax: 0,
      purchaseAmountIncTax: 0,
      expenses: 0,
      operatingProfit: 0,
      taxAmount: 0,
      netProfit: 0,
    });

    return { year, exchangeRate, unlinkedSalesCount, months, totals };
  },
};
