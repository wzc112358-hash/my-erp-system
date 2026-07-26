import type {
  BidPreparationData,
  ErpRegion,
  ExistingBidRecord,
  HistoricalBidRecord,
  PreparationNotice,
} from '../application/bid-preparation.ts';
import { normalizeBusinessAssessment } from '../domain/notice.ts';
import type { BidBusinessAssessment } from '../domain/tender-screening.ts';
import { PocketBaseClient, type PocketBaseRecord } from './pocketbase-client.ts';

type RecordData = PocketBaseRecord & Record<string, unknown>;

const parseArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const parseAssessment = (value: unknown) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || 'null') : value;
    return normalizeBusinessAssessment(parsed as BidBusinessAssessment | undefined);
  } catch {
    return undefined;
  }
};

const positiveNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const historicalRecord = (region: ErpRegion, record: RecordData): HistoricalBidRecord => ({
  region,
  id: record.id,
  biddingCompany: String(record.bidding_company || ''),
  biddingNo: String(record.bidding_no || ''),
  productName: String(record.product_name || ''),
  quantity: positiveNumber(record.quantity),
  quantityUnit: String(record.quantity_unit || ''),
  specification: String(record.specification || ''),
  purity: String(record.purity || ''),
  packaging: String(record.packaging || ''),
  quotedUnitPrice: positiveNumber(record.quoted_unit_price),
  quotedTotalAmount: positiveNumber(record.quoted_total_amount),
  currency: String(record.currency || ''),
  tenderFee: positiveNumber(record.tender_fee),
  bidBond: positiveNumber(record.bid_bond),
  winningUnitPrice: positiveNumber(record.winning_unit_price),
  winningTotalAmount: positiveNumber(record.winning_total_amount),
  winningSupplier: String(record.winning_supplier || ''),
  brand: String(record.brand || ''),
  bidResult: record.bid_result === 'won' || record.bid_result === 'lost' ? record.bid_result : 'pending',
  openDate: String(record.open_date || ''),
  lossReason: String(record.loss_reason || ''),
  qualificationSnapshot: parseArray(record.qualification_snapshot),
});

export const createBidPreparationData = ({
  noticeClient,
  regionClients,
  cacheTtlMs = 60_000,
}: {
  noticeClient: PocketBaseClient;
  regionClients: Record<ErpRegion, PocketBaseClient>;
  cacheTtlMs?: number;
}): BidPreparationData => {
  let historyCache: { expiresAt: number; records: HistoricalBidRecord[] } | undefined;

  return {
    async getNotice(id): Promise<PreparationNotice | null> {
      try {
        const record = await noticeClient.authenticatedRequest<RecordData>(
          `/api/collections/bid_notices/records/${encodeURIComponent(id)}`,
        );
        return {
          id: record.id,
          fingerprint: String(record.fingerprint || ''),
          sourceKey: String(record.source_key || ''),
          sourceName: String(record.source_name || ''),
          kind: record.kind === 'attention' ? 'attention' : 'current',
          title: String(record.title || ''),
          url: String(record.url || ''),
          buyerName: String(record.buyer_name || ''),
          deadlineAt: String(record.deadline_at || ''),
          matchedProducts: parseArray(record.matched_products),
          evidence: String(record.evidence || ''),
          assessment: parseAssessment(record.assessment),
        };
      } catch (error) {
        if (String(error).includes('404')) return null;
        throw error;
      }
    },

    async listHistoricalBids() {
      if (historyCache && historyCache.expiresAt > Date.now()) return historyCache.records;
      const entries = await Promise.all((['beijing', 'lanzhou'] as const).map(async (region) => {
        const records = await regionClients[region].listAll<RecordData>('bidding_records', { sort: '-open_date' });
        return records.map((record) => historicalRecord(region, record));
      }));
      const records = entries.flat();
      historyCache = { expiresAt: Date.now() + cacheTtlMs, records };
      return records;
    },

    async findExisting(region, sourceFingerprint): Promise<ExistingBidRecord | undefined> {
      if (!sourceFingerprint) return undefined;
      const records = await regionClients[region].listAll<RecordData>('bidding_records', {
        filter: `source_notice_fingerprint = "${sourceFingerprint.replaceAll('"', '')}"`,
        perPage: 1,
      });
      const record = records[0];
      return record ? {
        id: record.id,
        biddingNo: String(record.bidding_no || ''),
        productName: String(record.product_name || ''),
      } : undefined;
    },
  };
};
