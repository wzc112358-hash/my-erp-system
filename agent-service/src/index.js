import process from 'node:process';

import {
  buildGroupSummary,
  processCandidatesWithEnhancement,
} from './opportunity-agent.js';
import { collectHttpHtmlCandidates } from './adapters/http-html-adapter.js';
import { collectSourceWithCollector, collectUrlWithCollector } from './collector-client.js';
import { buildConfirmationPackage } from './domain/confirmation-package.js';
import { extractDocumentInsight } from './domain/document-ingestion.js';
import { classifyWithLlm } from './domain/llm-classifier.js';
import {
  buildOpportunityPayload,
  shouldPersistOpportunity,
} from './opportunity-persistence.js';
import { isCloudManagedSource, resolveSourceStrategy } from './source-strategies.js';

export {
  buildOpportunityPayload,
  shouldPersistOpportunity,
} from './opportunity-persistence.js';

const API_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
const SUPERUSER_PASSWORD = process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;
const SAMPLE_MODE = process.env.OPPORTUNITY_AGENT_SAMPLE_MODE === '1';
const SCHEDULE_TIME_ZONE = process.env.OPPORTUNITY_AGENT_TIME_ZONE || 'Asia/Shanghai';
const COLLECTOR_SERVICE_URL = process.env.COLLECTOR_SERVICE_URL || '';

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
  if (!SAMPLE_MODE || !isCloudManagedSource(source)) return [];
  return [
    {
      sourceId: source.id,
      sourceName: source.source_name,
      ownerName: source.owner_name,
      title: '国能化工三剂亚硫酸氢钠询价采购公告',
      url: source.source_url || 'https://www.chnenergybidding.com.cn/',
      content: '采购单位：示例采购单位。投标截止日期：2099-01-02。采购亚硫酸氢钠、水处理剂。',
    },
  ];
};

const COLLECTOR_MODES = new Set(['http_html', 'http_json']);

const shouldUseCollectorService = (strategy, collectorServiceUrl) => (
  Boolean(collectorServiceUrl) &&
  strategy.collectionPath === 'cloud_auto' &&
  COLLECTOR_MODES.has(strategy.crawlStrategy)
);

export const collectCandidates = async (source, {
  collectorServiceUrl = COLLECTOR_SERVICE_URL,
} = {}) => {
  if (SAMPLE_MODE) return sampleCandidatesFor(source);
  if (!isCloudManagedSource(source)) return [];

  const strategy = resolveSourceStrategy(source);
  const sourceForCollection = {
    ...source,
    category_names: strategy.categoryNames.join(','),
    category_urls: strategy.categoryUrls.join(','),
    crawl_strategy: strategy.crawlStrategy,
  };
  if (shouldUseCollectorService(strategy, collectorServiceUrl)) {
    return collectSourceWithCollector({
      collectorUrl: collectorServiceUrl,
      source: sourceForCollection,
      mode: strategy.crawlStrategy,
    });
  }
  if (strategy.crawlStrategy === 'http_html') {
    return collectHttpHtmlCandidates(sourceForCollection, {
      enrichDetails: process.env.OPPORTUNITY_AGENT_ENRICH_DETAILS !== '0',
    });
  }
  return [];
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
  if (!isCloudManagedSource(source) || source.status !== 'active') return false;
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

const upsertOpportunity = async (
  token,
  source,
  run,
  item,
  existingByFingerprint,
  createRecordFn = createRecord,
) => {
  if (existingByFingerprint.has(item.fingerprint)) return null;
  const record = await createRecordFn('bid_opportunities', token, buildOpportunityPayload(source, run, item));
  existingByFingerprint.set(item.fingerprint, record);
  return record;
};

const dryRunSources = [
  {
    id: 'dry-source-1',
    source_name: '国能网',
    owner_name: '小杨',
    source_url: 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html',
    category_urls: 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html',
    status: 'active',
    login_type: 'none',
    requires_login: false,
    may_have_captcha: false,
  },
];

const dryRunCandidates = [
  {
    sourceId: 'dry-source-1',
    sourceName: '国能网',
    ownerName: '小杨',
    title: '炼油四部用塑料用抗静电剂（2026-2027）框架采购询比采购公告',
    url: 'https://example.com/notices/anti-static',
    content: '采购单位：示例采购单位。投标截止日期：2099-01-02。允许代理商投标，需第三方检测报告。',
  },
  {
    sourceId: 'dry-source-1',
    sourceName: '国能网',
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
  collectorServiceUrl = COLLECTOR_SERVICE_URL,
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
  const rawCandidates = collectorServiceUrl
    ? await collectUrlWithCollector({
      collectorUrl: collectorServiceUrl,
      url,
      sourceName,
      ownerName,
      mode: source.crawl_strategy,
    })
    : await collectHttpHtmlCandidates(source, {
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

export const runConfirmationPackageDryRun = () => buildConfirmationPackage({
  opportunity: {
    title: '国能网缓蚀阻垢剂采购公告',
    source_name: '国能网',
    owner_name: '小杨',
    buyer_name: '国家能源集团',
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

export const runOnce = async ({
  loginFn = login,
  listAllFn = listAll,
  shouldRunSourceFn = shouldRunSource,
  collectCandidatesFn = collectCandidates,
  processCandidatesFn = processCandidatesWithEnhancement,
  createRecordFn = createRecord,
  updateRecordFn = updateRecord,
  auditLogFn = auditLog,
  classifierEnhancer = classifyWithLlm,
} = {}) => {
  const token = await loginFn();
  const sources = await listAllFn('monitor_sources', token, '&sort=owner_name,source_name');
  const cloudSources = sources.filter(isCloudManagedSource);
  const existing = await listAllFn('bid_opportunities', token);
  const existingByFingerprint = new Map(existing.map((item) => [item.fingerprint, item]));
  const allProcessed = [];
  const runIds = [];

  for (const source of cloudSources.filter((item) => shouldRunSourceFn(item))) {
    try {
      const rawCandidates = await collectCandidatesFn(source);
      const processed = await processCandidatesFn(rawCandidates, {
        classifierEnhancer,
      });
      const relatedCount = processed.filter((item) => ['likely_related', 'needs_manual_review'].includes(item.classification.relevance)).length;
      const status = processed.length > 0 ? 'success' : 'no_new';
      const run = await createRecordFn('monitor_runs', token, {
        source: source.id,
        source_name: source.source_name,
        owner_name: source.owner_name,
        run_at: new Date().toISOString(),
        status,
        found_count: processed.length,
        related_count: relatedCount,
        error_message: '',
      });
      runIds.push(run.id);
      for (const item of processed.filter(shouldPersistOpportunity)) {
        const record = await upsertOpportunity(token, source, run, item, existingByFingerprint, createRecordFn);
        if (record) allProcessed.push(item);
      }
      await updateRecordFn('monitor_sources', source.id, token, {
        last_result: status,
        last_run_at: new Date().toISOString(),
      });
      await auditLogFn(token, {
        action: 'monitor_source',
        target_collection: 'monitor_sources',
        target_id: source.id,
        input_summary: `${source.owner_name} ${source.source_name}`,
        output_summary: `${status}; found=${processed.length}; related=${relatedCount}`,
      });
    } catch (error) {
      await createRecordFn('monitor_runs', token, {
        source: source.id,
        source_name: source.source_name,
        owner_name: source.owner_name,
        run_at: new Date().toISOString(),
        status: 'failed',
        found_count: 0,
        related_count: 0,
        error_message: error.message,
      });
      await auditLogFn(token, {
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
    await updateRecordFn('monitor_runs', runIds[runIds.length - 1], token, { group_summary: groupSummary });
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
