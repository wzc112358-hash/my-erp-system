import { fetchAllByFieldBatches } from '@/api/helpers';
import { businessMonthKey } from '@/lib/business-month';
import { calculateBusinessDealProfit } from '@/lib/contract-profit';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { pb } from '@/lib/pocketbase';
import type { BusinessDeal } from '@/types/comparison';
import type { ReportData, ReportParams, ReportResult, ReportSummary } from '@/types/report';

interface SalesContractData {
  id: string;
  no: string;
  product_name: string;
  total_quantity: number;
  unit_price: number;
  total_amount: number;
  is_price_excluding_tax: boolean;
  is_cross_border: boolean;
  invoiced_amount: number;
  receipted_amount: number;
  sign_date: string;
  expand?: { customer?: { name: string } };
}

interface PurchaseContractData {
  id: string;
  no: string;
  product_name: string;
  total_quantity: number;
  unit_price: number;
  total_amount: number;
  is_cross_border: boolean;
  invoiced_amount: number;
  paid_amount: number;
  sign_date: string;
  expand?: { supplier?: { name: string } };
}

interface PurchaseArrivalData {
  purchase_contract: string;
  quantity: number;
  freight_1: number;
  freight_1_currency: 'USD' | 'CNY';
  freight_2?: number;
  freight_2_currency?: 'USD' | 'CNY';
  miscellaneous_expenses: number;
  miscellaneous_expenses_currency: 'USD' | 'CNY';
  tariff?: number;
  value_added_tax?: number;
}

interface SalesShipmentData { sales_contract: string; date: string; quantity: number }
interface PurchasePaymentData { purchase_contract: string; pay_date: string }
interface PurchaseInvoiceData { purchase_contract: string; receive_date: string }
interface SaleReceiptData { sales_contract: string; receive_date: string }
interface SaleInvoiceData { sales_contract: string; issue_date: string }

interface ReportActivityData {
  arrivalsByPurchase: Map<string, PurchaseArrivalData[]>;
  shipmentsBySales: Map<string, SalesShipmentData[]>;
  purchasePaymentDates: Map<string, string>;
  purchaseInvoiceDates: Map<string, string>;
  salesReceiptDates: Map<string, string>;
  salesInvoiceDates: Map<string, string>;
}

const emptySummary = (): ReportSummary => ({
  totalSalesAmount: 0,
  totalPurchaseAmount: 0,
  totalSalesTaxAmount: 0,
  totalPurchaseTaxAmount: 0,
  totalTax: 0,
  totalFreight: 0,
  totalMiscellaneous: 0,
  totalTariff: 0,
  totalValueAddedTax: 0,
  totalProfit: 0,
  totalNetProfit: 0,
  totalRealizedProfit: 0,
});

const amountInCny = (amount: number, isCrossBorder: boolean, rate: number) => (
  (Number(amount) || 0) * (isCrossBorder ? rate : 1)
);

const progressPercent = (completed: number, total: number) => {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, ((Number(completed) || 0) / total) * 100));
};

const isInMonthRange = (date: string, params: ReportParams) => {
  const [contractYear, contractMonth] = businessMonthKey(date).split('-').map(Number);
  return contractYear === params.year && contractMonth >= params.startMonth && contractMonth <= params.endMonth;
};

const groupBy = <T>(rows: T[], keyOf: (row: T) => string) => {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => grouped.set(keyOf(row), [...(grouped.get(keyOf(row)) || []), row]));
  return grouped;
};

const latestDateMap = <T>(rows: T[], keyOf: (row: T) => string, dateOf: (row: T) => string) => {
  const dates = new Map<string, string>();
  rows.forEach((row) => {
    const key = keyOf(row);
    const date = dateOf(row);
    if (key && date && (!dates.get(key) || date > dates.get(key)!)) dates.set(key, date);
  });
  return dates;
};

const loadActivityData = async (
  salesContracts: SalesContractData[],
  purchaseContracts: PurchaseContractData[],
): Promise<ReportActivityData> => {
  const salesIds = salesContracts.map((contract) => contract.id);
  const purchaseIds = purchaseContracts.map((contract) => contract.id);
  const fetch = <T,>(collection: string, ids: string[], field: string) => (
    fetchAllByFieldBatches<T>(ids, field, (filter) => pb.collection(collection).getFullList<T>({ filter }))
  );
  const [arrivals, shipments, payments, purchaseInvoices, receipts, salesInvoices] = await Promise.all([
    fetch<PurchaseArrivalData>('purchase_arrivals', purchaseIds, 'purchase_contract'),
    fetch<SalesShipmentData>('sales_shipments', salesIds, 'sales_contract'),
    fetch<PurchasePaymentData>('purchase_payments', purchaseIds, 'purchase_contract'),
    fetch<PurchaseInvoiceData>('purchase_invoices', purchaseIds, 'purchase_contract'),
    fetch<SaleReceiptData>('sale_receipts', salesIds, 'sales_contract'),
    fetch<SaleInvoiceData>('sale_invoices', salesIds, 'sales_contract'),
  ]);
  return {
    arrivalsByPurchase: groupBy(arrivals, (row) => row.purchase_contract),
    shipmentsBySales: groupBy(shipments, (row) => row.sales_contract),
    purchasePaymentDates: latestDateMap(payments, (row) => row.purchase_contract, (row) => row.pay_date),
    purchaseInvoiceDates: latestDateMap(purchaseInvoices, (row) => row.purchase_contract, (row) => row.receive_date),
    salesReceiptDates: latestDateMap(receipts, (row) => row.sales_contract, (row) => row.receive_date),
    salesInvoiceDates: latestDateMap(salesInvoices, (row) => row.sales_contract, (row) => row.issue_date),
  };
};

const arrivalTotals = (arrivals: PurchaseArrivalData[], rate: number) => arrivals.reduce((totals, arrival) => {
  totals.quantity += Number(arrival.quantity) || 0;
  totals.freight += (Number(arrival.freight_1) || 0) * (arrival.freight_1_currency === 'USD' ? rate : 1)
    + (Number(arrival.freight_2) || 0) * (arrival.freight_2_currency === 'USD' ? rate : 1);
  totals.miscellaneous += (Number(arrival.miscellaneous_expenses) || 0)
    * (arrival.miscellaneous_expenses_currency === 'USD' ? rate : 1);
  totals.tariff += Number(arrival.tariff) || 0;
  totals.valueAddedTax += Number(arrival.value_added_tax) || 0;
  return totals;
}, { quantity: 0, freight: 0, miscellaneous: 0, tariff: 0, valueAddedTax: 0 });

const emptyPurchaseFields = {
  purchaseContractId: '', purchaseContractNo: '', purchaseSignDate: '', purchaseProductName: '', supplierName: '',
  purchaseQuantity: 0, purchaseUnitPrice: 0, purchaseTotalAmount: 0, purchaseTaxTotalAmount: 0,
  purchasePaymentDate: '', purchaseInvoiceDate: '', purchasePaymentProgress: 0, purchaseInvoiceProgress: 0,
  freight: 0, miscellaneous: 0, tariff: 0, valueAddedTax: 0,
};

const emptySalesFields = {
  salesContractId: '', salesContractNo: '', salesSignDate: '', salesProductName: '', customerName: '',
  salesQuantity: 0, salesUnitPrice: 0, salesTotalAmount: 0, salesTaxTotalAmount: 0,
  salesReceiptProgress: 0, salesInvoiceProgress: 0, arrivalDate: '', salesReceiptDate: '', salesInvoiceDate: '',
};

const salesFields = (sales: SalesContractData, activity: ReportActivityData, rate: number) => {
  const amount = amountInCny(sales.total_amount, sales.is_cross_border, rate);
  return {
    salesContractId: sales.id,
    salesContractNo: sales.no,
    salesSignDate: sales.sign_date,
    salesProductName: sales.product_name,
    customerName: sales.expand?.customer?.name || '',
    salesQuantity: Number(sales.total_quantity) || 0,
    salesUnitPrice: amountInCny(sales.unit_price, sales.is_cross_border, rate),
    salesTotalAmount: sales.is_price_excluding_tax ? amount : amount / 1.13,
    salesTaxTotalAmount: sales.is_price_excluding_tax ? amount * 1.13 : amount,
    salesReceiptProgress: progressPercent(sales.receipted_amount, sales.total_amount),
    salesInvoiceProgress: progressPercent(sales.invoiced_amount, sales.total_amount),
    arrivalDate: latestDateMap(activity.shipmentsBySales.get(sales.id) || [], () => sales.id, (row) => row.date).get(sales.id) || '',
    salesReceiptDate: activity.salesReceiptDates.get(sales.id) || '',
    salesInvoiceDate: activity.salesInvoiceDates.get(sales.id) || '',
  };
};

const purchaseFields = (purchase: PurchaseContractData, activity: ReportActivityData, rate: number) => {
  const costs = arrivalTotals(activity.arrivalsByPurchase.get(purchase.id) || [], rate);
  const amount = amountInCny(purchase.total_amount, purchase.is_cross_border, rate);
  return {
    costs,
    fields: {
      purchaseContractId: purchase.id,
      purchaseContractNo: purchase.no,
      purchaseSignDate: purchase.sign_date,
      purchaseProductName: purchase.product_name,
      supplierName: purchase.expand?.supplier?.name || '',
      purchaseQuantity: Number(purchase.total_quantity) || 0,
      purchaseUnitPrice: amountInCny(purchase.unit_price, purchase.is_cross_border, rate),
      purchaseTotalAmount: amount / 1.13,
      purchaseTaxTotalAmount: amount,
      purchasePaymentDate: activity.purchasePaymentDates.get(purchase.id) || '',
      purchaseInvoiceDate: activity.purchaseInvoiceDates.get(purchase.id) || '',
      purchasePaymentProgress: progressPercent(purchase.paid_amount, purchase.total_amount),
      purchaseInvoiceProgress: progressPercent(purchase.invoiced_amount, purchase.total_amount),
      freight: costs.freight,
      miscellaneous: costs.miscellaneous,
      tariff: costs.tariff,
      valueAddedTax: costs.valueAddedTax,
    },
  };
};

const buildReport = async (
  salesContracts: SalesContractData[],
  purchaseContracts: PurchaseContractData[],
  deals: BusinessDeal[],
  standaloneSales: SalesContractData[],
  standalonePurchases: PurchaseContractData[],
  rate: number,
): Promise<ReportResult> => {
  const activity = await loadActivityData(salesContracts, purchaseContracts);
  const salesById = new Map(salesContracts.map((contract) => [contract.id, contract]));
  const purchaseById = new Map(purchaseContracts.map((contract) => [contract.id, contract]));
  const data: ReportData[] = [];

  deals.forEach((deal) => {
    const sales = (deal.sales_contracts || []).map((id) => salesById.get(id)).filter((row): row is SalesContractData => Boolean(row));
    const purchases = (deal.purchase_contracts || []).map((id) => purchaseById.get(id)).filter((row): row is PurchaseContractData => Boolean(row));
    if (!sales.length || !purchases.length) return;
    const salesDetails = sales.map((contract) => ({ contract, fields: salesFields(contract, activity, rate) }));
    const purchaseDetails = purchases.map((contract) => ({ contract, ...purchaseFields(contract, activity, rate) }));
    const salesAmounts = salesDetails.reduce((sum, row) => ({
      incTax: sum.incTax + row.fields.salesTaxTotalAmount,
      exTax: sum.exTax + row.fields.salesTotalAmount,
    }), { incTax: 0, exTax: 0 });
    const purchaseAmount = purchaseDetails.reduce((sum, row) => sum + row.fields.purchaseTaxTotalAmount, 0);
    const costs = purchaseDetails.reduce((sum, row) => ({
      freight: sum.freight + row.costs.freight,
      miscellaneous: sum.miscellaneous + row.costs.miscellaneous,
      tariff: sum.tariff + row.costs.tariff,
      valueAddedTax: sum.valueAddedTax + row.costs.valueAddedTax,
    }), { freight: 0, miscellaneous: 0, tariff: 0, valueAddedTax: 0 });
    const profit = calculateBusinessDealProfit({
      salesAmountIncTax: salesAmounts.incTax,
      salesAmountExTax: salesAmounts.exTax,
      purchaseAmountIncTax: purchaseAmount,
      ...costs,
      taxRate: deal.tax_rate,
    });
    const realizedSales = salesDetails.reduce((sum, row) => {
      const shipped = (activity.shipmentsBySales.get(row.contract.id) || []).reduce((total, shipment) => total + (Number(shipment.quantity) || 0), 0);
      const amount = row.fields.salesUnitPrice * shipped;
      sum.incTax += row.contract.is_price_excluding_tax ? amount * 1.13 : amount;
      sum.exTax += row.contract.is_price_excluding_tax ? amount : amount / 1.13;
      return sum;
    }, { incTax: 0, exTax: 0 });
    const realizedPurchase = purchaseDetails.reduce((sum, row) => {
      const ratio = row.contract.total_quantity > 0 ? row.costs.quantity / row.contract.total_quantity : 0;
      return sum + row.fields.purchaseTaxTotalAmount * ratio;
    }, 0);
    const realized = calculateBusinessDealProfit({
      salesAmountIncTax: realizedSales.incTax,
      salesAmountExTax: realizedSales.exTax,
      purchaseAmountIncTax: realizedPurchase,
      ...costs,
      taxRate: deal.tax_rate,
    });
    const rowCount = Math.max(salesDetails.length, purchaseDetails.length);
    for (let index = 0; index < rowCount; index += 1) {
      const salesRow = salesDetails[index];
      const purchaseRow = purchaseDetails[index];
      data.push({
        businessDealId: deal.id,
        businessDealName: deal.name,
        businessDealDate: deal.deal_date,
        taxRate: deal.tax_rate,
        ...(purchaseRow?.fields || emptyPurchaseFields),
        ...(salesRow?.fields || emptySalesFields),
        productName: purchaseRow?.contract.product_name || salesRow?.contract.product_name || '',
        purchaseAllocationRatio: purchaseRow ? 1 : 0,
        allocatedPurchaseTaxAmount: purchaseRow?.fields.purchaseTaxTotalAmount || 0,
        tax: index === 0 ? profit.taxAmount : 0,
        profit: index === 0 ? profit.operatingProfit : 0,
        netProfit: index === 0 ? profit.netProfit : 0,
        realizedProfit: index === 0 ? realized.netProfit : 0,
        salesRowSpan: 1,
        purchaseRowSpan: 1,
        isSalesRow: Boolean(salesRow),
      });
    }
  });

  standaloneSales.forEach((sales) => data.push({
    businessDealId: '', businessDealName: '独立销售合同', businessDealDate: sales.sign_date, taxRate: 0,
    ...emptyPurchaseFields, ...salesFields(sales, activity, rate), productName: sales.product_name,
    purchaseAllocationRatio: 0, allocatedPurchaseTaxAmount: 0, tax: 0, profit: 0, netProfit: 0, realizedProfit: 0,
    salesRowSpan: 1, purchaseRowSpan: 1, isSalesRow: true,
  }));
  standalonePurchases.forEach((purchase) => {
    const row = purchaseFields(purchase, activity, rate);
    data.push({
      businessDealId: '', businessDealName: '独立采购合同', businessDealDate: purchase.sign_date, taxRate: 0,
      ...row.fields, ...emptySalesFields, productName: purchase.product_name,
      purchaseAllocationRatio: 0, allocatedPurchaseTaxAmount: 0, tax: 0, profit: 0, netProfit: 0, realizedProfit: 0,
      salesRowSpan: 1, purchaseRowSpan: 1, isSalesRow: false,
    });
  });

  return { data, summary: summarizeReport(data), exchangeRate: rate };
};

const summarizeReport = (rows: ReportData[]): ReportSummary => {
  const summary = emptySummary();
  const sales = new Set<string>();
  const purchases = new Set<string>();
  rows.forEach((row) => {
    if (row.salesContractId && !sales.has(row.salesContractId)) {
      summary.totalSalesAmount += row.salesTotalAmount;
      summary.totalSalesTaxAmount += row.salesTaxTotalAmount;
      sales.add(row.salesContractId);
    }
    if (row.purchaseContractId && !purchases.has(row.purchaseContractId)) {
      summary.totalPurchaseAmount += row.purchaseTotalAmount;
      summary.totalPurchaseTaxAmount += row.purchaseTaxTotalAmount;
      summary.totalFreight += row.freight;
      summary.totalMiscellaneous += row.miscellaneous;
      summary.totalTariff += row.tariff;
      summary.totalValueAddedTax += row.valueAddedTax;
      purchases.add(row.purchaseContractId);
    }
    summary.totalTax += row.tax;
    summary.totalProfit += row.profit;
    summary.totalNetProfit += row.netProfit;
    summary.totalRealizedProfit += row.realizedProfit;
  });
  return summary;
};

const loadReportBase = () => Promise.all([
  pb.collection('sales_contracts').getFullList<SalesContractData>({ filter: 'status != "cancelled"', expand: 'customer', sort: 'sign_date,no' }),
  pb.collection('purchase_contracts').getFullList<PurchaseContractData>({ filter: 'status != "cancelled"', expand: 'supplier', sort: 'sign_date,no' }),
  pb.collection('business_deals').getFullList<BusinessDeal>({ sort: 'deal_date' }),
]);

export const ReportAPI = {
  getReportData: async (params: ReportParams): Promise<ReportResult> => {
    const [rate, [sales, purchases, allDeals]] = await Promise.all([getUsdToCnyRate(), loadReportBase()]);
    const deals = allDeals.filter((deal) => isInMonthRange(deal.deal_date, params));
    const linkedSales = new Set(allDeals.flatMap((deal) => deal.sales_contracts || []));
    const linkedPurchases = new Set(allDeals.flatMap((deal) => deal.purchase_contracts || []));
    const dealSalesIds = new Set(deals.flatMap((deal) => deal.sales_contracts || []));
    const dealPurchaseIds = new Set(deals.flatMap((deal) => deal.purchase_contracts || []));
    const standaloneSales = sales.filter((contract) => !linkedSales.has(contract.id) && isInMonthRange(contract.sign_date, params));
    const standalonePurchases = purchases.filter((contract) => !linkedPurchases.has(contract.id) && isInMonthRange(contract.sign_date, params));
    return buildReport(
      sales.filter((contract) => dealSalesIds.has(contract.id) || standaloneSales.includes(contract)),
      purchases.filter((contract) => dealPurchaseIds.has(contract.id) || standalonePurchases.includes(contract)),
      deals,
      standaloneSales,
      standalonePurchases,
      rate,
    );
  },

  getReportByContractIds: async (salesIds: string[], purchaseIds: string[]): Promise<ReportResult> => {
    const rate = await getUsdToCnyRate();
    if (!salesIds.length && !purchaseIds.length) return { data: [], summary: emptySummary(), exchangeRate: rate };
    const [sales, purchases, allDeals] = await loadReportBase();
    const selectedSales = new Set(salesIds);
    const selectedPurchases = new Set(purchaseIds);
    const deals = allDeals.filter((deal) => (
      deal.sales_contracts?.some((id) => selectedSales.has(id))
      || deal.purchase_contracts?.some((id) => selectedPurchases.has(id))
    ));
    const dealSalesIds = new Set(deals.flatMap((deal) => deal.sales_contracts || []));
    const dealPurchaseIds = new Set(deals.flatMap((deal) => deal.purchase_contracts || []));
    const standaloneSales = sales.filter((contract) => selectedSales.has(contract.id) && !dealSalesIds.has(contract.id));
    const standalonePurchases = purchases.filter((contract) => selectedPurchases.has(contract.id) && !dealPurchaseIds.has(contract.id));
    return buildReport(
      sales.filter((contract) => dealSalesIds.has(contract.id) || standaloneSales.includes(contract)),
      purchases.filter((contract) => dealPurchaseIds.has(contract.id) || standalonePurchases.includes(contract)),
      deals,
      standaloneSales,
      standalonePurchases,
      rate,
    );
  },
};
