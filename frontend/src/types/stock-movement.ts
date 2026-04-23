export interface StockMovement {
  id: string;
  inventory: string;
  movement_type: 'in' | 'out';
  quantity: number;
  remark?: string;
  attachments?: string[];
  created: string;
  updated: string;
  expand?: {
    inventory?: { id: string; product_name: string };
  };
}

export interface StockMovementFormData {
  inventory: string;
  movement_type: 'in' | 'out';
  quantity: number;
  remark?: string;
  attachments?: (File | string)[];
}

export interface StockMovementListParams {
  page?: number;
  per_page?: number;
  inventory?: string;
}
