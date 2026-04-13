export interface SalesContract {
  id: string;
  no: string;
  product_name: string;
  customer: string;
  purchase_contract?: string;
  total_amount: number;
  unit_price: number;
  total_quantity: number;
  is_price_excluding_tax: boolean;
  is_cross_border: boolean;
  executed_quantity: number;
  execution_percent: number;
  receipted_amount: number;
  receipt_percent: number;
  debt_amount: number;
  debt_percent: number;
  invoiced_amount: number;
  invoice_percent: number;
  uninvoiced_amount: number;
  uninvoiced_percent: number;
  sign_date: string;
  status: 'executing' | 'completed' | 'cancelled';
  remark?: string;
  attachments?: string[];
  creator: string;
  sales_manager?: string;
  created: string;
  updated: string;
  expand?: {
    customer?: {
      id: string;
      name: string;
      contact?: string;
      phone?: string;
      email?: string;
    };
    customers?: {
      id: string;
      name: string;
      contact?: string;
      phone?: string;
      email?: string;
    };
    purchase_contract?: {
      id: string;
      no: string;
      product_name: string;
      supplier: string;
      expand?: {
        supplier?: {
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

export interface SalesContractFormData {
  no: string;
  customer: string;
  purchase_contract?: string;
  product_name: string;
  unit_price: number;
  total_quantity: number;
  is_price_excluding_tax?: boolean;
  is_cross_border?: boolean;
  sign_date: string;
  remark?: string;
  sales_manager?: string;
  attachments?: File[];
}

export interface SalesContractListParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
}

export interface SalesContractCreateData {
  no: string;
  customer: string;
  purchase_contract?: string;
  product_name: string;
  unit_price: number;
  total_quantity: number;
  is_price_excluding_tax?: boolean;
  is_cross_border?: boolean;
  sign_date: string;
  remark?: string;
  sales_manager?: string;
}

export interface SalesShipment {
  id: string;
  product_name: string;
  sales_contract: string;
  tracking_contract_no: string;
  date: string;
  quantity: number;
  logistics_company: string;
  shipment_address: string;
  delivery_address: string;
  freight: number;
  freight_status: 'paid' | 'unpaid';
  invoice_status: 'issued' | 'unissued';
  remark?: string;
  creator: string;
  created: string;
}

export interface SaleInvoice {
  id: string;
  no: string;
  product_name: string;
  sales_contract: string;
  invoice_type: string;
  product_amount: number;
  amount: number;
  issue_date: string;
  remark?: string;
  attachments?: string[];
  creator: string;
  created: string;
  updated?: string;
  manager_confirmed?: string;
  expand?: {
    sales_contract?: {
      id: string;
      no: string;
      product_name: string;
      uninvoiced_amount?: number;
      is_cross_border?: boolean;
    };
    creator?: {
      id: string;
      name: string;
    };
  };
}

export interface SaleInvoiceFormData {
  no: string;
  product_name: string;
  sales_contract: string;
  invoice_type: string;
  product_amount: number;
  amount: number;
  issue_date: string;
  remark?: string;
  attachments?: File[];
}

export interface SaleInvoiceListParams {
  page?: number;
  per_page?: number;
  search?: string;
  sales_contract?: string;
}

export interface SaleReceipt {
  id: string;
  product_name: string;
  sales_contract: string;
  amount: number;
  product_amount: number;
  receive_date: string;
  method?: string;
  account?: string;
  remark?: string;
  attachments?: string[];
  creator: string;
  created: string;
  updated?: string;
  manager_confirmed?: string;
  expand?: {
    sales_contract?: {
      id: string;
      no: string;
      product_name: string;
      total_amount: number;
      receipted_amount?: number;
      receipt_percent?: number;
      debt_amount?: number;
      debt_percent?: number;
    };
    creator?: {
      id: string;
      name: string;
    };
  };
}

export interface SaleReceiptFormData {
  product_name: string;
  sales_contract: string;
  amount: number;
  product_amount: number;
  receive_date: string;
  method?: string;
  account?: string;
  remark?: string;
  attachments?: File[];
}

export interface SaleReceiptListParams {
  page?: number;
  per_page?: number;
  search?: string;
  sales_contract?: string;
}
