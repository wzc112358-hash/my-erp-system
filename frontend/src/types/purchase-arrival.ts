export interface PurchaseArrival {
  id: string;
  product_name: string;
  purchase_contract: string;
  sales_contract?: string;
  tracking_contract_no: string;
  shipment_date: string;
  quantity: number;
  logistics_company: string;
  shipment_address: string;
  wether_transit: 'yes' | 'no';
  transit_warehouse?: string;
  delivery_address: string;
  freight_1: number;
  freight_2?: number;
  miscellaneous_expenses: number;
  freight_1_status: 'paid' | 'unpaid';
  freight_2_status?: 'paid' | 'unpaid';
  freight_1_date?: string;
  freight_2_date?: string;
  invoice_1_status: 'issued' | 'unissued';
  invoice_2_status?: 'issued' | 'unissued';
  remark?: string;
  attachments?: string[];
  creator: string;
  created: string;
  updated: string;
  manager_confirmed?: string;
  expand?: {
    purchase_contract?: {
      id: string;
      no: string;
      product_name: string;
      supplier: string;
      total_amount: number;
      total_quantity: number;
      executed_quantity: number;
      execution_percent: number;
      is_cross_border: boolean;
    };
    sales_contract?: {
      id: string;
      no: string;
      product_name: string;
    };
  };
}

export interface PurchaseArrivalFormData {
  product_name: string;
  purchase_contract: string;
  sales_contract?: string;
  tracking_contract_no: string;
  shipment_date: string;
  quantity: number;
  logistics_company: string;
  shipment_address: string;
  wether_transit: 'yes' | 'no';
  transit_warehouse?: string;
  delivery_address: string;
  freight_1: number;
  freight_2?: number;
  miscellaneous_expenses: number;
  freight_1_status: 'paid' | 'unpaid';
  freight_2_status?: 'paid' | 'unpaid';
  freight_1_date?: string;
  freight_2_date?: string;
  invoice_1_status: 'issued' | 'unissued';
  invoice_2_status?: 'issued' | 'unissued';
  remark?: string;
  attachments?: (File | string)[];
}

export interface PurchaseArrivalListParams {
  page?: number;
  per_page?: number;
  search?: string;
  contractNo?: string;
  purchase_contract?: string;
}
