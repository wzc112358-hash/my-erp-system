export interface ReportData {
  purchaseContractId: string;
  purchaseContractNo: string;
  purchaseSignDate: string;
  purchaseProductName: string;
  productName: string;
  supplierName: string;
  purchaseQuantity: number;
  purchaseUnitPrice: number;
  purchaseTotalAmount: number;
  purchaseTaxTotalAmount: number;
  purchasePaymentDate: string;
  purchaseInvoiceDate: string;
  purchasePaymentProgress: number;
  purchaseInvoiceProgress: number;
  salesContractId: string;
  salesContractNo: string;
  salesSignDate: string;
  salesProductName: string;
  customerName: string;
  salesQuantity: number;
  salesUnitPrice: number;
  salesTotalAmount: number;
  salesTaxTotalAmount: number;
  salesReceiptProgress: number;
  salesInvoiceProgress: number;
  freight: number;
  miscellaneous: number;
  tariff: number;
  valueAddedTax: number;
  purchaseAllocationRatio: number;
  allocatedPurchaseTaxAmount: number;
  arrivalDate: string;
  salesReceiptDate: string;
  salesInvoiceDate: string;
  tax: number;
  profit: number;
  netProfit: number;
  realizedProfit: number;
  salesRowSpan: number;
  purchaseRowSpan: number;
  isSalesRow: boolean;
}

export interface ReportSummary {
  totalSalesAmount: number;
  totalPurchaseAmount: number;
  totalSalesTaxAmount: number;
  totalPurchaseTaxAmount: number;
  totalTax: number;
  totalFreight: number;
  totalMiscellaneous: number;
  totalTariff: number;
  totalValueAddedTax: number;
  totalProfit: number;
  totalNetProfit: number;
  totalRealizedProfit: number;
}

export interface ReportParams {
  startMonth: number;
  endMonth: number;
  year: number;
}

export interface ReportResult {
  data: ReportData[];
  summary: ReportSummary;
  exchangeRate: number;
}
