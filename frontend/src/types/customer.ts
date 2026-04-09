export interface Customer {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  industry?: string;
  region?: string;
  bank_name?: string;
  bank_account?: string;
  remark?: string;
  creator: string;
  created: string;
  updated: string;
}

export interface CustomerFormData {
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  industry?: string;
  region?: string;
  bank_name?: string;
  bank_account?: string;
  remark?: string;
}

export interface CustomerListParams {
  page?: number;
  per_page?: number;
  search?: string;
  region?: string;
}

export interface SalesContract {
  id: string;
  no: string;
  product_name: string;
  customer: string;
  total_amount: number;
  status: string;
  created: string;
  expand?: {
    customer?: Customer;
  };
}
