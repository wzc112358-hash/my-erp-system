import crypto from 'node:crypto';
import http from 'node:http';

import { normalizeBusinessAssessment } from '../domain/notice.ts';
import type { BidBusinessAssessment } from '../domain/tender-screening.ts';
import { BID_SITES } from '../sites/registry.ts';
import { persistCollectionNotices } from '../application/persist-report.ts';
import { assessLocalHelperReport } from '../application/ingest-local-helper-report.ts';
import { createBidPreparationModule, type ErpRegion } from '../application/bid-preparation.ts';
import { createDefaultBidAssessor } from '../llm/bid-assessor.ts';
import { createBidDraftExtractor } from '../llm/bid-draft-extractor.ts';
import { createBidPreparationData } from './bid-preparation-repository.ts';
import { PocketBaseBidNoticeRepository } from './pocketbase-repository.ts';
import { PocketBaseClient, type PocketBaseRecord } from './pocketbase-client.ts';

type JsonResponse = http.ServerResponse<http.IncomingMessage>;

const json = (response: JsonResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const readJson = async (request: http.IncomingMessage, maxBytes = 2 * 1024 * 1024) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request body is too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
};

const parseArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
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

const noticeDto = (record: PocketBaseRecord & Record<string, unknown>) => ({
  id: record.id,
  sourceKey: String(record.source_key || ''),
  sourceName: String(record.source_name || ''),
  kind: record.kind === 'attention' ? 'attention' : 'current',
  title: String(record.title || ''),
  url: String(record.url || ''),
  buyerName: String(record.buyer_name || ''),
  publishedAt: String(record.published_at || ''),
  deadlineAt: String(record.deadline_at || ''),
  matchedProducts: parseArray(record.matched_products),
  judgment: String(record.judgment || ''),
  requirements: parseArray(record.requirements),
  missingInfo: parseArray(record.missing_info),
  evidence: String(record.evidence || ''),
  detailReadMethod: String(record.detail_read_method || ''),
  attachmentUrls: parseArray(record.attachment_urls),
  assessment: parseAssessment(record.assessment),
  firstSeenAt: String(record.first_seen_at || ''),
  lastSeenAt: String(record.last_seen_at || ''),
  lastChangedAt: String(record.last_changed_at || ''),
});

const runDto = (record: PocketBaseRecord & Record<string, unknown>) => ({
  id: record.id,
  sourceKey: String(record.source_key || ''),
  sourceName: String(record.source_name || ''),
  // run_key stores the business date in Asia/Shanghai; PocketBase dates are
  // UTC instants and would otherwise appear as the previous calendar day.
  runDate: String(record.run_key || '').split(':').at(-1) || String(record.run_date || ''),
  startedAt: String(record.started_at || ''),
  finishedAt: String(record.finished_at || ''),
  status: String(record.status || ''),
  rawCount: Number(record.raw_count || 0),
  eligibleCount: Number(record.eligible_count || 0),
  currentCount: Number(record.current_count || 0),
  attentionCount: Number(record.attention_count || 0),
  newCount: Number(record.new_count || 0),
  updatedCount: Number(record.updated_count || 0),
  duplicateCount: Number(record.duplicate_count || 0),
  excludedCount: Number(record.excluded_count || 0),
  summary: String(record.summary || ''),
  errorMessage: String(record.error_message || ''),
});

const searchMatches = (record: ReturnType<typeof noticeDto>, search: string) => !search
  || [record.title, record.buyerName, record.sourceName, ...record.matchedProducts]
    .join(' ')
    .toLocaleLowerCase('zh-CN')
    .includes(search.toLocaleLowerCase('zh-CN'));

const tokenCache = new Map<string, number>();

const validateErpToken = async ({
  request,
  env,
}: {
  request: http.IncomingMessage;
  env: Record<string, string | undefined>;
}) => {
  const authorization = String(request.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return false;
  const token = authorization.slice(7);
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  if ((tokenCache.get(digest) || 0) > Date.now()) return true;
  const region = String(request.headers['x-erp-region'] || 'beijing');
  const baseUrl = region === 'lanzhou'
    ? env.ERP_LANZHOU_API_URL || 'https://api-lanzhou.henghuacheng.cn'
    : env.ERP_BEIJING_API_URL || env.POCKETBASE_URL || 'https://api-beijing.henghuacheng.cn';
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/collections/users/auth-refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }).catch(() => null);
  if (!response?.ok) return false;
  tokenCache.set(digest, Date.now() + 5 * 60_000);
  return true;
};

export const createBidApiServer = ({
  client,
  port = Number(process.env.BID_AGENT_PORT || process.env.LOCAL_HELPER_API_PORT || 8097),
  host = process.env.BID_AGENT_HOST || '0.0.0.0',
  env = process.env,
}: {
  client: PocketBaseClient;
  port?: number;
  host?: string;
  env?: Record<string, string | undefined>;
}) => {
  const noticeRepository = new PocketBaseBidNoticeRepository(client);
  const regionClients: Record<ErpRegion, PocketBaseClient> = {
    beijing: client,
    lanzhou: new PocketBaseClient({
      baseUrl: env.POCKETBASE_LANZHOU_URL || env.ERP_LANZHOU_API_URL || 'https://api-lanzhou.henghuacheng.cn',
      identity: env.POCKETBASE_SUPERUSER_EMAIL || env.POCKETBASE_ADMIN_EMAIL || '',
      password: env.POCKETBASE_SUPERUSER_PASSWORD || env.POCKETBASE_ADMIN_PASSWORD || '',
    }),
  };
  const bidPreparation = createBidPreparationModule({
    data: createBidPreparationData({ noticeClient: client, regionClients }),
    extractor: createBidDraftExtractor({ env }),
  });
  const localHelperAssessor = createDefaultBidAssessor({ env });
  const pairCode = String(env.LOCAL_HELPER_PAIR_CODE || '');
  const localHelperToken = String(env.LOCAL_HELPER_API_TOKEN || '');
  const server = http.createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', String(request.headers.origin || '*'));
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-ERP-Region');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, { ok: true, service: 'erp-bid-agent' });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/local-helper/pair') {
        const body = await readJson(request);
        if (!pairCode || !localHelperToken) return json(response, 503, { error: 'local helper pairing is not configured' });
        if (String(body.code || '') !== pairCode) return json(response, 401, { error: 'invalid pair code' });
        json(response, 200, { paired: true, token: localHelperToken, device: { id: 'local-helper', ownerName: '', deviceName: String(body.deviceName || 'Windows 本地助手') } });
        return;
      }
      if (url.pathname.startsWith('/local-helper/')) {
        if (!localHelperToken || request.headers.authorization !== `Bearer ${localHelperToken}`) return json(response, 401, { error: 'invalid local helper token' });
        if (request.method === 'POST' && url.pathname === '/local-helper/heartbeat') return json(response, 200, { ok: true });
        if (request.method === 'GET' && url.pathname === '/local-helper/tasks') return json(response, 200, { tasks: [] });
        if (request.method === 'GET' && url.pathname === '/local-helper/release') return json(response, 200, { latestVersion: env.LOCAL_HELPER_LATEST_VERSION || '' });
        if (request.method === 'POST' && /^\/local-helper\/tasks\/[^/]+\/result$/.test(url.pathname)) {
          const report = await readJson(request) as Record<string, unknown>;
          const assessed = await assessLocalHelperReport({
            report,
            assessor: localHelperAssessor,
          });
          const result = await persistCollectionNotices({ notices: assessed.notices, repository: noticeRepository });
          json(response, 200, {
            uploaded: true,
            uploadedCount: result.created.length + result.updated.length,
            duplicateCount: result.duplicateCount + result.batchDuplicateCount,
            assessedCount: assessed.assessedCount,
            ignoredCount: assessed.ignoredCount,
            recordIds: [...result.created, ...result.updated].map((item) => item.id),
          });
          return;
        }
        return json(response, 404, { error: 'not found' });
      }

      if (!url.pathname.startsWith('/api/bids/')) return json(response, 404, { error: 'not found' });
      if (!await validateErpToken({ request, env })) return json(response, 401, { error: 'ERP login required' });

      const historyMatch = url.pathname.match(/^\/api\/bids\/notices\/([^/]+)\/history$/);
      if (request.method === 'GET' && historyMatch) {
        const result = await bidPreparation.history(decodeURIComponent(historyMatch[1]));
        json(response, 200, { items: result.historicalMatches });
        return;
      }

      const prepareMatch = url.pathname.match(/^\/api\/bids\/notices\/([^/]+)\/prepare$/);
      if (request.method === 'POST' && prepareMatch) {
        const region: ErpRegion = request.headers['x-erp-region'] === 'lanzhou' ? 'lanzhou' : 'beijing';
        try {
          const result = await bidPreparation.prepare(decodeURIComponent(prepareMatch[1]), region);
          json(response, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          json(response, /不存在/.test(message) ? 404 : /不能创建|阻断条件/.test(message) ? 409 : 500, { error: message });
        }
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/bids/notices') {
        const kind = url.searchParams.get('kind') || '';
        const sourceKey = url.searchParams.get('source') || '';
        const search = url.searchParams.get('search') || '';
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const perPage = Math.min(5000, Math.max(1, Number(url.searchParams.get('perPage') || 30)));
        const filters = [kind ? `kind = "${kind === 'attention' ? 'attention' : 'current'}"` : '', sourceKey ? `source_key = "${sourceKey.replaceAll('"', '')}"` : ''].filter(Boolean);
        const records = await client.listAll<PocketBaseRecord & Record<string, unknown>>('bid_notices', {
          filter: filters.join(' && '),
          // Current opportunities must stay ahead of historical/ended attention
          // items even when a source contributes many attention records at once.
          sort: '-kind,-first_seen_at',
        });
        const items = records.map(noticeDto).filter((item) => searchMatches(item, search));
        const offset = (page - 1) * perPage;
        json(response, 200, { page, perPage, totalItems: items.length, totalPages: Math.max(1, Math.ceil(items.length / perPage)), items: items.slice(offset, offset + perPage) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/bids/runs') {
        const records = await client.listAll<PocketBaseRecord & Record<string, unknown>>('bid_collection_runs', { sort: '-run_date,-started_at' });
        json(response, 200, { items: records.slice(0, 100).map(runDto) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/bids/sources') {
        json(response, 200, {
          items: BID_SITES.map(({ sourceKey, sourceName, collectionMode }) => ({
            sourceKey,
            sourceName,
            collectionMode,
          })),
        });
        return;
      }
      json(response, 404, { error: 'not found' });
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return {
    start: () => new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    }),
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    url: () => `http://${host}:${port}`,
  };
};
