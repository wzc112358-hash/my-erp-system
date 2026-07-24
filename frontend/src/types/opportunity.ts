export type BidNoticeKind = 'current' | 'attention';

export interface BidNotice {
  id: string;
  sourceKey: string;
  sourceName: string;
  kind: BidNoticeKind;
  title: string;
  url: string;
  buyerName: string;
  publishedAt: string;
  deadlineAt: string;
  matchedProducts: string[];
  judgment: string;
  requirements: string[];
  missingInfo: string[];
  evidence: string;
  detailReadMethod: string;
  attachmentUrls: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
}

export interface BidCollectionRun {
  id: string;
  sourceKey: string;
  sourceName: string;
  runDate: string;
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'no_new' | 'partial' | 'failed';
  rawCount: number;
  eligibleCount: number;
  currentCount: number;
  attentionCount: number;
  newCount: number;
  updatedCount: number;
  duplicateCount: number;
  excludedCount: number;
  summary: string;
  errorMessage: string;
}

export interface BidSourceOption {
  sourceKey: string;
  sourceName: string;
}

export interface BidNoticeListParams {
  page?: number;
  perPage?: number;
  kind?: BidNoticeKind;
  source?: string;
  search?: string;
}

export interface BidNoticeListResult {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: BidNotice[];
}
