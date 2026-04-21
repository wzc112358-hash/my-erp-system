export interface ComparisonSalesContract {
  id: string;
  no: string;
  product_name: string;
  customer: string;
  customer_name?: string;
  unit_price: number;
  total_amount: number;
  total_quantity: number;
  is_price_excluding_tax: boolean;
  is_cross_border: boolean;
  executed_quantity: number;
  execution_percent?: number;
  receipted_amount: number;
  receipt_percent?: number;
  debt_amount: number;
  debt_percent?: number;
  invoiced_amount: number;
  invoice_percent?: number;
  uninvoiced_amount?: number;
  sign_date: string;
  status: string;
  remark?: string;
  attachments?: string[];
  sales_manager?: string;
  created_at?: string;
  updated?: string;
  expand?: {
    customer?: {
      name: string;
    };
  };
}

export interface PurchaseSummary {
  purchaseIds: string[];
  purchaseNos: string[];
  shipmentDates: string[];
  paymentDates: string[];
}

export interface OverviewContract {
  id: string;
  type: 'sales' | 'purchase';
  no: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  paymentDate?: string;
  invoiceNo?: string;
  invoiceIssueDate?: string;
  shipmentDate?: string;
  created: string;
  customerName?: string;
  supplierName?: string;
  associatedPurchaseIds?: string[];
  associatedSalesIds?: string[];
  purchaseSummary?: PurchaseSummary;
}

export interface ComparisonPurchaseContract {
  id: string;
  no: string;
  product_name: string;
  supplier: string;
  supplier_name?: string;
  sales_contract: string;
  unit_price: number;
  total_amount: number;
  total_quantity: number;
  is_cross_border: boolean;
  executed_quantity: number;
  execution_percent?: number;
  invoiced_amount: number;
  invoiced_percent?: number;
  uninvoiced_amount?: number;
  uninvoiced_percent?: number;
  paid_amount: number;
  paid_percent?: number;
  unpaid_amount?: number;
  unpaid_percent?: number;
  sign_date?: string;
  paid_date?: string;
  status: string;
  remark?: string;
  attachments?: string[];
  purchasing_manager?: string;
  created_at?: string;
  updated?: string;
  expand?: {
    supplier?: {
      name: string;
    };
    sales_contract?: ComparisonSalesContract;
  };
  freight_info?: {
    freight_1: number;
    freight_2: number;
    miscellaneous_expenses: number;
  };
}

export interface SaleInvoice {
  id: string;
  sales_contract: string;
  no: string;
  amount: number;
  invoice_date: string;
}

export interface PurchaseInvoice {
  id: string;
  purchase_contract: string;
  no: string;
  amount: number;
  invoice_date: string;
}

export interface SaleReceipt {
  id: string;
  sales_contract: string;
  receive_date: string;
  amount: number;
}

export interface PurchasePayment {
  id: string;
  purchase_contract: string;
  pay_date: string;
  amount: number;
}

export type ProgressDetailType = 'shipment' | 'payment' | 'invoice';

export interface ProgressShipment {
  sales_quantity: number;
  purchase_quantity: number;
  percentage: number;
}

export interface ProgressShipmentPerContract {
  purchase_contract_id: string;
  purchase_contract_no: string;
  sales_executed_quantity: number;
  sales_total_quantity: number;
  purchase_executed_quantity: number;
  purchase_total_quantity: number;
  sales_percentage: number;
  purchase_percentage: number;
}

export interface ProgressPaymentPerContract {
  purchase_contract_id: string;
  purchase_contract_no: string;
  sales_received_amount: number;
  sales_total_amount: number;
  purchase_paid_amount: number;
  purchase_total_amount: number;
  sales_percentage: number;
  purchase_percentage: number;
}

export interface ProgressInvoicePerContract {
  purchase_contract_id: string;
  purchase_contract_no: string;
  sales_invoiced_amount: number;
  sales_total_amount: number;
  purchase_invoiced_amount: number;
  purchase_total_amount: number;
  sales_percentage: number;
  purchase_percentage: number;
}

export interface ProgressPayment {
  sales_amount: number;
  purchase_amount: number;
  percentage: number;
}

export interface ProgressInvoice {
  sales_amount: number;
  purchase_amount: number;
  percentage: number;
}

export interface ProgressComparison {
  shipment: ProgressShipment;
  shipment_per_contract: ProgressShipmentPerContract[];
  payment: ProgressPayment;
  payment_per_contract: ProgressPaymentPerContract[];
  invoice: ProgressInvoice;
  invoice_per_contract: ProgressInvoicePerContract[];
}

export interface ProfitAnalysis {
  unit_profit: number;
  total_profit: number;
  sales_amount: number;
  purchase_amount: number;
  sales_quantity: number;
  purchase_quantity: number;
  total_freight: number;
  total_miscellaneous: number;
  is_quantity_matched: boolean;
  tax_rate?: number;
  after_tax_profit?: number;
}

export interface ComparisonData {
  sales_contract: ComparisonSalesContract;
  purchase_contracts: ComparisonPurchaseContract[];
  progress: ProgressComparison;
  profit: ProfitAnalysis;
}

export interface SalesShipmentRecord {
  id: string;
  product_name: string;
  tracking_contract_no: string;
  date: string;
  quantity: number;
  logistics_company: string;
  delivery_address: string;
  remark: string;
  attachments: string[];
  created: string;
}

export interface SaleInvoiceRecord {
  id: string;
  sales_contract: string;
  no: string;
  product_name: string;
  invoice_type: string;
  product_amount: number;
  amount: number;
  issue_date: string;
  uninvoiced_amount: number;
  uninvoiced_percent: number;
  manager_confirmed: string;
  remark: string;
  attachments: string[];
  created: string;
}

export interface SaleReceiptRecord {
  id: string;
  sales_contract: string;
  product_name: string;
  amount: number;
  product_amount: number;
  receive_date: string;
  method: string;
  account: string;
  receipt_percent: number;
  debt_percent: number;
  manager_confirmed: string;
  remark: string;
  attachments: string[];
  created: string;
}

export interface PurchaseArrivalRecord {
  id: string;
  purchase_contract: string;
  product_name: string;
  tracking_contract_no: string;
  shipment_date: string;
  quantity: number;
  logistics_company: string;
  shipment_address: string;
  wether_transit: string;
  transit_warehouse: string;
  delivery_address: string;
  freight_1: number;
  freight_1_currency: 'USD' | 'CNY';
  freight_2: number;
  freight_2_currency: 'USD' | 'CNY';
  miscellaneous_expenses: number;
  miscellaneous_expenses_currency: 'USD' | 'CNY';
  freight_1_status: string;
  freight_2_status: string;
  freight_1_date: string;
  freight_2_date: string;
  invoice_1_status: string;
  invoice_2_status: string;
  manager_confirmed: string;
  remark: string;
  attachments: string[];
  created: string;
}

export interface PurchaseInvoiceRecord {
  id: string;
  purchase_contract: string;
  no: string;
  product_name: string;
  invoice_type: string;
  product_amount: number;
  amount: number;
  receive_date: string;
  received_amount: number;
  received_percent: number;
  unreceived_amount: number;
  unreceived_percent: number;
  manager_confirmed: string;
  is_verified: string;
  remark: string;
  attachments: string[];
  created: string;
}

export interface PurchasePaymentRecord {
  id: string;
  purchase_contract: string;
  no: string;
  product_name: string;
  product_amount: number;
  amount: number;
  pay_date: string;
  method: string;
  manager_confirmed: string;
  remark: string;
  attachments: string[];
  created: string;
}

export interface ContractDetailData {
  sales_contract?: ComparisonSalesContract;
  purchase_contracts: ComparisonPurchaseContract[];
  sales_shipments: SalesShipmentRecord[];
  sale_invoices: SaleInvoiceRecord[];
  sale_receipts: SaleReceiptRecord[];
  purchase_arrivals: PurchaseArrivalRecord[];
  purchase_invoices: PurchaseInvoiceRecord[];
  purchase_payments: PurchasePaymentRecord[];
  profit: ProfitAnalysis;
}

export type FlowNodeType =
  | 'sales_contract'
  | 'purchase_contract'
  | 'sales_shipment'
  | 'sale_invoice'
  | 'sale_receipt'
  | 'purchase_arrival'
  | 'purchase_invoice'
  | 'purchase_payment';

export interface FlowNodeData {
  [key: string]: unknown;
  flowType: FlowNodeType;
  label: string;
  title: string;
  sublabel?: string;
  amount?: number;
  quantity?: number;
  no?: string;
  date?: string;
  status?: string;
  managerConfirmed?: string;
  contractId?: string;
  collectionName: string;
  recordId: string;
  record?: Record<string, unknown>;
  attachments?: string[];
}

export interface FlowContractOption {
  id: string;
  no: string;
  productName: string;
  quantity: number;
  signDate: string;
  type: 'sales' | 'purchase';
  status: string;
  created: string;
  pendingCount?: number;
}
