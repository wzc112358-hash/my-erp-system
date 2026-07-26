import type { Dayjs } from 'dayjs';

export interface BiddingUploadValue {
  originFileObj?: File;
  url?: string;
  name?: string;
}

export interface BiddingRecord {
  id: string;
  bidding_company: string;
  bidding_no: string;
  product_name: string;
  quantity?: number;
  quantity_unit?: string;
  specification?: string;
  purity?: string;
  packaging?: string;
  quoted_unit_price?: number;
  quoted_total_amount?: number;
  currency?: 'CNY' | 'USD' | 'EUR';
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
  winning_unit_price?: number;
  winning_total_amount?: number;
  winning_supplier?: string;
  brand?: string;
  loss_reason?: string;
  qualification_snapshot?: string[] | string;
  source_notice_id?: string;
  source_notice_fingerprint?: string;
  source_notice_title?: string;
  source_notice_url?: string;
  source_name?: string;
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
  quantity?: number;
  quantity_unit?: string;
  specification?: string;
  purity?: string;
  packaging?: string;
  quoted_unit_price?: number;
  quoted_total_amount?: number;
  currency?: 'CNY' | 'USD' | 'EUR';
  tender_fee?: number;
  tender_fee_date?: string | Dayjs;
  tender_fee_invoice?: (File | BiddingUploadValue)[];
  bid_bond?: number;
  bid_bond_date?: string | Dayjs;
  open_date?: string | Dayjs;
  bid_result?: string;
  bond_return_date?: string | Dayjs;
  bond_return_amount?: number;
  agency_fee?: number;
  winning_unit_price?: number;
  winning_total_amount?: number;
  winning_supplier?: string;
  brand?: string;
  loss_reason?: string;
  qualification_snapshot?: string[];
  source_notice_id?: string;
  source_notice_fingerprint?: string;
  source_notice_title?: string;
  source_notice_url?: string;
  source_name?: string;
  sales_contract?: string;
  remark?: string;
  attachments?: (File | string | BiddingUploadValue)[];
}

export type HistoricalBidMatchType = 'exact_product' | 'product_family' | 'same_buyer';

export interface HistoricalBidMatch {
  region: 'beijing' | 'lanzhou';
  id: string;
  biddingCompany: string;
  biddingNo: string;
  productName: string;
  quantity?: number;
  quantityUnit: string;
  specification: string;
  purity: string;
  packaging: string;
  quotedUnitPrice?: number;
  quotedTotalAmount?: number;
  currency: string;
  tenderFee?: number;
  bidBond?: number;
  winningUnitPrice?: number;
  winningTotalAmount?: number;
  winningSupplier: string;
  brand: string;
  bidResult: 'pending' | 'won' | 'lost';
  openDate: string;
  lossReason: string;
  qualificationSnapshot: string[];
  matchType: HistoricalBidMatchType;
  matchLabel: string;
  score: number;
  reasons: string[];
}

export interface BidDraftFields {
  biddingCompany: string;
  biddingNo: string;
  productName: string;
  quantity?: number;
  quantityUnit: string;
  specification: string;
  purity: string;
  packaging: string;
  quotedUnitPrice?: number;
  quotedTotalAmount?: number;
  currency: string;
  tenderFee?: number;
  bidBond?: number;
  openDate: string;
  bidResult: 'pending';
  qualificationSnapshot: string[];
  remark: string;
  sourceNoticeId: string;
  sourceNoticeFingerprint: string;
  sourceNoticeTitle: string;
  sourceNoticeUrl: string;
  sourceName: string;
}

export interface BidPreparation {
  notice: {
    id: string;
    title: string;
    sourceName: string;
    url: string;
    buyerName: string;
    deadlineAt: string;
  };
  historicalMatches: HistoricalBidMatch[];
  draft: BidDraftFields;
  fieldEvidence: Partial<Record<keyof BidDraftFields, string>>;
  warnings: string[];
  existingRecord?: {
    id: string;
    biddingNo: string;
    productName: string;
  };
}

export interface BiddingRecordListParams {
  page?: number;
  per_page?: number;
  search?: string;
  bid_result?: string;
}
