export interface Supplier {
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

export interface SupplierFormData {
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

export interface SupplierListParams {
  page?: number;
  per_page?: number;
  search?: string;
  region?: string;
}

export interface PurchaseContract {
  id: string;
  no: string;
  product_name: string;
  supplier: string;
  total_amount: number;
  status: string;
  created: string;
  expand?: {
    supplier?: Supplier;
    sales_contract?: {
      id: string;
      no: string;
      product_name: string;
    };
  };
}
