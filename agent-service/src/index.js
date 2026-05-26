import process from 'node:process';

import {
  buildGroupSummary,
  processCandidatesWithEnhancement,
} from './opportunity-agent.js';
import { collectHttpHtmlCandidates } from './adapters/http-html-adapter.js';
import { buildConfirmationPackage } from './domain/confirmation-package.js';
import { extractDocumentInsight } from './domain/document-ingestion.js';
import { classifyWithLlm } from './domain/llm-classifier.js';
import {
  buildLocalHelperTaskShape,
  buildManualAssistTask,
  entryUrlForSource,
  sessionStatusForSource,
} from './domain/manual-assist.js';
import { resolveSourceStrategy } from './source-strategies.js';

const API_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
const SUPERUSER_PASSWORD = process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;
const SAMPLE_MODE = process.env.OPPORTUNITY_AGENT_SAMPLE_MODE === '1';
const SCHEDULE_TIME_ZONE = process.env.OPPORTUNITY_AGENT_TIME_ZONE || 'Asia/Shanghai';
const BROWSER_WORKER_URL = process.env.BROWSER_WORKER_URL || '';
const BROWSER_PUBLIC_BASE_URL = process.env.BROWSER_PUBLIC_BASE_URL || '';
const BROWSER_INTERNAL_API_TOKEN = process.env.BROWSER_INTERNAL_API_TOKEN || '';

const request = async (path, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
};

const login = async () => {
  if (!SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) {
    throw new Error('POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD are required');
  }
  const result = await request('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD }),
  });
  return result.token;
};

const listAll = async (collection, token, query = '') => {
  const result = await request(`/api/collections/${collection}/records?perPage=500${query}`, { token });
  return result.items || [];
};

const createRecord = async (collection, token, data) => {
  return request(`/api/collections/${collection}/records`, {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });
};

const updateRecord = async (collection, id, token, data) => {
  return request(`/api/collections/${collection}/records/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(data),
  });
};

const auditLog = async (token, data) => {
  try {
    await createRecord('agent_audit_logs', token, {
      agent_name: 'opportunity-monitor',
      status: 'success',
      ...data,
    });
  } catch (error) {
    console.warn(`[audit] ${error.message}`);
  }
};

const sampleCandidatesFor = (source) => {
  if (!SAMPLE_MODE) return [];
  if (!source.source_name.includes('裕龙') && !source.source_name.includes('云梦泽')) return [];
  return [
    {
      sourceId: source.id,
      sourceName: source.source_name,
      ownerName: source.owner_name,
      title: `${source.source_name} 缓蚀阻垢剂采购公告`,
      url: source.source_url || `https://example.com/${encodeURIComponent(source.source_name)}/notice`,
      content: '采购单位：示例采购单位。投标截止日期：2099-01-02。允许代理商投标，需第三方检测报告，需中石油8位码。',
    },
  ];
};

const collectCandidates = async (source) => {
  if (SAMPLE_MODE) return sampleCandidatesFor(source);
  const strategy = resolveSourceStrategy(source);
  if (strategy.requiresManualAssist) return [];
  if (strategy.crawlStrategy === 'http_html') return collectHttpHtmlCandidates(source, {
    enrichDetails: process.env.OPPORTUNITY_AGENT_ENRICH_DETAILS !== '0',
  });
  return [];
};

export const needsManualRun = (source) => (
  source.status === 'manual_required' ||
  (!SAMPLE_MODE && !source.source_url) ||
  (!SAMPLE_MODE && resolveSourceStrategy(source).requiresManualAssist)
);

const urgencyFor = (deadlineDate) => {
  if (!deadlineDate) return 'unknown';
  const days = Math.ceil((new Date(`${deadlineDate}T23:59:59+08:00`).getTime() - Date.now()) / 86400000);
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'soon';
  return 'normal';
};

export const buildOpportunityPayload = (source, run, item) => {
  const classification = item.classification;
  return {
    source: source.id,
    monitor_run: run.id,
    source_name: item.sourceName,
    owner_name: item.ownerName,
    title: item.title,
    url: item.url,
    fingerprint: item.fingerprint,
    publish_date: item.publishDate || '',
    deadline_date: item.deadlineDate || '',
    buyer_name: item.buyerName || '',
    product_keywords: classification.productKeywords.join(','),
    relevance: classification.relevance,
    relevance_score: classification.relevanceScore,
    matched_terms: classification.matchedTerms.join(','),
    matched_sources: classification.matchedSources.join(','),
    evidence_text: classification.evidenceText,
    negative_terms: classification.negativeTerms.join(','),
    classification_version: classification.classificationVersion,
    needs_human_check: classification.needsHumanCheck,
    status: 'pending_review',
    urgency: urgencyFor(item.deadlineDate),
    agent_summary: classification.summary,
    hard_requirements: classification.hardRequirements.join(','),
    risk_flags: classification.riskFlags.join(','),
    attachment_urls: item.attachmentUrls.join('\n'),
    raw_text: item.rawText,
  };
};

const parsePocketBaseDate = (value) => {
  if (!value) return null;
  const normalized = String(value).includes('T')
    ? String(value)
    : String(value).replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const shouldRunSource = (source, now = new Date()) => {
  if (source.status !== 'active' && source.status !== 'manual_required') return false;
  const times = String(source.schedule_times || '09:00,12:00,15:00,17:30')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (process.argv.includes('--force')) return true;
  const lastRunAt = parsePocketBaseDate(source.last_run_at);
  if (lastRunAt && now.getTime() - lastRunAt.getTime() < 30 * 60 * 1000) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  const currentMinutes = hour * 60 + minute;
  return times.some((time) => {
    const [hour, minute] = time.split(':').map(Number);
    const scheduled = hour * 60 + minute;
    return Math.abs(currentMinutes - scheduled) <= 10;
  });
};

const upsertOpportunity = async (token, source, run, item, existingByFingerprint) => {
  if (existingByFingerprint.has(item.fingerprint)) return null;
  const record = await createRecord('bid_opportunities', token, buildOpportunityPayload(source, run, item));
  existingByFingerprint.set(item.fingerprint, record);
  return record;
};

export const shouldPersistOpportunity = (item) => (
  ['likely_related', 'needs_manual_review'].includes(item.classification?.relevance)
);

export const shouldCreateLoginSession = (source = {}) => (
  source.requires_login === true ||
  source.may_have_captcha === true ||
  source.login_type === 'account' ||
  ['playwright_dom', 'playwright_network'].includes(source.crawl_strategy)
);

const normalizeServiceUrl = (value = '') => String(value || '').replace(/\/+$/, '');

export const requestBrowserSession = async (source, {
  browserWorkerUrl = BROWSER_WORKER_URL,
  browserPublicBaseUrl = BROWSER_PUBLIC_BASE_URL,
  browserWorkerToken = BROWSER_INTERNAL_API_TOKEN,
  fetchImpl = fetch,
} = {}) => {
  const baseUrl = normalizeServiceUrl(browserWorkerUrl);
  if (!baseUrl) return null;
  const body = {
    sourceId: source.id || '',
    sourceName: source.source_name || '',
    ownerName: source.owner_name || '',
    loginUrl: entryUrlForSource(source),
  };
  if (browserPublicBaseUrl) {
    body.publicBaseUrl = browserPublicBaseUrl;
  }
  const response = await fetchImpl(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(browserWorkerToken ? { Authorization: `Bearer ${browserWorkerToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`browser-worker ${response.status} ${response.statusText}: ${text}`);
  }
  return response.json();
};

export const buildLoginSessionPayload = (source, browserSession = null) => {
  const fallbackStatus = sessionStatusForSource(source) || 'login_required';
  return {
    source: source.id || '',
    source_name: source.source_name || '',
    owner_name: source.owner_name || '',
    status: browserSession?.status || fallbackStatus,
    login_url: browserSession?.login_url || entryUrlForSource(source),
    browser_url: browserSession?.browser_url || '',
    profile_ref: browserSession?.profile_ref || '',
    expires_at: browserSession?.expires_at || '',
    last_error: browserSession?.last_error || '',
    security_note: '员工只在远程浏览器中完成登录；Agent 复用服务器侧会话，不在 ERP 页面展示密码。',
  };
};

export const ensureLoginSession = async ({
  token,
  source,
  createRecordFn = createRecord,
  browserWorkerFn = requestBrowserSession,
} = {}) => {
  let browserSession = null;
  try {
    browserSession = await browserWorkerFn(source);
  } catch (error) {
    browserSession = {
      status: 'login_required',
      last_error: error.message,
    };
  }
  return createRecordFn('agent_login_sessions', token, buildLoginSessionPayload(source, browserSession));
};

export const buildManualTaskPayload = ({
  source,
  run,
  strategy = {},
  session = null,
  now,
} = {}) => {
  const payload = buildManualAssistTask({
    source,
    run,
    reason: strategy.manualAssistReason,
    now,
  });
  if (!session) return payload;
  return {
    ...payload,
    session: session.id || '',
    session_status: session.status || payload.session_status,
    browser_url: session.browser_url || payload.browser_url,
  };
};

const createManualTask = async (token, source, run, strategy) => {
  try {
    let session = null;
    if (shouldCreateLoginSession(source)) {
      try {
        session = await ensureLoginSession({ token, source });
      } catch (error) {
        await auditLog(token, {
          action: 'create_login_session',
          target_collection: 'agent_login_sessions',
          target_id: source.id,
          input_summary: `${source.owner_name} ${source.source_name}`,
          output_summary: 'failed',
          status: 'failed',
          error_message: error.message,
        });
      }
    }
    return await createRecord('agent_tasks', token, buildManualTaskPayload({
      source,
      run,
      strategy,
      session,
    }));
  } catch (error) {
    await auditLog(token, {
      action: 'create_manual_task',
      target_collection: 'agent_tasks',
      target_id: source.id,
      input_summary: `${source.owner_name} ${source.source_name}`,
      output_summary: 'failed',
      status: 'failed',
      error_message: error.message,
    });
    return null;
  }
};

const dryRunSources = [
  {
    id: 'dry-source-1',
    source_name: '群聊历史样本',
    owner_name: '小杨',
    source_url: 'https://example.com/notices',
    status: 'active',
    login_type: 'none',
    requires_login: false,
    may_have_captcha: false,
  },
];

const dryRunCandidates = [
  {
    sourceId: 'dry-source-1',
    sourceName: '群聊历史样本',
    ownerName: '小杨',
    title: '炼油四部用塑料用抗静电剂（2026-2027）框架采购询比采购公告',
    url: 'https://example.com/notices/anti-static',
    content: '采购单位：示例采购单位。投标截止日期：2099-01-02。允许代理商投标，需第三方检测报告。',
  },
  {
    sourceId: 'dry-source-1',
    sourceName: '群聊历史样本',
    ownerName: '小杨',
    title: '办公用品采购公告',
    url: 'https://example.com/notices/office',
    content: '采购单位：示例采购单位。',
  },
];

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
};

export const runDryRunJson = async ({
  classifierEnhancer = classifyWithLlm,
} = {}) => {
  const run = {
    id: 'dry-run-1',
    source: 'dry-source-1',
    status: 'success',
    found_count: dryRunCandidates.length,
  };
  const processed = await processCandidatesWithEnhancement(dryRunCandidates, { classifierEnhancer });
  const opportunities = processed
    .map((item) => buildOpportunityPayload(dryRunSources[0], run, item));
  const retained = opportunities.filter((item) => item.relevance !== 'irrelevant');
  return {
    sources: dryRunSources,
    runs: [run],
    opportunities,
    summary: buildGroupSummary(processed),
    retained_count: retained.length,
  };
};

export const runPublicUrlDryRun = async ({
  url,
  sourceName = '测试公开源',
  ownerName = '未分配',
  classifierEnhancer = classifyWithLlm,
}) => {
  const source = {
    id: 'public-url-source',
    source_name: sourceName,
    owner_name: ownerName,
    source_url: url,
    category_urls: url,
    status: 'active',
    login_type: 'none',
    requires_login: false,
    may_have_captcha: false,
    crawl_strategy: 'http_html',
    site_search_behavior: 'supplemental',
  };
  const rawCandidates = await collectHttpHtmlCandidates(source, {
    enrichDetails: process.argv.includes('--enrich-details'),
  });
  const processed = await processCandidatesWithEnhancement(rawCandidates, { classifierEnhancer });
  const run = {
    id: 'public-url-run',
    source: source.id,
    status: 'success',
    found_count: processed.length,
    related_count: processed.filter((item) => item.classification.relevance !== 'irrelevant').length,
  };
  const opportunities = processed.map((item) => buildOpportunityPayload(source, run, item));
  return {
    source,
    candidate_count: rawCandidates.length,
    retained_count: opportunities.filter((item) => item.relevance !== 'irrelevant').length,
    opportunities,
    summary: buildGroupSummary(processed),
  };
};

export const runDocumentTextDryRun = ({
  title = '人工补充资料',
  text = '',
  sourceName = '人工补资料',
  ownerName = '未分配',
  url = '',
} = {}) => {
  const source = {
    id: 'manual-document-source',
    source_name: sourceName,
    owner_name: ownerName,
  };
  const run = {
    id: 'manual-document-run',
    source: source.id,
    status: 'success',
  };
  const insight = extractDocumentInsight({
    title,
    text,
    sourceName,
    ownerName,
    url,
  });
  return {
    ...insight,
    opportunity: insight.candidate && insight.classification
      ? buildOpportunityPayload(source, run, {
        ...insight.candidate,
        classification: insight.classification,
      })
      : null,
  };
};

export const runManualTaskDryRun = () => {
  const manualSource = {
    id: 'manual-src-1',
    source_name: '云梦泽询价网',
    owner_name: '小陈',
    source_url: 'https://example.com/manual',
    crawl_strategy: 'manual_assist',
    manual_assist_reason: '账号登录后搜索询价',
  };
  const localSource = {
    id: 'local-src-1',
    source_name: '中石油招投标网',
    owner_name: '小陈',
    source_url: 'https://example.com/local',
    crawl_strategy: 'local_helper',
    credential_ref: 'secret:cnpc:xiaochen',
  };
  const run = { id: 'manual-run-1' };
  const tasks = [
    buildManualAssistTask({ source: manualSource, run, now: new Date('2026-05-25T09:00:00+08:00') }),
    buildManualAssistTask({ source: localSource, run, now: new Date('2026-05-25T09:00:00+08:00') }),
  ];
  return {
    tasks,
    local_helper_contract: buildLocalHelperTaskShape({ source: localSource, task: tasks[1] }),
  };
};

export const runConfirmationPackageDryRun = () => buildConfirmationPackage({
  opportunity: {
    title: '裕龙石化缓蚀阻垢剂采购公告',
    source_name: '裕龙招投标网',
    owner_name: '小白',
    buyer_name: '裕龙石化有限公司',
    deadline_date: '2099-01-02',
    product_keywords: '缓蚀阻垢剂,阻垢剂',
    evidence_text: '命中缓蚀阻垢剂，需第三方检测报告。',
    hard_requirements: '第三方检测,业绩要求',
    risk_flags: '需第三方检测,需核对历史业绩',
    employee_assessment: '产品可关注，需采购确认价格。',
    agent_summary: '疑似产品：缓蚀阻垢剂；硬性条件：第三方检测、业绩要求',
  },
  documents: [
    { title: '公告正文', parse_summary: '已解析公告正文', evidence_text: '接受代理商投标' },
  ],
  reviews: [
    { review_type: 'employee', decision: 'follow', comment: '员工认为可关注' },
  ],
});

export const runOnce = async () => {
  const token = await login();
  const sources = await listAll('monitor_sources', token, '&sort=owner_name,source_name');
  const existing = await listAll('bid_opportunities', token);
  const existingByFingerprint = new Map(existing.map((item) => [item.fingerprint, item]));
  const allProcessed = [];
  const runIds = [];

  for (const source of sources.filter((item) => shouldRunSource(item))) {
    try {
      const rawCandidates = await collectCandidates(source);
      const processed = await processCandidatesWithEnhancement(rawCandidates, {
        classifierEnhancer: classifyWithLlm,
      });
      const relatedCount = processed.filter((item) => ['likely_related', 'needs_manual_review'].includes(item.classification.relevance)).length;
      const manual = needsManualRun(source);
      const strategy = resolveSourceStrategy(source);
      const status = manual ? 'manual_required' : processed.length > 0 ? 'success' : 'no_new';
      const run = await createRecord('monitor_runs', token, {
        source: source.id,
        source_name: source.source_name,
        owner_name: source.owner_name,
        run_at: new Date().toISOString(),
        status,
        found_count: processed.length,
        related_count: relatedCount,
        error_message: manual ? strategy.manualAssistReason || '该网站第一版需要人工处理或补充登录/验证码方案' : '',
      });
      runIds.push(run.id);
      if (manual) {
        await createManualTask(token, source, run, strategy);
      }
      for (const item of processed.filter(shouldPersistOpportunity)) {
        const record = await upsertOpportunity(token, source, run, item, existingByFingerprint);
        if (record) allProcessed.push(item);
      }
      await updateRecord('monitor_sources', source.id, token, {
        last_result: status,
        last_run_at: new Date().toISOString(),
      });
      await auditLog(token, {
        action: 'monitor_source',
        target_collection: 'monitor_sources',
        target_id: source.id,
        input_summary: `${source.owner_name} ${source.source_name}`,
        output_summary: `${status}; found=${processed.length}; related=${relatedCount}`,
      });
    } catch (error) {
      await createRecord('monitor_runs', token, {
        source: source.id,
        source_name: source.source_name,
        owner_name: source.owner_name,
        run_at: new Date().toISOString(),
        status: 'failed',
        found_count: 0,
        related_count: 0,
        error_message: error.message,
      });
      await auditLog(token, {
        action: 'monitor_source',
        target_collection: 'monitor_sources',
        target_id: source.id,
        input_summary: `${source.owner_name} ${source.source_name}`,
        output_summary: 'failed',
        status: 'failed',
        error_message: error.message,
      });
    }
  }

  const groupSummary = buildGroupSummary(allProcessed);
  if (runIds.length > 0) {
    await updateRecord('monitor_runs', runIds[runIds.length - 1], token, { group_summary: groupSummary });
  }
  console.log(groupSummary);
  return groupSummary;
};

export const startScheduler = ({
  intervalMs = Number(process.env.OPPORTUNITY_AGENT_INTERVAL_MS || 10 * 60 * 1000),
  immediate = true,
  run = runOnce,
} = {}) => {
  let running = false;
  let stopped = false;

  const execute = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await run();
    } catch (error) {
      console.error(error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(execute, intervalMs);
  const ready = immediate ? execute() : Promise.resolve();

  return {
    timer,
    ready,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
};

if (process.argv[1]?.endsWith('/index.js')) {
  const command = process.argv[2] || 'serve';
  if (!['serve', 'start', 'scheduler', 'run-once'].includes(command)) {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
  if (process.argv.includes('--dry-run-json')) {
    runDryRunJson().then((result) => {
      console.log(JSON.stringify(result, null, 2));
    }).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
  if (process.argv.includes('--public-url')) {
    runPublicUrlDryRun({
      url: argValue('--public-url'),
      sourceName: argValue('--source-name') || '测试公开源',
      ownerName: argValue('--owner-name') || '未分配',
    }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
    }).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  } else if (process.argv.includes('--document-text')) {
    console.log(JSON.stringify(runDocumentTextDryRun({
      title: argValue('--document-title') || '人工补充资料',
      text: argValue('--document-text') || '',
      sourceName: argValue('--source-name') || '人工补资料',
      ownerName: argValue('--owner-name') || '未分配',
      url: argValue('--document-url') || '',
    }), null, 2));
  } else if (process.argv.includes('--manual-task-dry-run')) {
    console.log(JSON.stringify(runManualTaskDryRun(), null, 2));
  } else if (process.argv.includes('--confirmation-package-json')) {
    console.log(JSON.stringify(runConfirmationPackageDryRun(), null, 2));
  } else if (command === 'serve' || command === 'start' || command === 'scheduler') {
    const scheduler = startScheduler();
    const shutdown = () => {
      scheduler.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    runOnce().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}
