import type { BidCollectionReport } from '../application/collection-report.ts';
import { asPocketBaseDate, PocketBaseClient, type PocketBaseRecord } from './pocketbase-client.ts';

type SourceRecord = PocketBaseRecord & {
  source_key: string;
  source_name: string;
  enabled: boolean;
  schedule_time: string;
  last_run_at?: string;
  last_status?: string;
};

type RunRecord = PocketBaseRecord & Record<string, unknown>;

export type RunPersistenceCounts = {
  newCount: number;
  updatedCount: number;
  duplicateCount: number;
};

const limitedJson = (value: unknown, maxLength = 4_800) => {
  const text = JSON.stringify(value);
  if (text.length <= maxLength) return text;

  // PocketBase text fields are capped at 5,000 characters. Discovery details
  // can exceed that limit when a feed reports many excluded notices, so retain
  // the aggregate counters and as many diagnostics as will safely fit. Always
  // return valid JSON instead of cutting the serialized value mid-string.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const compact = {
      ...value,
      warnings: Array.isArray((value as { warnings?: unknown[] }).warnings)
        ? (value as { warnings: unknown[] }).warnings.map((item) => String(item).slice(0, 240)).slice(0, 8)
        : [],
      excludedNotices: Array.isArray((value as { excludedNotices?: unknown[] }).excludedNotices)
        ? [...(value as { excludedNotices: unknown[] }).excludedNotices]
        : [],
      diagnosticsTruncated: true,
    };
    while (compact.excludedNotices.length && JSON.stringify(compact).length > maxLength) {
      compact.excludedNotices.pop();
    }
    const compactText = JSON.stringify(compact);
    if (compactText.length <= maxLength) return compactText;
  }
  return JSON.stringify({ diagnosticsTruncated: true });
};

export class PocketBaseBidRunRepository {
  private readonly client: PocketBaseClient;

  constructor(client: PocketBaseClient) {
    this.client = client;
  }

  async listSources() {
    return this.client.listAll<SourceRecord>('bid_sources', { sort: 'source_name' });
  }

  async upsertRun({
    source,
    runDate,
    startedAt,
    finishedAt,
    status,
    report,
    counts,
    errorMessage = '',
  }: {
    source: SourceRecord;
    runDate: string;
    startedAt: string;
    finishedAt: string;
    status: 'success' | 'no_new' | 'partial' | 'failed';
    report?: BidCollectionReport;
    counts: RunPersistenceCounts;
    errorMessage?: string;
  }) {
    const runKey = `${source.source_key}:${runDate}`;
    const existing = await this.client.listAll<RunRecord>('bid_collection_runs', {
      filter: `run_key = "${runKey}"`,
    });
    const discovery = report?.discoveryStats;
    const payload = {
      run_key: runKey,
      source: source.id,
      source_key: source.source_key,
      source_name: source.source_name,
      run_date: asPocketBaseDate(runDate),
      started_at: asPocketBaseDate(startedAt),
      finished_at: asPocketBaseDate(finishedAt),
      status,
      raw_count: report?.rawCount || 0,
      eligible_count: report?.eligibleCount || 0,
      current_count: report?.currentItems.length || 0,
      attention_count: report?.attentionItems.length || 0,
      new_count: counts.newCount,
      updated_count: counts.updatedCount,
      duplicate_count: counts.duplicateCount,
      excluded_count: discovery
        ? Math.max(0, discovery.rawCount - discovery.eligibleCount)
        : 0,
      summary: String(report?.summary || errorMessage).slice(0, 4_800),
      discovery_stats: limitedJson(discovery || {}),
      error_message: String(errorMessage).slice(0, 4_800),
    };
    const record = existing[0]
      ? await this.client.update<RunRecord>('bid_collection_runs', existing[0].id, payload)
      : await this.client.create<RunRecord>('bid_collection_runs', payload);
    await this.client.update<SourceRecord>('bid_sources', source.id, {
      last_run_at: asPocketBaseDate(finishedAt),
      last_status: status === 'no_new' ? 'success' : status,
      last_error: String(errorMessage).slice(0, 4_000),
    });
    return record;
  }

  async markRunning(source: SourceRecord, startedAt: string) {
    await this.client.update<SourceRecord>('bid_sources', source.id, {
      last_status: 'running',
      last_error: '',
      last_run_at: asPocketBaseDate(startedAt),
    });
  }

  async cleanupBefore(cutoff: string) {
    const filter = `last_seen_at < "${asPocketBaseDate(cutoff)}"`;
    const notices = await this.client.listAll<PocketBaseRecord>('bid_notices', { filter });
    for (const notice of notices) await this.client.delete('bid_notices', notice.id);
    const runs = await this.client.listAll<PocketBaseRecord>('bid_collection_runs', {
      filter: `run_date < "${asPocketBaseDate(cutoff)}"`,
    });
    for (const run of runs) await this.client.delete('bid_collection_runs', run.id);
    return { deletedNotices: notices.length, deletedRuns: runs.length };
  }
}
