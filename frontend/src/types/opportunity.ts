export type BidNoticeKind = 'current' | 'attention';

export type BidQualificationStatus = 'met' | 'unconfirmed' | 'not_met' | 'not_applicable';

export interface BidQualificationCheck {
  requirement: string;
  status: BidQualificationStatus;
  basis: string;
}

export interface BidBusinessAssessment {
  decision: 'likely_can_do' | 'needs_manual_check' | 'likely_cannot_do';
  decisionSummary: string;
  productSummary: string;
  quantity: string;
  specifications: string[];
  deliveryTerms: string[];
  commercialTerms: string[];
  qualificationChecks: BidQualificationCheck[];
  historicalReferences: string[];
  nextActions: string[];
}

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
  assessment?: BidBusinessAssessment;
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
  collectionMode: 'scheduled' | 'local_helper';
  keywordSearch: boolean;
  searchScopeEditable: boolean;
  searchScopeCustomized: boolean;
  searchScope: SiteSearchScope | null;
  searchScopeUpdatedBy: string;
  searchScopeUpdatedAt: string;
}

export interface SiteSearchScope {
  productTerms: string[];
  familyTerms: string[];
  exploratoryTerms: string[];
  exploratoryTermsPerRun: number;
}

export interface LocalHelperPairingInvitation {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
  ownerName: string;
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
