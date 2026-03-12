export interface SalesShipment {
  id: string;
  product_name: string;
  sales_contract: string;
  tracking_contract_no: string;
  date: string;
  quantity: number;
  logistics_company: string;
  delivery_address: string;
  remark?: string;
  attachments?: string[];
  creator: string;
  created: string;
  updated: string;
  expand?: {
    sales_contract?: {
      id: string;
      no: string;
      product_name: string;
      customer: string;
      total_amount: number;
      total_quantity: number;
      executed_quantity: number;
      execution_percent: number;
    };
  };
}

export interface SalesShipmentFormData {
  product_name: string;
  sales_contract: string;
  tracking_contract_no: string;
  date: string;
  quantity: number;
  logistics_company: string;
  delivery_address: string;
  remark?: string;
  attachments?: File[];
}

export interface SalesShipmentListParams {
  page?: number;
  per_page?: number;
  search?: string;
  contractNo?: string;
  sales_contract?: string;
}
