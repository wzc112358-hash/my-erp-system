export interface PurchaseContract {
  id: string;
  no: string;
  product_name: string;
  supplier: string;
  sales_contract: string;
  total_amount: number;
  unit_price: number;
  total_quantity: number;
  is_cross_border: boolean;
  executed_quantity: number;
  execution_percent: number;
  invoiced_amount: number;
  invoiced_percent: number;
  uninvoiced_amount: number;
  uninvoiced_percent: number;
  paid_amount: number;
  paid_percent: number;
  unpaid_amount: number;
  unpaid_percent: number;
  sign_date: string;
  status: 'executing' | 'completed' | 'cancelled';
  remark?: string;
  attachments?: string[];
  creator: string;
  purchasing_manager?: string;
  created: string;
  updated: string;
  expand?: {
    supplier?: {
      id: string;
      name: string;
      contact?: string;
      phone?: string;
      email?: string;
    };
    sales_contract?: {
      id: string;
      no: string;
      product_name: string;
      customer: string;
      expand?: {
        customer?: {
          id: string;
          name: string;
        };
      };
    };
    creator?: {
      id: string;
      name: string;
    };
  };
}

export interface PurchaseContractFormData {
  no: string;
  supplier: string;
  sales_contract?: string;
  product_name: string;
  unit_price: number;
  total_quantity: number;
  is_cross_border?: boolean;
  sign_date: string;
  remark?: string;
  purchasing_manager?: string;
  attachments?: File[];
}

export interface PurchaseContractListParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
}

export interface PurchaseArrival {
  id: string;
  product_name: string;
  purchase_contract: string;
  tracking_contract_no: string;
  shipment_date: string;
  quantity: number;
  logistics_company: string;
  shipment_address: string;
  wether_transit: string;
  transit_warehouse?: string;
  delivery_address: string;
  freight_1: number;
  freight_2?: number;
  miscellaneous_expenses: number;
  freight_1_status?: string;
  freight_2_status?: string;
  freight_1_date?: string;
  freight_2_date?: string;
  invoice_1_status?: string;
  invoice_2_status?: string;
  remark?: string;
  attachments?: string[];
  creator: string;
  created: string;
  updated?: string;
  manager_confirmed?: string;
}

export interface PurchaseInvoice {
  id: string;
  no: string;
  code?: string;
  product_name: string;
  purchase_contract: string;
  invoice_type: string;
  supplier?: string;
  product_amount: number;
  amount: number;
  tax_rate?: number;
  tax_amount?: number;
  receive_date: string;
  remark?: string;
  attachments?: string[];
  creator: string;
  created: string;
  manager_confirmed?: string;
  is_verified?: string;
  expand?: {
    purchase_contract?: {
      id: string;
      no: string;
      product_name: string;
      is_cross_border?: boolean;
    };
    creator?: {
      id: string;
      name: string;
    };
  };
}

export interface PurchaseInvoiceFormData {
  no: string;
  code?: string;
  product_name: string;
  purchase_contract: string;
  invoice_type: string;
  supplier?: string;
  product_amount: number;
  amount: number;
  tax_rate?: number;
  tax_amount?: number;
  receive_date: string;
  remark?: string;
  attachments?: File[];
  is_verified?: string;
}

export interface PurchaseInvoiceListParams {
  page?: number;
  per_page?: number;
  search?: string;
  purchase_contract?: string;
}

export interface PurchasePayment {
  id: string;
  no: string;
  product_name: string;
  purchase_contract: string;
  product_amount: number;
  amount: number;
  pay_date: string;
  method?: string;
  remark?: string;
  attachments?: string[];
  creator: string;
  created: string;
  manager_confirmed?: string;
  expand?: {
    purchase_contract?: {
      id: string;
      no: string;
      product_name: string;
      total_amount?: number;
      is_cross_border?: boolean;
    };
    creator?: {
      id: string;
      name: string;
    };
  };
}

export interface PurchasePaymentFormData {
  no: string;
  product_name: string;
  purchase_contract: string;
  product_amount: number;
  amount: number;
  pay_date: string;
  method?: string;
  remark?: string;
  attachments?: File[];
}

export interface PurchasePaymentListParams {
  page?: number;
  per_page?: number;
  search?: string;
  purchase_contract?: string;
}
