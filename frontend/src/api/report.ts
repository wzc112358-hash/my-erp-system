import { fetchAllByFieldBatches } from '@/api/helpers';
import { businessMonthKey } from '@/lib/business-month';
import { buildContractRelationIndex, getPurchaseAllocationRatio } from '@/lib/contract-relations';
import { calculateContractProfit } from '@/lib/contract-profit';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { pb } from '@/lib/pocketbase';
import type { ReportData, ReportParams, ReportResult, ReportSummary } from '@/types/report';

interface SalesContractData {
  id: string;
  purchase_contract?: string;
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
  expand?: {
    customer?: { name: string };
  };
}

interface PurchaseContractData {
  id: string;
  no: string;
  product_name: string;
  sales_contract: string;
  total_quantity: number;
  unit_price: number;
  total_amount: number;
  is_cross_border: boolean;
  invoiced_amount: number;
  paid_amount: number;
  sign_date: string;
  expand?: {
    supplier?: { name: string };
  };
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

interface SalesShipmentData {
  sales_contract: string;
  date: string;
  quantity: number;
}

interface PurchasePaymentData {
  purchase_contract: string;
  pay_date: string;
}

interface PurchaseInvoiceData {
  purchase_contract: string;
  receive_date: string;
}

interface SaleReceiptData {
  sales_contract: string;
  receive_date: string;
}

interface SaleInvoiceData {
  sales_contract: string;
  issue_date: string;
}

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
  return contractYear === params.year
    && contractMonth >= params.startMonth
    && contractMonth <= params.endMonth;
};

async function fetchByFieldBatches<T>(
  collection: string,
  ids: string[],
  field: string,
): Promise<T[]> {
  return fetchAllByFieldBatches(ids, field, (filter) => (
    pb.collection(collection).getFullList<T>({ filter })
  ));
}

const groupBy = <T>(rows: T[], keyOf: (row: T) => string) => {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyOf(row);
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  });
  return grouped;
};

const latestDateMap = <T>(
  rows: T[],
  keyOf: (row: T) => string,
  dateOf: (row: T) => string,
) => {
  const dates = new Map<string, string>();
  rows.forEach((row) => {
    const key = keyOf(row);
    const date = dateOf(row);
    const current = dates.get(key);
    if (key && date && (!current || date > current)) dates.set(key, date);
  });
  return dates;
};

const arrivalTotals = (arrivals: PurchaseArrivalData[], rate: number) => arrivals.reduce(
  (totals, arrival) => {
    const freight1Rate = arrival.freight_1_currency === 'USD' ? rate : 1;
    const freight2Rate = arrival.freight_2_currency === 'USD' ? rate : 1;
    const miscellaneousRate = arrival.miscellaneous_expenses_currency === 'USD' ? rate : 1;
    totals.quantity += Number(arrival.quantity) || 0;
    totals.freight += (Number(arrival.freight_1) || 0) * freight1Rate
      + (Number(arrival.freight_2) || 0) * freight2Rate;
    totals.miscellaneous += (Number(arrival.miscellaneous_expenses) || 0) * miscellaneousRate;
    totals.tariff += Number(arrival.tariff) || 0;
    totals.valueAddedTax += Number(arrival.value_added_tax) || 0;
    return totals;
  },
  { quantity: 0, freight: 0, miscellaneous: 0, tariff: 0, valueAddedTax: 0 },
);

const loadActivityData = async (
  salesContracts: SalesContractData[],
  purchaseContracts: PurchaseContractData[],
): Promise<ReportActivityData> => {
  const salesIds = salesContracts.map((contract) => contract.id);
  const purchaseIds = purchaseContracts.map((contract) => contract.id);
  const [arrivals, shipments, payments, purchaseInvoices, receipts, salesInvoices] = await Promise.all([
    fetchByFieldBatches<PurchaseArrivalData>('purchase_arrivals', purchaseIds, 'purchase_contract'),
    fetchByFieldBatches<SalesShipmentData>('sales_shipments', salesIds, 'sales_contract'),
    fetchByFieldBatches<PurchasePaymentData>('purchase_payments', purchaseIds, 'purchase_contract'),
    fetchByFieldBatches<PurchaseInvoiceData>('purchase_invoices', purchaseIds, 'purchase_contract'),
    fetchByFieldBatches<SaleReceiptData>('sale_receipts', salesIds, 'sales_contract'),
    fetchByFieldBatches<SaleInvoiceData>('sale_invoices', salesIds, 'sales_contract'),
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

const basePurchaseFields = (
  purchase: PurchaseContractData,
  activity: ReportActivityData,
  rate: number,
) => {
  const costs = arrivalTotals(activity.arrivalsByPurchase.get(purchase.id) || [], rate);
  const purchaseAmountIncTax = amountInCny(purchase.total_amount, purchase.is_cross_border, rate);
  return {
    costs,
    fields: {
      purchaseContractId: purchase.id,
      purchaseContractNo: purchase.no,
      purchaseSignDate: purchase.sign_date,
      purchaseProductName: purchase.product_name,
      productName: purchase.product_name,
      supplierName: purchase.expand?.supplier?.name || '',
      purchaseQuantity: Number(purchase.total_quantity) || 0,
      purchaseUnitPrice: amountInCny(purchase.unit_price, purchase.is_cross_border, rate),
      purchaseTotalAmount: purchaseAmountIncTax / 1.13,
      purchaseTaxTotalAmount: purchaseAmountIncTax,
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

const emptyPurchaseFields = {
  purchaseContractId: '',
  purchaseContractNo: '',
  purchaseSignDate: '',
  purchaseProductName: '',
  supplierName: '',
  purchaseQuantity: 0,
  purchaseUnitPrice: 0,
  purchaseTotalAmount: 0,
  purchaseTaxTotalAmount: 0,
  purchasePaymentDate: '',
  purchaseInvoiceDate: '',
  purchasePaymentProgress: 0,
  purchaseInvoiceProgress: 0,
};

const emptySalesFields = {
  salesContractId: '',
  salesContractNo: '',
  salesSignDate: '',
  salesProductName: '',
  customerName: '',
  salesQuantity: 0,
  salesUnitPrice: 0,
  salesTotalAmount: 0,
  salesTaxTotalAmount: 0,
  salesReceiptProgress: 0,
  salesInvoiceProgress: 0,
  arrivalDate: '',
  salesReceiptDate: '',
  salesInvoiceDate: '',
};

const buildReportRows = async (
  salesContracts: SalesContractData[],
  purchaseContracts: PurchaseContractData[],
  rate: number,
  relationSalesContracts: SalesContractData[],
  relationPurchaseContracts: PurchaseContractData[],
) => {
  const activity = await loadActivityData(salesContracts, purchaseContracts);
  const relationIndex = buildContractRelationIndex(relationSalesContracts, relationPurchaseContracts);
  const purchasesById = new Map(purchaseContracts.map((contract) => [contract.id, contract]));
  const reportData: ReportData[] = [];

  salesContracts.forEach((sales) => {
    const purchases = (relationIndex.purchaseIdsBySales.get(sales.id) || [])
      .map((purchaseId) => purchasesById.get(purchaseId))
      .filter((purchase): purchase is PurchaseContractData => Boolean(purchase));
    const salesAmount = amountInCny(sales.total_amount, sales.is_cross_border, rate);
    const salesUnitPrice = amountInCny(sales.unit_price, sales.is_cross_border, rate);
    const salesBase = calculateContractProfit({
      salesAmount,
      salesPriceExcludingTax: sales.is_price_excluding_tax,
      purchaseAmount: 0,
      freight: 0,
      miscellaneous: 0,
      tariff: 0,
      valueAddedTax: 0,
    });
    const shipmentDates = latestDateMap(
      activity.shipmentsBySales.get(sales.id) || [],
      () => sales.id,
      (row) => row.date,
    );
    const salesFields = {
      salesContractId: sales.id,
      salesContractNo: sales.no,
      salesSignDate: sales.sign_date,
      salesProductName: sales.product_name,
      customerName: sales.expand?.customer?.name || '',
      salesQuantity: Number(sales.total_quantity) || 0,
      salesUnitPrice,
      salesTotalAmount: salesBase.salesAmountExTax,
      salesTaxTotalAmount: salesBase.salesAmountIncTax,
      salesReceiptProgress: progressPercent(sales.receipted_amount, sales.total_amount),
      salesInvoiceProgress: progressPercent(sales.invoiced_amount, sales.total_amount),
      arrivalDate: shipmentDates.get(sales.id) || '',
      salesReceiptDate: activity.salesReceiptDates.get(sales.id) || '',
      salesInvoiceDate: activity.salesInvoiceDates.get(sales.id) || '',
    };

    if (purchases.length === 0) {
      reportData.push({
        ...emptyPurchaseFields,
        ...salesFields,
        productName: sales.product_name,
        freight: 0,
        miscellaneous: 0,
        tariff: 0,
        valueAddedTax: 0,
        purchaseAllocationRatio: 0,
        allocatedPurchaseTaxAmount: 0,
        tax: 0,
        profit: 0,
        netProfit: 0,
        realizedProfit: 0,
        salesRowSpan: 1,
        purchaseRowSpan: 1,
        isSalesRow: true,
      });
      return;
    }

    const purchaseDetails = purchases.map((purchase) => ({
      purchase,
      allocationRatio: getPurchaseAllocationRatio(
        relationIndex,
        relationSalesContracts,
        purchase.id,
        sales.id,
      ),
      ...basePurchaseFields(purchase, activity, rate),
    }));
    const purchaseAmount = purchaseDetails.reduce(
      (sum, detail) => sum + detail.fields.purchaseTaxTotalAmount * detail.allocationRatio,
      0,
    );
    const costs = purchaseDetails.reduce(
      (totals, detail) => ({
        freight: totals.freight + detail.costs.freight * detail.allocationRatio,
        miscellaneous: totals.miscellaneous + detail.costs.miscellaneous * detail.allocationRatio,
        tariff: totals.tariff + detail.costs.tariff * detail.allocationRatio,
        valueAddedTax: totals.valueAddedTax + detail.costs.valueAddedTax * detail.allocationRatio,
      }),
      { freight: 0, miscellaneous: 0, tariff: 0, valueAddedTax: 0 },
    );
    const profit = calculateContractProfit({
      salesAmount,
      salesPriceExcludingTax: sales.is_price_excluding_tax,
      purchaseAmount,
      ...costs,
    });

    const shippedQuantity = (activity.shipmentsBySales.get(sales.id) || []).reduce(
      (sum, shipment) => sum + (Number(shipment.quantity) || 0),
      0,
    );
    const realizedPurchaseAmount = purchaseDetails.reduce((sum, detail) => {
      const purchaseQuantity = Number(detail.purchase.total_quantity) || 0;
      const ratio = purchaseQuantity > 0 ? detail.costs.quantity / purchaseQuantity : 0;
      return sum + detail.fields.purchaseTaxTotalAmount * ratio * detail.allocationRatio;
    }, 0);
    const realizedProfit = calculateContractProfit({
      salesAmount: salesUnitPrice * shippedQuantity,
      salesPriceExcludingTax: sales.is_price_excluding_tax,
      purchaseAmount: realizedPurchaseAmount,
      ...costs,
    });

    purchaseDetails.forEach((detail, index) => {
      const isFirst = index === 0;
      reportData.push({
        ...detail.fields,
        ...salesFields,
        purchaseAllocationRatio: detail.allocationRatio,
        allocatedPurchaseTaxAmount: detail.fields.purchaseTaxTotalAmount * detail.allocationRatio,
        tax: isFirst ? profit.taxAmount : 0,
        profit: isFirst ? profit.operatingProfit : 0,
        netProfit: isFirst ? profit.netProfit : 0,
        realizedProfit: isFirst ? realizedProfit.netProfit : 0,
        salesRowSpan: isFirst ? purchaseDetails.length : 0,
        purchaseRowSpan: 1,
        isSalesRow: false,
      });
    });
  });

  purchaseContracts.filter((purchase) => (
    (relationIndex.salesIdsByPurchase.get(purchase.id) || []).length === 0
  )).forEach((purchase) => {
    const detail = basePurchaseFields(purchase, activity, rate);
    reportData.push({
      ...detail.fields,
      ...emptySalesFields,
      tax: 0,
      profit: 0,
      netProfit: 0,
      realizedProfit: 0,
      purchaseAllocationRatio: 0,
      allocatedPurchaseTaxAmount: 0,
      salesRowSpan: 0,
      purchaseRowSpan: 1,
      isSalesRow: false,
    });
  });

  return reportData;
};

const summarizeReport = (rows: ReportData[]): ReportSummary => {
  const summary = emptySummary();
  const processedSales = new Set<string>();
  const processedPurchases = new Set<string>();

  rows.forEach((row) => {
    if (row.purchaseContractId && !processedPurchases.has(row.purchaseContractId)) {
      summary.totalPurchaseAmount += row.purchaseTotalAmount;
      summary.totalPurchaseTaxAmount += row.purchaseTaxTotalAmount;
      summary.totalFreight += row.freight;
      summary.totalMiscellaneous += row.miscellaneous;
      summary.totalTariff += row.tariff;
      summary.totalValueAddedTax += row.valueAddedTax;
      processedPurchases.add(row.purchaseContractId);
    }
    if (row.salesContractId && !processedSales.has(row.salesContractId)) {
      summary.totalSalesAmount += row.salesTotalAmount;
      summary.totalSalesTaxAmount += row.salesTaxTotalAmount;
      processedSales.add(row.salesContractId);
    }
    summary.totalTax += row.tax;
    summary.totalProfit += row.profit;
    summary.totalNetProfit += row.netProfit;
    summary.totalRealizedProfit += row.realizedProfit;
  });

  return summary;
};

const buildReport = async (
  salesContracts: SalesContractData[],
  purchaseContracts: PurchaseContractData[],
  rate: number,
  relationSalesContracts: SalesContractData[] = salesContracts,
  relationPurchaseContracts: PurchaseContractData[] = purchaseContracts,
) => {
  const data = await buildReportRows(
    salesContracts,
    purchaseContracts,
    rate,
    relationSalesContracts,
    relationPurchaseContracts,
  );
  return { data, summary: summarizeReport(data), exchangeRate: rate };
};

export const ReportAPI = {
  getReportData: async (params: ReportParams): Promise<ReportResult> => {
    const rate = await getUsdToCnyRate();
    const [allSales, allPurchases] = await Promise.all([
      pb.collection('sales_contracts').getFullList<SalesContractData>({
        filter: 'status = "completed"',
        expand: 'customer',
        sort: 'sign_date,no',
      }),
      pb.collection('purchase_contracts').getFullList<PurchaseContractData>({
        filter: 'status = "completed"',
        expand: 'supplier',
        sort: 'sign_date,no',
      }),
    ]);

    const salesContracts = allSales.filter((contract) => isInMonthRange(contract.sign_date, params));
    const relationIndex = buildContractRelationIndex(allSales, allPurchases);
    const relatedPurchaseIds = new Set(salesContracts.flatMap(
      (contract) => relationIndex.purchaseIdsBySales.get(contract.id) || [],
    ));
    const purchaseContracts = allPurchases.filter((contract) => (
      relatedPurchaseIds.has(contract.id)
      || ((relationIndex.salesIdsByPurchase.get(contract.id) || []).length === 0
        && isInMonthRange(contract.sign_date, params))
    ));

    return buildReport(salesContracts, purchaseContracts, rate, allSales, allPurchases);
  },

  getReportByContractIds: async (
    salesIds: string[],
    purchaseIds: string[],
  ): Promise<ReportResult> => {
    const rate = await getUsdToCnyRate();
    if (salesIds.length === 0 && purchaseIds.length === 0) {
      return { data: [], summary: emptySummary(), exchangeRate: rate };
    }

    const [allSales, allPurchases] = await Promise.all([
      pb.collection('sales_contracts').getFullList<SalesContractData>({ expand: 'customer' }),
      pb.collection('purchase_contracts').getFullList<PurchaseContractData>({ expand: 'supplier' }),
    ]);
    const relationIndex = buildContractRelationIndex(allSales, allPurchases);
    const selectedSalesIds = new Set(salesIds);
    const selectedPurchaseIds = new Set(purchaseIds);

    let changed = true;
    while (changed) {
      changed = false;
      Array.from(selectedSalesIds).forEach((salesId) => {
        (relationIndex.purchaseIdsBySales.get(salesId) || []).forEach((purchaseId) => {
          if (!selectedPurchaseIds.has(purchaseId)) {
            selectedPurchaseIds.add(purchaseId);
            changed = true;
          }
        });
      });
      Array.from(selectedPurchaseIds).forEach((purchaseId) => {
        (relationIndex.salesIdsByPurchase.get(purchaseId) || []).forEach((salesId) => {
          if (!selectedSalesIds.has(salesId)) {
            selectedSalesIds.add(salesId);
            changed = true;
          }
        });
      });
    }

    return buildReport(
      allSales.filter((contract) => selectedSalesIds.has(contract.id)),
      allPurchases.filter((contract) => selectedPurchaseIds.has(contract.id)),
      rate,
      allSales,
      allPurchases,
    );
  },
};
