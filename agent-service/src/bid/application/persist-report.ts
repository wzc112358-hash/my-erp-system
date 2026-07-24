import type { BidNoticeInput, NormalizedBidNotice } from '../domain/notice.ts';
import { normalizeBidNotice } from '../domain/notice.ts';

export type StoredBidNotice = NormalizedBidNotice & {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
};

export type BidNoticeRepository = {
  findByFingerprints(fingerprints: string[]): Promise<StoredBidNotice[]>;
  createNotice(notice: NormalizedBidNotice, seenAt: string): Promise<StoredBidNotice>;
  touchNotice(id: string, seenAt: string): Promise<void>;
  updateNotice(id: string, notice: NormalizedBidNotice, seenAt: string): Promise<StoredBidNotice>;
};

export type PersistReportResult = {
  created: StoredBidNotice[];
  updated: StoredBidNotice[];
  duplicateCount: number;
  batchDuplicateCount: number;
};

export const persistCollectionNotices = async ({
  notices,
  repository,
  seenAt = new Date().toISOString(),
}: {
  notices: BidNoticeInput[];
  repository: BidNoticeRepository;
  seenAt?: string;
}): Promise<PersistReportResult> => {
  const normalized = notices.map(normalizeBidNotice);
  const uniqueByFingerprint = new Map<string, NormalizedBidNotice>();
  for (const notice of normalized) {
    if (!uniqueByFingerprint.has(notice.fingerprint)) uniqueByFingerprint.set(notice.fingerprint, notice);
  }
  const uniqueNotices = [...uniqueByFingerprint.values()];
  const existing = await repository.findByFingerprints(uniqueNotices.map((item) => item.fingerprint));
  const existingByFingerprint = new Map(existing.map((item) => [item.fingerprint, item]));
  const created: StoredBidNotice[] = [];
  const updated: StoredBidNotice[] = [];
  let duplicateCount = 0;

  for (const notice of uniqueNotices) {
    const prior = existingByFingerprint.get(notice.fingerprint);
    if (!prior) {
      const record = await repository.createNotice(notice, seenAt);
      created.push(record);
      existingByFingerprint.set(record.fingerprint, record);
      continue;
    }
    if (prior.contentHash === notice.contentHash) {
      await repository.touchNotice(prior.id, seenAt);
      duplicateCount += 1;
      continue;
    }
    updated.push(await repository.updateNotice(prior.id, notice, seenAt));
  }

  return {
    created,
    updated,
    duplicateCount,
    batchDuplicateCount: normalized.length - uniqueNotices.length,
  };
};

