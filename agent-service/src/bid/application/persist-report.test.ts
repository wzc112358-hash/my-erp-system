import assert from 'node:assert/strict';
import test from 'node:test';

import type { NormalizedBidNotice } from '../domain/notice.ts';
import { canonicalizeNoticeUrl, normalizeBidNotice } from '../domain/notice.ts';
import type { BidNoticeRepository, StoredBidNotice } from './persist-report.ts';
import { persistCollectionNotices } from './persist-report.ts';

const input = (overrides = {}) => ({
  sourceKey: 'guoneng-ebid',
  sourceName: '国能E招',
  kind: 'current' as const,
  title: '化工公司阻聚剂采购招标公告',
  url: 'https://example.com/notices/detail.html?id=notice-001&utm_source=test',
  buyerName: '化工公司',
  publishedAt: '2026-07-24',
  deadlineAt: '2026-08-01',
  matchedProducts: ['阻聚剂'],
  judgment: '当前仍可参与',
  requirements: ['确认代理商要求'],
  missingInfo: ['规格待确认'],
  evidence: '采购阻聚剂。',
  ...overrides,
});

const memoryRepository = (): BidNoticeRepository & { records: Map<string, StoredBidNotice> } => {
  const records = new Map<string, StoredBidNotice>();
  let sequence = 0;
  return {
    records,
    async findByFingerprints(fingerprints) {
      return [...records.values()].filter((item) => fingerprints.includes(item.fingerprint));
    },
    async createNotice(notice, seenAt) {
      const stored = { ...notice, id: `notice-${++sequence}`, firstSeenAt: seenAt, lastSeenAt: seenAt, lastChangedAt: seenAt };
      records.set(stored.id, stored);
      return stored;
    },
    async touchNotice(id, seenAt) {
      const stored = records.get(id);
      if (stored) records.set(id, { ...stored, lastSeenAt: seenAt });
    },
    async updateNotice(id, notice, seenAt) {
      const prior = records.get(id)!;
      const stored = { ...notice, id, firstSeenAt: prior.firstSeenAt, lastSeenAt: seenAt, lastChangedAt: seenAt };
      records.set(id, stored);
      return stored;
    },
  };
};

test('canonical URL drops volatile search parameters but retains notice identity', () => {
  assert.equal(
    canonicalizeNoticeUrl('https://EXAMPLE.com/a//detail/?id=42&utm_source=x&timestamp=1'),
    'https://example.com/a/detail?id=42',
  );
});

test('notice fingerprint stays stable when only volatile URL parameters change', () => {
  const left = normalizeBidNotice(input());
  const right = normalizeBidNotice(input({ url: 'https://example.com/notices/detail.html?timestamp=2&id=notice-001' }));
  assert.equal(left.fingerprint, right.fingerprint);
  assert.equal(left.contentHash, right.contentHash);
});

test('repeated collection touches one record without creating a duplicate', async () => {
  const repository = memoryRepository();
  const first = await persistCollectionNotices({ notices: [input()], repository, seenAt: '2026-07-24T00:00:00.000Z' });
  const second = await persistCollectionNotices({ notices: [input()], repository, seenAt: '2026-07-25T00:00:00.000Z' });

  assert.equal(first.created.length, 1);
  assert.equal(second.created.length, 0);
  assert.equal(second.duplicateCount, 1);
  assert.equal(repository.records.size, 1);
  assert.equal([...repository.records.values()][0].lastSeenAt, '2026-07-25T00:00:00.000Z');
});

test('changed deadline updates the existing notice instead of inserting another row', async () => {
  const repository = memoryRepository();
  await persistCollectionNotices({ notices: [input()], repository, seenAt: '2026-07-24T00:00:00.000Z' });
  const result = await persistCollectionNotices({
    notices: [input({ deadlineAt: '2026-08-03' })],
    repository,
    seenAt: '2026-07-25T00:00:00.000Z',
  });

  assert.equal(result.created.length, 0);
  assert.equal(result.updated.length, 1);
  assert.equal(repository.records.size, 1);
  assert.equal([...repository.records.values()][0].deadlineAt, '2026-08-03');
});

test('duplicates inside one fetched batch are collapsed before repository writes', async () => {
  const repository = memoryRepository();
  const result = await persistCollectionNotices({ notices: [input(), input()], repository });
  assert.equal(result.created.length, 1);
  assert.equal(result.batchDuplicateCount, 1);
  assert.equal(repository.records.size, 1);
});

test('normalization rejects an unsupported claim that the company lacks a qualification', () => {
  const notice = normalizeBidNotice(input({
    assessment: {
      decision: 'likely_cannot_do',
      decisionSummary: '公司没有所需业绩，无法参与。',
      productSummary: '阻聚剂',
      quantity: '数量未指明',
      specifications: [],
      deliveryTerms: [],
      commercialTerms: [],
      qualificationChecks: [{
        requirement: '同类供货业绩',
        status: 'not_met',
        basis: '我司无此业绩记录',
      }],
      historicalReferences: [],
      nextActions: ['核实同类合同'],
    },
  }));

  assert.equal(notice.assessment?.decision, 'needs_manual_check');
  assert.equal(notice.assessment?.qualificationChecks[0].status, 'unconfirmed');
  assert.equal(notice.assessment?.quantity, '');
  assert.equal(notice.judgment, notice.assessment?.decisionSummary);
});
