export interface ServiceContract {
  id: string;
  no: string;
  customer: string;
  product_name: string;
  sign_date: string;
  is_cross_border: boolean;
  remark?: string;
  attachments?: string[];
  sales_manager?: string;
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    customer?: { id: string; name: string };
    creator_user?: { id: string; name: string };
  };
}

export interface ServiceContractFormData {
  no: string;
  customer: string;
  product_name: string;
  sign_date: string;
  is_cross_border?: boolean;
  remark?: string;
  attachments?: (File | string)[];
  sales_manager?: string;
}

export interface ServiceContractListParams {
  page?: number;
  per_page?: number;
  search?: string;
}

export interface ServiceOrder {
  id: string;
  service_contract: string;
  order_no: string;
  unit_price: number;
  quantity: number;
  service_fee_rate?: number;
  receipt_amount: number;
  receipt_date: string;
  departure_date?: string;
  customer_payment_date?: string;
  bank_settlement_date?: string;
  actual_receipt_amount_usd?: number;
  receipt_amount_rmb?: number;
  receipt_rmb_date?: string;
  invoice_amount: number;
  invoice_date?: string;
  tax_date?: string;
  tax_amount?: number;
  total_amount?: number;
  invoice_time?: string;
  payment_date?: string;
  payment_amount?: number;
  remark?: string;
  attachments?: string[];
  manager?: string;
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    creator_user?: { id: string; name: string };
  };
}

export interface ServiceOrderFormData {
  service_contract: string;
  order_no: string;
  unit_price: number;
  quantity: number;
  service_fee_rate?: number;
  receipt_amount: number;
  receipt_date: string;
  departure_date?: string;
  customer_payment_date?: string;
  bank_settlement_date?: string;
  actual_receipt_amount_usd?: number;
  receipt_amount_rmb?: number;
  receipt_rmb_date?: string;
  invoice_amount?: number;
  invoice_date?: string;
  tax_date?: string;
  tax_amount?: number;
  total_amount?: number;
  invoice_time?: string;
  payment_date?: string;
  payment_amount?: number;
  remark?: string;
  attachments?: (File | string)[];
  manager?: string;
}
