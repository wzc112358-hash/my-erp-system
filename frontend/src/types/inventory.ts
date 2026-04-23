export interface Inventory {
  id: string;
  product_name: string;
  remaining_quantity: number;
  total_in_quantity: number;
  total_out_quantity: number;
  last_in_date?: string;
  last_out_date?: string;
  remark?: string;
  attachments?: string[];
  created: string;
  updated: string;
}

export interface InventoryFormData {
  product_name: string;
  remark?: string;
  attachments?: (File | string)[];
}

export interface InventoryListParams {
  page?: number;
  per_page?: number;
  search?: string;
}
