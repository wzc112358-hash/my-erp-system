export interface ComparisonSalesContract {
  id: string;
  no: string;
  product_name: string;
  customer: string;
  customer_name?: string;
  unit_price: number;
  total_amount: number;
  total_quantity: number;
  executed_quantity: number;
  receipted_amount: number;
  invoiced_amount: number;
  debt_amount: number;
  sign_date: string;
  status: string;
  expand?: {
    customer?: {
      name: string;
    };
  };
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
  executed_quantity: number;
  paid_amount: number;
  invoiced_amount: number;
  sign_date?: string;
  status: string;
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

export type ProgressDetailType = 'shipment' | 'payment' | 'invoice';
