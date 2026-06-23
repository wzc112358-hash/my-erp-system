import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectCandidates,
  runConfirmationPackageDryRun,
  runDocumentTextDryRun,
  runDryRunJson,
  runOnce,
  runPublicUrlDryRun,
  shouldPersistOpportunity,
  shouldRunSource,
  startScheduler,
} from './index.js';
import { buildOpportunityPayload } from './index.js';
import { isCloudManagedSource, resolveSourceStrategy } from './source-strategies.js';

test('shouldRunSource only schedules active 国能源 records inside a configured window', () => {
  assert.equal(shouldRunSource({
    source_name: '国能网',
    status: 'active',
    schedule_times: '09:00,12:00',
  }, new Date('2026-05-23T09:05:00+08:00')), true);

  assert.equal(shouldRunSource({
    source_name: '华锦兵器网',
    status: 'active',
    schedule_times: '09:00,12:00',
  }, new Date('2026-05-23T09:05:00+08:00')), false);
});

test('shouldRunSource skips repeated runs inside the same schedule window', () => {
  const source = {
    source_name: '国能网',
    status: 'active',
    schedule_times: '09:00,12:00',
    last_run_at: '2026-05-23 01:02:00.000Z',
  };

  assert.equal(shouldRunSource(source, new Date('2026-05-23T09:05:00+08:00')), false);
});

test('resolveSourceStrategy keeps only 国能 as cloud-managed source', () => {
  const strategy = resolveSourceStrategy({
    source_name: '国能网',
    status: 'active',
  });

  assert.equal(isCloudManagedSource({ source_name: '国能网' }), true);
  assert.equal(isCloudManagedSource({ source_name: '中石油招投标网' }), false);
  assert.equal(strategy.crawlStrategy, 'http_html');
  assert.equal(strategy.collectionPath, 'cloud_auto');
  assert.ok(strategy.categoryNames.includes('国能E招-招标公告'));
  assert.ok(strategy.categoryUrls.some((url) => url.endsWith('/inquireOne/index.json')));
  assert.equal(strategy.requiresManualAssist, false);
});

test('buildOpportunityPayload includes relevance evidence fields', () => {
  const source = {
    id: 'source1',
    source_name: '国能网',
    owner_name: '小杨',
  };
  const run = { id: 'run1' };
  const item = {
    sourceName: '国能网',
    ownerName: '小杨',
    title: '炼油四部用塑料用抗静电剂框架采购询比采购公告',
    url: 'https://example.com/notice/1',
    fingerprint: 'fp1',
    publishDate: '',
    deadlineDate: '2026-06-02',
    buyerName: '示例采购单位',
    attachmentUrls: [],
    rawText: '允许代理商投标，需第三方检测报告。',
    classification: {
      relevance: 'likely_related',
      relevanceScore: 0.78,
      matchedTerms: ['抗静电剂'],
      matchedSources: ['chat_history'],
      evidenceText: '炼油四部用塑料用抗静电剂框架采购询比采购公告',
      negativeTerms: [],
      classificationVersion: 'chemical-relevance-v1',
      needsHumanCheck: false,
      productKeywords: ['抗静电剂'],
      summary: '疑似产品：抗静电剂',
      hardRequirements: ['允许代理商投标', '第三方检测'],
      riskFlags: ['需第三方检测'],
    },
  };

  const payload = buildOpportunityPayload(source, run, item);

  assert.equal(payload.relevance, 'likely_related');
  assert.equal(payload.classification_version, 'chemical-relevance-v1');
  assert.equal(payload.matched_terms, '抗静电剂');
  assert.equal(payload.matched_sources, 'chat_history');
  assert.equal(payload.evidence_text, '炼油四部用塑料用抗静电剂框架采购询比采购公告');
  assert.equal(payload.needs_human_check, false);
});

test('shouldPersistOpportunity only keeps related or manual-review opportunities for ERP', () => {
  assert.equal(shouldPersistOpportunity({ classification: { relevance: 'likely_related' } }), true);
  assert.equal(shouldPersistOpportunity({ classification: { relevance: 'needs_manual_review' } }), true);
  assert.equal(shouldPersistOpportunity({ classification: { relevance: 'irrelevant' } }), false);
});

test('runPublicUrlDryRun fetches a public page without PocketBase', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '<a href="/n.html">白油采购询价公告 截止时间：2099年01月02日10时00分</a>',
  });
  try {
    const result = await runPublicUrlDryRun({
      url: 'https://example.com/list.html',
      sourceName: '测试公开源',
      ownerName: '小杨',
    });

    assert.equal(result.candidate_count, 1);
    assert.equal(result.retained_count, 1);
    assert.equal(result.opportunities[0].product_keywords, '白油');
    assert.equal(result.opportunities[0].matched_sources, 'erp_history');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runPublicUrlDryRun can use an injected classifier enhancer', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '<a href="/n.html">第一批物资询价采购公告</a>',
  });
  try {
    const result = await runPublicUrlDryRun({
      url: 'https://example.com/list.html',
      sourceName: '测试公开源',
      ownerName: '小杨',
      classifierEnhancer: async (candidate, ruleClassification) => ({
        ...ruleClassification,
        relevance: 'likely_related',
        relevanceScore: 0.86,
        confidence: 0.82,
        productKeywords: ['氨水'],
        matchedTerms: ['氨水'],
        matchedSources: [...ruleClassification.matchedSources, 'llm'],
        summary: 'LLM 判断标题泛但详情疑似化工药剂。',
        classificationVersion: `${ruleClassification.classificationVersion}+llm`,
      }),
    });

    assert.equal(result.retained_count, 1);
    assert.equal(result.opportunities[0].relevance, 'likely_related');
    assert.equal(result.opportunities[0].classification_version, 'chemical-relevance-v1+llm');
    assert.match(result.opportunities[0].matched_sources, /llm/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('collectCandidates uses collector-service for 国能 and ignores non-cloud sources', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        candidates: [
          {
            title: '活性氧化铝采购公告',
            url: 'https://example.com/alumina.html',
            source_name: '国能网',
            owner_name: '小杨',
            raw_text: '活性氧化铝采购公告',
          },
        ],
      }),
    };
  };
  try {
    const candidates = await collectCandidates({
      id: 'source-gn',
      source_name: '国能网',
      owner_name: '小杨',
      source_url: 'https://example.com/list.html',
      status: 'active',
      login_type: 'none',
      requires_login: false,
      may_have_captcha: false,
    }, {
      collectorServiceUrl: 'http://collector-service:8096',
    });

    assert.equal(requests[0].url, 'http://collector-service:8096/collect/source');
    assert.match(JSON.parse(requests[0].options.body).source.category_urls, /inquireOne\/index\.json/);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].title, '活性氧化铝采购公告');

    const ignored = await collectCandidates({
      id: 'source-huajin',
      source_name: '华锦兵器网',
      owner_name: '小魏',
      status: 'active',
    }, {
      collectorServiceUrl: 'http://collector-service:8096',
    });
    assert.deepEqual(ignored, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runOnce only processes 国能源 and does not create manual tasks', async () => {
  const sources = [
    {
      id: 'source-gn',
      source_name: '国能网',
      owner_name: '小杨',
      status: 'active',
      schedule_times: '09:00',
    },
    {
      id: 'source-cnpc',
      source_name: '中石油招投标网',
      owner_name: '小陈',
      status: 'active',
      schedule_times: '09:00',
    },
  ];
  const createdRecords = [];
  const updatedRecords = [];
  const auditLogs = [];

  await runOnce({
    loginFn: async () => 'token1',
    listAllFn: async (collection) => {
      if (collection === 'monitor_sources') return sources;
      if (collection === 'bid_opportunities') return [];
      return [];
    },
    shouldRunSourceFn: () => true,
    collectCandidatesFn: async (source) => [{
      sourceId: source.id,
      sourceName: source.source_name,
      ownerName: source.owner_name,
      title: '国能水处理剂询价采购公告',
      url: 'https://example.com/notice',
      content: '水处理剂询价采购公告。投标截止日期：2099-01-02。',
      attachmentUrls: [],
      fingerprint: 'fp-guoneng',
    }],
    processCandidatesFn: async (items) => items.map((item) => ({
      ...item,
      fingerprint: item.fingerprint,
      classification: {
        relevance: 'likely_related',
        relevanceScore: 0.8,
        matchedTerms: ['水处理剂'],
        matchedSources: ['erp_history'],
        evidenceText: item.content,
        negativeTerms: [],
        classificationVersion: 'chemical-relevance-v1',
        needsHumanCheck: false,
        productKeywords: ['水处理剂'],
        summary: '疑似水处理剂',
        hardRequirements: [],
        riskFlags: [],
      },
    })),
    createRecordFn: async (collection, token, data) => {
      createdRecords.push({ collection, token, data });
      return { id: `${collection}-1`, ...data };
    },
    updateRecordFn: async (collection, id, token, data) => {
      updatedRecords.push({ collection, id, token, data });
      return { id, ...data };
    },
    auditLogFn: async (token, data) => {
      auditLogs.push({ token, data });
    },
  });

  assert.equal(createdRecords.filter((item) => item.collection === 'monitor_runs').length, 1);
  assert.equal(createdRecords.filter((item) => item.collection === 'bid_opportunities').length, 1);
  assert.equal(createdRecords.some((item) => item.collection === 'agent_tasks'), false);
  assert.equal(updatedRecords[0].id, 'source-gn');
  assert.match(auditLogs[0].data.output_summary, /success/);
});

test('runDocumentTextDryRun parses pasted tender text without PocketBase', () => {
  const result = runDocumentTextDryRun({
    title: '人工粘贴标书',
    text: '缓蚀阻垢剂采购公告。采购单位：裕龙石化。投标截止日期：2099-01-02。需第三方检测报告。',
    sourceName: '人工补资料',
    ownerName: '小白',
  });

  assert.equal(result.extractionStatus, 'parsed');
  assert.match(result.opportunity.product_keywords, /缓蚀阻垢剂/);
  assert.equal(result.opportunity.relevance, 'likely_related');
  assert.match(result.opportunity.hard_requirements, /第三方检测/);
});

test('runConfirmationPackageDryRun returns package text and recommended action', () => {
  const result = runConfirmationPackageDryRun();

  assert.match(result.package_text, /缓蚀阻垢剂/);
  assert.match(result.recommended_action, /王总判断/);
});

test('runDryRunJson can use an injected classifier enhancer', async () => {
  const result = await runDryRunJson({
    classifierEnhancer: async (candidate, ruleClassification) => {
      if (candidate.title.includes('办公用品')) return ruleClassification;
      return {
        ...ruleClassification,
        relevance: 'likely_related',
        relevanceScore: 0.91,
        confidence: 0.88,
        matchedSources: [...ruleClassification.matchedSources, 'llm'],
        summary: 'LLM 增强判断为相关。',
        classificationVersion: `${ruleClassification.classificationVersion}+llm`,
      };
    },
  });

  assert.equal(result.retained_count, 1);
  assert.equal(result.opportunities[0].classification_version, 'chemical-relevance-v1+llm');
  assert.match(result.opportunities[0].matched_sources, /llm/);
});

test('startScheduler keeps the service alive and triggers an immediate run when requested', async () => {
  let runCount = 0;
  const scheduler = startScheduler({
    intervalMs: 60_000,
    immediate: true,
    run: async () => {
      runCount += 1;
    },
  });

  try {
    await scheduler.ready;

    assert.equal(runCount, 1);
    assert.ok(scheduler.timer);
  } finally {
    scheduler.stop();
  }
});
