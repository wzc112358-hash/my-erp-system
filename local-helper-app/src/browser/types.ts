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

export type BrowserObservation = {
  title: string;
  url: string;
  visibleText: string;
  screenshotPath?: string;
  domSnapshot?: string;
  links?: BrowserLink[];
  networkResponses?: BrowserNetworkResponse[];
  downloadedFiles?: string[];
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

export type LocalHelperTask = CollectionTask;

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
