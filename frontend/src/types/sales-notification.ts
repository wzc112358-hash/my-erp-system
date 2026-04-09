export interface SalesNotification {
  id: string;
  type: string;
  purchase_contract: string;
  title: string;
  message: string;
  is_read: boolean;
  recipient: string;
  created: string;
  updated: string;
  expand?: {
    purchase_contract?: {
      id: string;
      no: string;
      product_name: string;
      supplier: string;
      total_amount: number;
    };
    recipient?: {
      id: string;
      name: string;
      email: string;
    };
  };
}

export interface SalesNotificationListParams {
  page?: number;
  per_page?: number;
  is_read?: boolean;
}

export interface SalesNotificationListResult {
  items: SalesNotification[];
  totalItems: number;
  totalPages: number;
  page: number;
  perPage: number;
}
