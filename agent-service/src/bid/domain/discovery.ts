export type DiscoveryExclusionReason =
  | 'expired'
  | 'unpublished'
  | 'non_actionable'
  | 'stale'
  | 'result'
  | 'duplicate'
  | 'candidate_limit';

export type DiscoveryExcludedNotice = {
  title: string;
  url: string;
  publishedAt: string;
  deadlineAt: string;
  reason: DiscoveryExclusionReason;
};

export type CollectionDiscoveryStats = {
  provider: string;
  requestCount: number;
  successfulRequestCount: number;
  rawCount: number;
  eligibleCount: number;
  expiredCount: number;
  nonActionableCount: number;
  duplicateCount: number;
  truncatedCount: number;
  llmIgnoredCount: number;
  endedCount?: number;
  staleCount?: number;
  resultCount?: number;
  policyIgnoredCount?: number;
  warnings: string[];
  excludedNotices: DiscoveryExcludedNotice[];
};

export const MAX_DISCOVERY_EXCLUDED_NOTICES = 50;
