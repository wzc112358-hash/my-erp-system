export type PublicCollectionTask = {
  id: string;
  sourceName: string;
  entryUrl: string;
  searchTerms?: string;
};

export type CollectionArtifact = {
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
  search_query?: string;
  notice_type?: string;
  opportunity_status?: 'active' | 'ended' | 'unknown';
};

export type CandidateBundle = {
  source_name: string;
  candidates: TenderCandidate[];
};

export type PublicSiteDefinition = {
  sourceKey: string;
  sourceName: string;
  entryUrl: string;
  deepSearchTerms: string[];
  defaultSearchTerms: string;
  llmExtractionHint: string;
  maxCandidates: number;
  browserJourney?: {
    recentDays: number;
    maxDetails: number;
  };
};
