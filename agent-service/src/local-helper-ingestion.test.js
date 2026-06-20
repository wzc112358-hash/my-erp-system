import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRawCandidatesFromCandidateBundle,
  ingestCandidateBundleArtifact,
} from './local-helper-ingestion.js';

test('buildRawCandidatesFromCandidateBundle maps local helper candidate bundle into agent raw candidates', () => {
  const raw = buildRawCandidatesFromCandidateBundle({
    bundle: {
      source_name: '华锦兵器网',
      candidates: [{
        title: '华锦化工消泡剂采购询价公告',
        url: 'https://example.com/notices/1',
        published_at: '2026-06-01',
        deadline_at: '2026-06-10',
        buyer_name: '北方华锦化学工业集团有限公司',
        raw_text: '采购消泡剂，截止 2026-06-10。',
        attachments: ['https://example.com/a.pdf'],
      }],
    },
    task: {
      source: 'source-huajin',
      source_name: '华锦兵器网',
      owner_name: '小魏',
    },
  });

  assert.deepEqual(raw, [{
    sourceId: 'source-huajin',
    sourceName: '华锦兵器网',
    ownerName: '小魏',
    title: '华锦化工消泡剂采购询价公告',
    url: 'https://example.com/notices/1',
    publishDate: '2026-06-01',
    deadlineDate: '2026-06-10',
    buyerName: '北方华锦化学工业集团有限公司',
    content: '采购消泡剂，截止 2026-06-10。',
    attachmentUrls: ['https://example.com/a.pdf'],
    sourceKeywords: '',
  }]);
});

test('ingestCandidateBundleArtifact upserts related opportunities and marks the agent task completed', async () => {
  const collections = [];
  const updates = [];
  let receivedClassifierEnhancer = null;
  const result = await ingestCandidateBundleArtifact({
    token: 'pb-token',
    task: {
      id: 'task-huajin',
      source: 'source-huajin',
      monitor_run: 'run-huajin',
      source_name: '华锦兵器网',
      owner_name: '小魏',
      result_summary: '',
    },
    run: {
      id: 'local-run-1',
    },
    candidateBundle: {
      source_name: '华锦兵器网',
      candidates: [{
        title: '华锦化工消泡剂采购询价公告',
        url: 'https://example.com/notices/1',
        published_at: '2026-06-01',
        deadline_at: '2026-06-10',
        buyer_name: '北方华锦化学工业集团有限公司',
        raw_text: '采购消泡剂，截止 2026-06-10。',
        attachments: [],
      }],
    },
    listRecordsFn: async (collection) => {
      collections.push(collection);
      return [];
    },
    createRecordFn: async (collection, token, data) => {
      collections.push(collection);
      assert.equal(token, 'pb-token');
      return { id: `${collection}-1`, ...data };
    },
    updateRecordFn: async (collection, id, token, data) => {
      updates.push({ collection, id, token, data });
      return { id, ...data };
    },
    processor: async (rawCandidates, options = {}) => {
      receivedClassifierEnhancer = options.classifierEnhancer;
      return rawCandidates.map((candidate) => ({
      sourceName: candidate.sourceName,
      ownerName: candidate.ownerName,
      title: candidate.title,
      url: candidate.url,
      fingerprint: 'fp-huajin-1',
      publishDate: candidate.publishDate,
      deadlineDate: candidate.deadlineDate,
      buyerName: candidate.buyerName,
      productKeywords: ['消泡剂'],
      sourceKeywords: '',
      attachmentUrls: [],
      rawText: candidate.content,
      classification: {
        relevance: 'likely_related',
        relevanceScore: 0.88,
        matchedTerms: ['消泡剂'],
        matchedSources: ['local_helper'],
        evidenceText: candidate.content,
        negativeTerms: [],
        classificationVersion: 'test-classifier-v1',
        needsHumanCheck: false,
        productKeywords: ['消泡剂'],
        summary: '疑似产品：消泡剂',
        hardRequirements: [],
        riskFlags: [],
      },
      }));
    },
  });

  assert.equal(result.rawCount, 1);
  assert.equal(result.processedCount, 1);
  assert.equal(result.createdCount, 1);
  assert.equal(typeof receivedClassifierEnhancer, 'function');
  assert.equal(collections.includes('bid_opportunities'), true);
  assert.deepEqual(updates, [{
    collection: 'agent_tasks',
    id: 'task-huajin',
    token: 'pb-token',
    data: {
      status: 'completed',
      result_summary: '本地助手回灌完成：候选 1 条，入库 1 条。',
      uploaded_artifacts: 'local-run-1',
    },
  }]);
});

test('ingestCandidateBundleArtifact keeps the agent task open when no opportunity can be persisted', async () => {
  const updates = [];
  const result = await ingestCandidateBundleArtifact({
    token: 'pb-token',
    task: {
      id: 'task-huajin',
      source: 'source-huajin',
      monitor_run: 'run-huajin',
      source_name: '华锦兵器网',
      owner_name: '小魏',
      result_summary: '',
    },
    run: {
      id: 'local-run-1',
    },
    candidateBundle: {
      source_name: '华锦兵器网',
      candidates: [{
        title: '2026年端午节假期公告',
        url: 'https://www.norincogroup-ebuy.com/',
        raw_text: '2026年端午节假期公告',
        attachments: [],
      }],
    },
    listRecordsFn: async () => [],
    createRecordFn: async () => {
      throw new Error('should not create an opportunity');
    },
    updateRecordFn: async (collection, id, token, data) => {
      updates.push({ collection, id, token, data });
      return { id, ...data };
    },
    processor: async (rawCandidates) => rawCandidates.map((candidate) => ({
      sourceName: candidate.sourceName,
      ownerName: candidate.ownerName,
      title: candidate.title,
      url: candidate.url,
      fingerprint: 'fp-platform-notice',
      publishDate: candidate.publishDate,
      deadlineDate: candidate.deadlineDate,
      buyerName: candidate.buyerName,
      productKeywords: [],
      sourceKeywords: '',
      attachmentUrls: [],
      rawText: candidate.content,
      classification: {
        relevance: 'irrelevant',
        relevanceScore: 0.2,
        matchedTerms: [],
        matchedSources: [],
        evidenceText: candidate.content,
        negativeTerms: [],
        classificationVersion: 'test-classifier-v1',
        needsHumanCheck: false,
        productKeywords: [],
        summary: '平台公告，不是商机',
        hardRequirements: [],
        riskFlags: [],
      },
    })),
  });

  assert.equal(result.status, 'request_human');
  assert.equal(result.processedCount, 1);
  assert.equal(result.persistableCount, 0);
  assert.equal(result.createdCount, 0);
  assert.deepEqual(updates, [{
    collection: 'agent_tasks',
    id: 'task-huajin',
    token: 'pb-token',
    data: {
      status: 'request_human',
      result_summary: '本地助手已采集候选 1 条，但没有生成可入库商机。请在本地浏览器进入具体公告列表或按搜索词筛选后再次点击继续采集。',
      uploaded_artifacts: 'local-run-1',
    },
  }]);
});

test('ingestCandidateBundleArtifact falls back when PocketBase has not migrated request_human status yet', async () => {
  const updates = [];
  const result = await ingestCandidateBundleArtifact({
    token: 'pb-token',
    task: {
      id: 'task-huajin',
      source: 'source-huajin',
      monitor_run: 'run-huajin',
      source_name: '华锦兵器网',
      owner_name: '小魏',
    },
    run: { id: 'local-run-1' },
    candidateBundle: {
      source_name: '华锦兵器网',
      candidates: [{ title: '2026年端午节假期公告' }],
    },
    listRecordsFn: async () => [],
    createRecordFn: async () => {
      throw new Error('should not create an opportunity');
    },
    updateRecordFn: async (collection, id, token, data) => {
      updates.push({ collection, id, token, data });
      if (data.status === 'request_human') {
        throw new Error('400 Bad Request: {"data":{"status":{"code":"validation_invalid_value","message":"Invalid value request_human."}}}');
      }
      return { id, ...data };
    },
    processor: async (rawCandidates) => rawCandidates.map((candidate) => ({
      sourceName: candidate.sourceName,
      ownerName: candidate.ownerName,
      title: candidate.title,
      url: candidate.url,
      fingerprint: 'fp-platform-notice',
      productKeywords: [],
      sourceKeywords: '',
      attachmentUrls: [],
      rawText: candidate.content,
      classification: {
        relevance: 'irrelevant',
        relevanceScore: 0.2,
        matchedTerms: [],
        matchedSources: [],
        evidenceText: candidate.content,
        negativeTerms: [],
        classificationVersion: 'test-classifier-v1',
        needsHumanCheck: false,
        productKeywords: [],
        summary: '平台公告，不是商机',
        hardRequirements: [],
        riskFlags: [],
      },
    })),
  });

  assert.equal(result.status, 'request_human');
  assert.deepEqual(updates.map((item) => item.data.status), ['request_human', 'in_progress']);
  assert.match(updates[1].data.result_summary, /状态枚举未升级/);
});

test('ingestCandidateBundleArtifact marks the agent task failed when ingestion throws', async () => {
  const updates = [];

  await assert.rejects(
    ingestCandidateBundleArtifact({
      token: 'pb-token',
      task: {
        id: 'task-huajin',
        source: 'source-huajin',
        monitor_run: 'run-huajin',
        source_name: '华锦兵器网',
        owner_name: '小魏',
      },
      run: { id: 'local-run-1' },
      candidateBundle: {
        source_name: '华锦兵器网',
        candidates: [{ title: '华锦化工消泡剂采购询价公告' }],
      },
      listRecordsFn: async () => {
        throw new Error('PocketBase unavailable');
      },
      createRecordFn: async () => {
        throw new Error('should not create');
      },
      updateRecordFn: async (collection, id, token, data) => {
        updates.push({ collection, id, token, data });
        return { id, ...data };
      },
    }),
    /PocketBase unavailable/,
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].collection, 'agent_tasks');
  assert.equal(updates[0].id, 'task-huajin');
  assert.equal(updates[0].data.status, 'failed');
  assert.match(updates[0].data.result_summary, /PocketBase unavailable/);
});
