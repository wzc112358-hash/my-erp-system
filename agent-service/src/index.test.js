import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLoginSessionPayload,
  buildManualTaskPayload,
  needsManualRun,
  ensureLoginSession,
  shouldCreateLoginSession,
  runManualTaskDryRun,
  runDocumentTextDryRun,
  runConfirmationPackageDryRun,
  runDryRunJson,
  requestBrowserSession,
  startScheduler,
  shouldPersistOpportunity,
  shouldRunSource,
} from './index.js';
import { buildOpportunityPayload, runPublicUrlDryRun } from './index.js';
import { resolveSourceStrategy } from './source-strategies.js';

test('shouldRunSource runs inside a configured schedule window', () => {
  const source = {
    status: 'active',
    schedule_times: '09:00,12:00',
  };

  assert.equal(shouldRunSource(source, new Date('2026-05-23T09:05:00+08:00')), true);
});

test('shouldRunSource skips repeated runs inside the same schedule window', () => {
  const source = {
    status: 'active',
    schedule_times: '09:00,12:00',
    last_run_at: '2026-05-23 01:02:00.000Z',
  };

  assert.equal(shouldRunSource(source, new Date('2026-05-23T09:05:00+08:00')), false);
});

test('needsManualRun marks sources without an entry url as manual work', () => {
  const source = {
    status: 'active',
    login_type: 'none',
    requires_login: false,
    may_have_captcha: false,
  };

  assert.equal(needsManualRun(source), true);
});

test('buildOpportunityPayload includes relevance evidence fields', () => {
  const source = {
    id: 'source1',
    source_name: '历史群聊样本',
    owner_name: '小杨',
  };
  const run = { id: 'run1' };
  const item = {
    sourceName: '历史群聊样本',
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

test('resolveSourceStrategy returns PRD site strategy for 国能网', () => {
  const strategy = resolveSourceStrategy({
    source_name: '国能网',
    login_type: 'none',
    requires_login: false,
    may_have_captcha: false,
    status: 'active',
  });

  assert.equal(strategy.crawlStrategy, 'http_html');
  assert.equal(strategy.siteSearchBehavior, 'supplemental');
  assert.ok(strategy.categoryNames.includes('国能E招-招标公告'));
  assert.equal(strategy.requiresManualAssist, false);
});

test('resolveSourceStrategy treats login sources as manual-assist work', () => {
  const strategy = resolveSourceStrategy({
    source_name: '云梦泽询价网',
    login_type: 'account',
    requires_login: true,
    may_have_captcha: false,
    status: 'active',
  });

  assert.equal(strategy.crawlStrategy, 'manual_assist');
  assert.equal(strategy.requiresManualAssist, true);
  assert.match(strategy.manualAssistReason, /账号登录/);
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

test('runManualTaskDryRun returns manual and local helper task samples', () => {
  const result = runManualTaskDryRun();

  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].task_type, 'manual_assist');
  assert.equal(result.tasks[0].status, 'pending');
  assert.equal(result.local_helper_contract.upload_slots.includes('manual_text'), true);
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

test('requestBrowserSession posts source login context to browser worker', async () => {
  const requests = [];
  const response = await requestBrowserSession({
    id: 'source1',
    source_name: '云梦泽询价网',
    owner_name: '小陈',
    source_url: 'https://ymz.example.com/login',
    category_urls: 'https://ymz.example.com/notices',
  }, {
    browserWorkerUrl: 'https://browser-worker.example.com/',
    browserWorkerToken: 'internal-secret',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 201,
        statusText: 'Created',
        json: async () => ({
          id: 'session_abc',
          status: 'login_required',
          browser_url: 'https://browser.example.com/sessions/session_abc',
          profile_ref: 'profiles/session_abc',
          expires_at: '2026-06-02T01:00:00.000Z',
        }),
      };
    },
  });

  assert.equal(requests[0].url, 'https://browser-worker.example.com/sessions');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer internal-secret');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    sourceId: 'source1',
    sourceName: '云梦泽询价网',
    ownerName: '小陈',
    loginUrl: 'https://ymz.example.com/notices',
  });
  assert.equal(response.browser_url, 'https://browser.example.com/sessions/session_abc');
});

test('buildLoginSessionPayload maps browser worker session into PocketBase fields', () => {
  const payload = buildLoginSessionPayload({
    id: 'source1',
    source_name: '云梦泽询价网',
    owner_name: '小陈',
    source_url: 'https://ymz.example.com/login',
  }, {
    status: 'login_required',
    login_url: 'https://ymz.example.com/login',
    browser_url: 'https://browser.example.com/sessions/session_abc',
    profile_ref: 'profiles/session_abc',
    expires_at: '2026-06-02T01:00:00.000Z',
  });

  assert.equal(payload.source, 'source1');
  assert.equal(payload.status, 'login_required');
  assert.equal(payload.browser_url, 'https://browser.example.com/sessions/session_abc');
  assert.equal(payload.profile_ref, 'profiles/session_abc');
  assert.match(payload.security_note, /员工只在远程浏览器中完成登录/);
});

test('ensureLoginSession creates a PocketBase session and buildManualTaskPayload attaches it to the task', async () => {
  const source = {
    id: 'source1',
    source_name: '云梦泽询价网',
    owner_name: '小陈',
    source_url: 'https://ymz.example.com/login',
    requires_login: true,
    may_have_captcha: true,
    login_type: 'account',
  };
  const createdRecords = [];
  const session = await ensureLoginSession({
    token: 'token1',
    source,
    createRecordFn: async (collection, token, data) => {
      createdRecords.push({ collection, token, data });
      return {
        id: 'pb_session_1',
        ...data,
      };
    },
    browserWorkerFn: async () => ({
      status: 'login_required',
      browser_url: 'https://browser.example.com/sessions/session_abc',
      profile_ref: 'profiles/session_abc',
      expires_at: '2026-06-02T01:00:00.000Z',
    }),
  });

  const task = buildManualTaskPayload({
    source,
    run: { id: 'run1' },
    strategy: { manualAssistReason: '账号登录后搜索询价' },
    session,
    now: new Date('2026-05-26T01:00:00.000Z'),
  });

  assert.equal(createdRecords[0].collection, 'agent_login_sessions');
  assert.equal(createdRecords[0].token, 'token1');
  assert.equal(createdRecords[0].data.browser_url, 'https://browser.example.com/sessions/session_abc');
  assert.equal(task.session, 'pb_session_1');
  assert.equal(task.session_status, 'login_required');
  assert.equal(task.browser_url, 'https://browser.example.com/sessions/session_abc');
});

test('shouldCreateLoginSession only targets sources that benefit from remote browser login state', () => {
  assert.equal(shouldCreateLoginSession({
    login_type: 'account',
    requires_login: true,
  }), true);
  assert.equal(shouldCreateLoginSession({
    may_have_captcha: true,
  }), true);
  assert.equal(shouldCreateLoginSession({
    crawl_strategy: 'playwright_dom',
  }), true);
  assert.equal(shouldCreateLoginSession({
    status: 'manual_required',
    manual_assist_reason: '缺少栏目入口，需要人工补充链接',
  }), false);
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
