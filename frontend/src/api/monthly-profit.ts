import { pb } from '@/lib/pocketbase';
import { calculateContractProfit } from '@/lib/contract-profit';
import { businessYearUtcRange } from '@/lib/business-month';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { summarizeMonthlyProfits } from '@/lib/monthly-profit';
import type {
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

const amountInCny = (amount: number, isCrossBorder: boolean, rate: number) => (
  (Number(amount) || 0) * (isCrossBorder ? rate : 1)
);

const arrivalCostsInCny = (arrivals: PurchaseArrivalRecord[], rate: number) => arrivals.reduce(
  (totals, arrival) => {
    const freight1Rate = arrival.freight_1_currency === 'USD' ? rate : 1;
    const freight2Rate = arrival.freight_2_currency === 'USD' ? rate : 1;
    const miscellaneousRate = arrival.miscellaneous_expenses_currency === 'USD' ? rate : 1;
    totals.freight += (arrival.freight_1 || 0) * freight1Rate
      + (arrival.freight_2 || 0) * freight2Rate;
    totals.miscellaneous += (arrival.miscellaneous_expenses || 0) * miscellaneousRate;
    totals.tariff += arrival.tariff || 0;
    totals.valueAddedTax += arrival.value_added_tax || 0;
    return totals;
  },
  { freight: 0, miscellaneous: 0, tariff: 0, valueAddedTax: 0 },
);

export const MonthlyProfitAPI = {
  getYearOverview: async (year: number): Promise<MonthlyProfitOverview> => {
    const exchangeRate = await getUsdToCnyRate();
    const yearRange = businessYearUtcRange(year);
    const salesContracts = await pb.collection('sales_contracts').getFullList<ComparisonSalesContract>({
      filter: `sign_date >= "${yearRange.start}" && sign_date < "${yearRange.end}" && status != "cancelled"`,
      expand: 'customer',
      sort: 'sign_date',
    });
    const purchaseContracts = await listByRelationIds<ComparisonPurchaseContract>(
      'purchase_contracts',
      'sales_contract',
      salesContracts.map((contract) => contract.id),
    );
    const purchaseBySales = new Map<string, ComparisonPurchaseContract[]>();
    purchaseContracts.forEach((contract) => {
      const related = purchaseBySales.get(contract.sales_contract) || [];
      related.push(contract);
      purchaseBySales.set(contract.sales_contract, related);
    });

    const arrivals = await listByRelationIds<PurchaseArrivalRecord>(
      'purchase_arrivals',
      'purchase_contract',
      purchaseContracts.map((contract) => contract.id),
    );
    const arrivalsByPurchase = new Map<string, PurchaseArrivalRecord[]>();
    arrivals.forEach((arrival) => {
      const related = arrivalsByPurchase.get(arrival.purchase_contract) || [];
      related.push(arrival);
      arrivalsByPurchase.set(arrival.purchase_contract, related);
    });

    let unlinkedSalesCount = 0;
    const contractProfits = salesContracts.flatMap((salesContract): MonthlyProfitContract[] => {
      const linkedPurchases = purchaseBySales.get(salesContract.id) || [];
      if (!linkedPurchases.length) {
        unlinkedSalesCount += 1;
        return [];
      }
      const purchaseAmount = linkedPurchases.reduce(
        (sum, contract) => sum + amountInCny(contract.total_amount, contract.is_cross_border, exchangeRate),
        0,
      );
      const costs = arrivalCostsInCny(
        linkedPurchases.flatMap((contract) => arrivalsByPurchase.get(contract.id) || []),
        exchangeRate,
      );
      const profit = calculateContractProfit({
        salesAmount: amountInCny(salesContract.total_amount, salesContract.is_cross_border, exchangeRate),
        salesPriceExcludingTax: salesContract.is_price_excluding_tax,
        purchaseAmount,
        freight: costs.freight,
        miscellaneous: costs.miscellaneous,
        tariff: costs.tariff,
        valueAddedTax: costs.valueAddedTax,
      });

      return [{
        id: salesContract.id,
        no: salesContract.no,
        signDate: salesContract.sign_date,
        customerName: salesContract.expand?.customer?.name || salesContract.customer_name || '-',
        productName: salesContract.product_name,
        purchaseContractCount: linkedPurchases.length,
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
