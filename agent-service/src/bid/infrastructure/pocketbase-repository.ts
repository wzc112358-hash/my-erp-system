import type {
  BidNoticeRepository,
  StoredBidNotice,
} from '../application/persist-report.ts';
import type { NormalizedBidNotice } from '../domain/notice.ts';
import {
  asPocketBaseDate,
  PocketBaseClient,
  pocketBaseEqualsAny,
  type PocketBaseRecord,
} from './pocketbase-client.ts';

type SourceRecord = PocketBaseRecord & {
  source_key: string;
  source_name: string;
};

type NoticeRecord = PocketBaseRecord & Record<string, unknown>;

const jsonArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const noticeFromRecord = (record: NoticeRecord): StoredBidNotice => ({
  id: record.id,
  sourceKey: String(record.source_key || ''),
  sourceName: String(record.source_name || ''),
  externalId: String(record.external_id || ''),
  kind: record.kind === 'attention' ? 'attention' : 'current',
  title: String(record.title || ''),
  url: String(record.url || ''),
  canonicalUrl: String(record.canonical_url || ''),
  fingerprint: String(record.fingerprint || ''),
  contentHash: String(record.content_hash || ''),
  buyerName: String(record.buyer_name || ''),
  publishedAt: String(record.published_at || ''),
  deadlineAt: String(record.deadline_at || ''),
  matchedProducts: jsonArray(record.matched_products),
  judgment: String(record.judgment || ''),
  requirements: jsonArray(record.requirements),
  missingInfo: jsonArray(record.missing_info),
  evidence: String(record.evidence || ''),
  detailReadMethod: String(record.detail_read_method || ''),
  attachmentUrls: jsonArray(record.attachment_urls),
  firstSeenAt: String(record.first_seen_at || ''),
  lastSeenAt: String(record.last_seen_at || ''),
  lastChangedAt: String(record.last_changed_at || ''),
});

const arrayText = (items: string[] | undefined, maxLength = 4_800) => {
  const compact = (items || []).map((item) => String(item).slice(0, 1_000)).slice(0, 30);
  while (compact.length && JSON.stringify(compact).length > maxLength) compact.pop();
  return JSON.stringify(compact);
};

export class PocketBaseBidNoticeRepository implements BidNoticeRepository {
  private readonly client: PocketBaseClient;
  private sourceIdByKey = new Map<string, string>();

  constructor(client: PocketBaseClient) {
    this.client = client;
  }

  private async sourceId(sourceKey: string) {
    const cached = this.sourceIdByKey.get(sourceKey);
    if (cached) return cached;
    const sources = await this.client.listAll<SourceRecord>('bid_sources');
    this.sourceIdByKey = new Map(sources.map((source) => [source.source_key, source.id]));
    const id = this.sourceIdByKey.get(sourceKey);
    if (!id) throw new Error(`Bid source is not configured: ${sourceKey}`);
    return id;
  }

  async findByFingerprints(fingerprints: string[]): Promise<StoredBidNotice[]> {
    const unique = [...new Set(fingerprints.filter(Boolean))];
    const records: NoticeRecord[] = [];
    for (let index = 0; index < unique.length; index += 40) {
      const filter = pocketBaseEqualsAny('fingerprint', unique.slice(index, index + 40));
      records.push(...await this.client.listAll<NoticeRecord>('bid_notices', { filter }));
    }
    return records.map(noticeFromRecord);
  }

  private async payload(notice: NormalizedBidNotice) {
    return {
      source: await this.sourceId(notice.sourceKey),
      source_key: notice.sourceKey,
      source_name: notice.sourceName,
      fingerprint: notice.fingerprint,
      content_hash: notice.contentHash,
      external_id: notice.externalId || '',
      kind: notice.kind,
      title: notice.title.slice(0, 2_000),
      url: notice.url.slice(0, 4_000),
      canonical_url: notice.canonicalUrl.slice(0, 4_000),
      buyer_name: String(notice.buyerName || '').slice(0, 1_000),
      published_at: asPocketBaseDate(notice.publishedAt),
      deadline_at: asPocketBaseDate(notice.deadlineAt),
      matched_products: arrayText(notice.matchedProducts),
      judgment: String(notice.judgment || '').slice(0, 4_800),
      requirements: arrayText(notice.requirements),
      missing_info: arrayText(notice.missingInfo),
      evidence: String(notice.evidence || '').slice(0, 4_800),
      detail_read_method: String(notice.detailReadMethod || '').slice(0, 500),
      attachment_urls: arrayText(notice.attachmentUrls),
    };
  }

  async createNotice(notice: NormalizedBidNotice, seenAt: string): Promise<StoredBidNotice> {
    const record = await this.client.create<NoticeRecord>('bid_notices', {
      ...await this.payload(notice),
      first_seen_at: asPocketBaseDate(seenAt),
      last_seen_at: asPocketBaseDate(seenAt),
      last_changed_at: asPocketBaseDate(seenAt),
    });
    return noticeFromRecord(record);
  }

  async touchNotice(id: string, seenAt: string): Promise<void> {
    await this.client.update<NoticeRecord>('bid_notices', id, {
      last_seen_at: asPocketBaseDate(seenAt),
    });
  }

  async updateNotice(id: string, notice: NormalizedBidNotice, seenAt: string): Promise<StoredBidNotice> {
    const record = await this.client.update<NoticeRecord>('bid_notices', id, {
      ...await this.payload(notice),
      last_seen_at: asPocketBaseDate(seenAt),
      last_changed_at: asPocketBaseDate(seenAt),
    });
    return noticeFromRecord(record);
  }
}
