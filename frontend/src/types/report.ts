export interface ReportData {
  purchaseContractNo: string;
  purchaseSignDate: string;
  productName: string;
  supplierName: string;
  purchaseQuantity: number;
  purchaseUnitPrice: number;
  purchaseTotalAmount: number;
  purchaseTaxTotalAmount: number;
  purchasePaymentDate: string;
  purchaseInvoiceDate: string;
  salesContractNo: string;
  salesSignDate: string;
  customerName: string;
  salesQuantity: number;
  salesUnitPrice: number;
  salesTotalAmount: number;
  salesTaxTotalAmount: number;
  freight: number;
  miscellaneous: number;
  arrivalDate: string;
  salesReceiptDate: string;
  salesInvoiceDate: string;
  tax: number;
  profit: number;
  netProfit: number;
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
  totalProfit: number;
  totalNetProfit: number;
}

export interface ReportParams {
  startMonth: number;
  endMonth: number;
  year: number;
}
