import crypto from 'node:crypto';
import http from 'node:http';

const API_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
const SUPERUSER_PASSWORD = process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;

const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const readJson = async (request, maxBytes = 2 * 1024 * 1024) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request body is too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
};

const requestPocketBase = async (path, { token = '', ...options } = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || body?.error || `PocketBase ${response.status}`);
  return body;
};

const pocketBaseLogin = async () => {
  if (!SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) throw new Error('PocketBase superuser credentials are not configured');
  const result = await requestPocketBase('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD }),
  });
  return result.token;
};

const fingerprintFor = (item) => crypto
  .createHash('sha256')
  .update([item.sourceName, item.title, item.url].map((value) => String(value || '').trim()).join('|'))
  .digest('hex');

const urgencyFor = (deadline) => {
  if (!deadline) return 'unknown';
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return 'unknown';
  const days = Math.ceil((parsed.getTime() - Date.now()) / 86400000);
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'soon';
  return 'normal';
};

const opportunityPayload = (report, run, item) => ({
  monitor_run: run.id,
  source_name: report.sourceName,
  owner_name: report.ownerName || '本地助手',
  title: item.title,
  url: item.url || '',
  fingerprint: fingerprintFor(item),
  publish_date: item.publishedAt || '',
  deadline_date: item.deadlineAt || '',
  buyer_name: item.buyerName || '',
  product_keywords: (item.matchedProducts || []).join(','),
  relevance: 'likely_related',
  status: 'pending_review',
  urgency: urgencyFor(item.deadlineAt),
  agent_summary: item.judgment || '',
  hard_requirements: (item.requirements || []).join('；'),
  risk_flags: (item.missingInfo || []).join('；'),
  group_summary: report.summary || '',
  raw_text: item.evidence || item.title,
});

export const createPocketBaseReportRepository = () => ({
  async ingestReport(report) {
    const token = await pocketBaseLogin();
    const run = await requestPocketBase('/api/collections/monitor_runs/records', {
      method: 'POST',
      token,
      body: JSON.stringify({
        source_name: report.sourceName,
        owner_name: report.ownerName || '本地助手',
        run_at: report.generatedAt || new Date().toISOString(),
        status: report.status === 'no_matches' ? 'no_new' : 'success',
        found_count: Number(report.rawCount || 0),
        related_count: Number(report.selectedCount || 0),
        group_summary: report.summary || '',
      }),
    });
    const records = [];
    for (const item of report.items || []) {
      const payload = opportunityPayload(report, run, item);
      const filter = encodeURIComponent(`fingerprint="${payload.fingerprint}"`);
      const existing = await requestPocketBase(`/api/collections/bid_opportunities/records?perPage=1&filter=${filter}`, { token });
      const record = existing.items?.[0]
        ? await requestPocketBase(`/api/collections/bid_opportunities/records/${existing.items[0].id}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify(payload),
        })
        : await requestPocketBase('/api/collections/bid_opportunities/records', {
          method: 'POST',
          token,
          body: JSON.stringify(payload),
        });
      records.push(record);
    }
    return { runId: run.id, uploadedCount: records.length, recordIds: records.map((record) => record.id) };
  },
});

const validReport = (body) => (
  body &&
  typeof body === 'object' &&
  ['has_matches', 'no_matches'].includes(body.status) &&
  Array.isArray(body.items) &&
  Number(body.selectedCount || 0) === body.items.length
);

export const createLocalHelperApiServer = ({
  port = Number(process.env.LOCAL_HELPER_API_PORT || 8097),
  host = process.env.LOCAL_HELPER_API_HOST || '0.0.0.0',
  pairCode = process.env.LOCAL_HELPER_PAIR_CODE || '',
  apiToken = process.env.LOCAL_HELPER_API_TOKEN || '',
  repository = createPocketBaseReportRepository(),
} = {}) => {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const parts = url.pathname.split('/').filter(Boolean);
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, { ok: true, service: 'local-helper-cloud-api' });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/local-helper/pair') {
        const body = await readJson(request);
        if (!pairCode || !apiToken) {
          json(response, 503, { error: 'local helper pairing is not configured' });
          return;
        }
        if (String(body.code || '') !== pairCode) {
          json(response, 401, { error: 'invalid pair code' });
          return;
        }
        json(response, 200, {
          paired: true,
          token: apiToken,
          device: {
            id: String(body.deviceFingerprint || body.deviceName || 'local-helper'),
            ownerName: '',
            deviceName: String(body.deviceName || 'Windows 本地助手'),
          },
        });
        return;
      }
      const authorization = String(request.headers.authorization || '');
      if (!apiToken || authorization !== `Bearer ${apiToken}`) {
        json(response, 401, { error: 'invalid local helper token' });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/local-helper/heartbeat') {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/local-helper/tasks') {
        json(response, 200, { tasks: [] });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/local-helper/release') {
        json(response, 200, { latestVersion: process.env.LOCAL_HELPER_LATEST_VERSION || '' });
        return;
      }
      if (request.method === 'POST' && parts[0] === 'local-helper' && parts[1] === 'tasks' && parts[3] === 'result') {
        const report = await readJson(request);
        if (!validReport(report)) {
          json(response, 400, { error: 'invalid collection report' });
          return;
        }
        const result = await repository.ingestReport({ ...report, taskId: parts[2] });
        json(response, 200, { uploaded: true, ...result });
        return;
      }
      json(response, 404, { error: 'not found' });
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return {
    start: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve());
    }),
    stop: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    url: () => {
      const address = server.address();
      if (!address || typeof address === 'string') return `http://${host}:${port}`;
      return `http://127.0.0.1:${address.port}`;
    },
  };
};
