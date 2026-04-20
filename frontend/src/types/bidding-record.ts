export interface BiddingRecord {
  id: string;
  bidding_company: string;
  bidding_no: string;
  product_name: string;
  quantity: number;
  tender_fee: number;
  tender_fee_date: string;
  tender_fee_invoice?: string[];
  bid_bond: number;
  bid_bond_date: string;
  open_date: string;
  bid_result: 'pending' | 'won' | 'lost';
  bond_return_date?: string;
  bond_return_amount?: number;
  agency_fee?: number;
  sales_contract?: string;
  remark?: string;
  attachments?: string[];
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    sales_contract?: { id: string; no: string; product_name: string };
    creator_user?: { id: string; name: string };
  };
}

export interface BiddingRecordFormData {
  bidding_company: string;
  bidding_no: string;
  product_name: string;
  quantity: number;
  tender_fee?: number;
  tender_fee_date?: string;
  tender_fee_invoice?: File[];
  bid_bond?: number;
  bid_bond_date?: string;
  open_date?: string;
  bid_result?: string;
  bond_return_date?: string;
  bond_return_amount?: number;
  agency_fee?: number;
  sales_contract?: string;
  remark?: string;
  attachments?: (File | string)[];
}

export interface BiddingRecordListParams {
  page?: number;
  per_page?: number;
  search?: string;
  bid_result?: string;
}
