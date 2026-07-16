export type BrowserLink = {
  text: string;
  href: string;
  title?: string;
};

export type BrowserNetworkResponse = {
  url: string;
  status: number;
  contentType?: string;
  bodySnippet?: string;
  responseHeaders?: Record<string, string>;
  challenge?: boolean;
};

export type BrowserInteractiveElement = {
  id: string;
  role: string;
  text: string;
  value?: string;
  placeholder?: string;
};

export type BrowserListItem = {
  title: string;
  elementId?: string;
  url?: string;
  publishedAt?: string;
  deadlineAt?: string;
  buyerName?: string;
  noticeType?: string;
  rawText?: string;
};

export type BrowserAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; elementId: string }
  | { type: 'click_first_notice' }
  | { type: 'search'; query: string }
  | { type: 'next_page' }
  | { type: 'read_document' }
  | { type: 'back' }
  | { type: 'wait'; milliseconds: number };

export type BrowserDocumentObservation = {
  title: string;
  noticeType?: string;
  publishedAt?: string;
  buyerName?: string;
  pdfUrl?: string;
  attachmentUrls?: string[];
  text: string;
  pageCount?: number;
};

export type BrowserObservation = {
  title: string;
  url: string;
  visibleText: string;
  screenshotPath?: string;
  domSnapshot?: string;
  links?: BrowserLink[];
  networkResponses?: BrowserNetworkResponse[];
  downloadedFiles?: string[];
  interactiveElements?: BrowserInteractiveElement[];
  listItems?: BrowserListItem[];
  searchQuery?: string;
  currentPage?: number;
  totalPages?: number;
  noticeType?: number;
  noticeTypes?: string[];
  searchReady?: boolean;
  humanChallengeVisible?: boolean;
  document?: BrowserDocumentObservation;
};

export type BrowserActionResult = {
  performed: boolean;
  observation: BrowserObservation;
  detail?: string;
};

/**
 * One employee-visible browser session. The implementation owns profile reuse,
 * network evidence, screenshots and cleanup; collection code only learns this
 * compact interface.
 */
export type BrowserSession = {
  engine: 'playwright' | 'electron-cdp' | 'test';
  open(url: string): Promise<BrowserObservation>;
  observe(): Promise<BrowserObservation>;
  act?(action: BrowserAction): Promise<BrowserActionResult>;
  screenshot?(): Promise<string>;
  close?(): Promise<void>;
};

export type BrowserHarnessRuntime = BrowserSession;

export type CollectionTask = {
  id: string;
  sourceName: string;
  entryUrl: string;
  searchTerms?: string;
};

export type LocalHelperTask = CollectionTask & {
  lastCandidateBundle?: CandidateBundle | null;
  lastScreenedNotices?: unknown[];
};

export type LocalHelperArtifact = {
  artifact_type: 'dom_snapshot' | 'network_response' | 'attachment' | 'manual_text' | 'log';
  title: string;
  url?: string;
  content: string;
  mime_type?: string;
};

export type TenderCandidate = {
  title: string;
  url: string;
  published_at: string;
  deadline_at: string;
  buyer_name: string;
  raw_text: string;
  attachments: string[];
  browser_ref?: string;
  search_query?: string;
  notice_type?: string;
};

export type CandidateBundle = {
  source_name: string;
  candidates: TenderCandidate[];
};

export type SiteExtractionProfile = {
  sourceName: string;
  entryUrl?: string;
  defaultSearchTerms?: string;
  defaultActionSteps?: string;
  humanRequiredPattern?: RegExp;
  emptyPagePattern?: RegExp;
  noticeTitlePattern?: RegExp;
  excludePattern?: RegExp;
  candidateLinePattern?: RegExp;
  noisePattern?: RegExp;
  buyerName?: string;
  buyerMatch?: RegExp;
  maxCandidates?: number;
};

export type SiteHarnessProfile = SiteExtractionProfile;
