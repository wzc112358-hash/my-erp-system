import assert from 'node:assert/strict';
import test from 'node:test';

import { PocketBaseBidRunRepository } from './run-repository.ts';

test('run diagnostics remain valid JSON within the PocketBase text limit', async () => {
  let runPayload: Record<string, unknown> | undefined;
  const client = {
    listAll: async (collection: string) => collection === 'bid_collection_runs' ? [] : [],
    create: async (_collection: string, payload: Record<string, unknown>) => {
      runPayload = payload;
      return { id: 'run-1', ...payload };
    },
    update: async (_collection: string, _id: string, payload: Record<string, unknown>) => ({ id: 'record-1', ...payload }),
  };
  const repository = new PocketBaseBidRunRepository(client as never);
  await repository.upsertRun({
    source: {
      id: 'source-1',
      source_key: 'test',
      source_name: '测试站点',
      enabled: true,
      schedule_time: '08:00',
    },
    runDate: '2026-07-24',
    startedAt: '2026-07-24T00:00:00.000Z',
    finishedAt: '2026-07-24T00:01:00.000Z',
    status: 'success',
    counts: { newCount: 0, updatedCount: 0, duplicateCount: 0 },
    report: {
      sourceKey: 'test',
      sourceName: '测试站点',
      generatedAt: '2026-07-24T00:01:00.000Z',
      rawCount: 100,
      eligibleCount: 0,
      currentItems: [],
      attentionItems: [],
      llmIgnoredCount: 0,
      summary: '测试',
      discoveryStats: {
        provider: 'test',
        requestCount: 1,
        successfulRequestCount: 1,
        rawCount: 100,
        eligibleCount: 0,
        expiredCount: 100,
        nonActionableCount: 0,
        duplicateCount: 0,
        truncatedCount: 0,
        llmIgnoredCount: 0,
        warnings: [],
        excludedNotices: Array.from({ length: 50 }, (_, index) => ({
          title: `很长的被排除公告标题-${index}-${'化工产品'.repeat(40)}`,
          url: `https://example.com/${index}`,
          publishedAt: '2026-07-01',
          deadlineAt: '2026-07-02',
          reason: 'expired' as const,
        })),
      },
    },
  });

  const diagnostics = String(runPayload?.discovery_stats || '');
  assert.ok(diagnostics.length <= 4_800);
  assert.doesNotThrow(() => JSON.parse(diagnostics));
  assert.equal(JSON.parse(diagnostics).diagnosticsTruncated, true);
});

test('manager keyword changes are persisted on the selected source with audit data', async () => {
  let updated: Record<string, unknown> | undefined;
  const client = {
    listAll: async (collection: string) => collection === 'bid_sources'
      ? [{ id: 'source-1', source_key: 'ymz', source_name: '云梦泽智慧平台' }]
      : [],
    update: async (_collection: string, _id: string, payload: Record<string, unknown>) => {
      updated = payload;
      return { id: 'source-1', ...payload };
    },
  };
  const repository = new PocketBaseBidRunRepository(client as never);
  await repository.updateSearchScope({
    sourceKey: 'ymz',
    serializedScope: '{"productTerms":["阻聚剂"]}',
    updatedBy: '张管理员',
    updatedAt: '2026-08-06T03:00:00.000Z',
  });

  assert.equal(updated?.search_scope, '{"productTerms":["阻聚剂"]}');
  assert.equal(updated?.search_scope_updated_by, '张管理员');
  assert.equal(updated?.search_scope_updated_at, '2026-08-06T03:00:00.000Z');
});
