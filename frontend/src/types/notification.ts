export interface Notification {
  id: string;
  type: string;
  sales_contract: string;
  title: string;
  message: string;
  is_read: boolean;
  recipient: string;
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
      is_cross_border?: boolean;
    };
    recipient?: {
      id: string;
      name: string;
      email: string;
    };
  };
}

export interface NotificationListParams {
  page?: number;
  per_page?: number;
  is_read?: boolean;
}

export interface NotificationListResult {
  items: Notification[];
  totalItems: number;
  totalPages: number;
  page: number;
  perPage: number;
}
