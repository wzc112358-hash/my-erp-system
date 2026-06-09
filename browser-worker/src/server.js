import http from 'node:http';

import { isAccessProtectionEnabled, verifyAccessToken } from './access-token.js';
import { createBrowserRuntime } from './browser-runtime.js';
import { createSessionStore } from './session-manager.js';

const json = (response, statusCode, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
};

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
};

const htmlEscape = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const html = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
};

const sendBody = (response, statusCode, contentType, body) => {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
};

const wantsHtml = (request) => String(request.headers.accept || '').includes('text/html');

const isInternalApiProtectionEnabled = (token = process.env.BROWSER_INTERNAL_API_TOKEN || '') => (
  String(token || '').trim().length > 0
);

const verifyInternalApiToken = (request, token = process.env.BROWSER_INTERNAL_API_TOKEN || '') => {
  if (!isInternalApiProtectionEnabled(token)) return true;
  const expected = String(token).trim();
  const authorization = String(request.headers.authorization || '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const headerToken = String(request.headers['x-browser-worker-token'] || '');
  return bearer === expected || headerToken === expected;
};

const ensureInternalApiAccess = (request, response, internalApiToken) => {
  if (verifyInternalApiToken(request, internalApiToken)) return true;
  json(response, 401, { error: 'missing or invalid browser worker API token' });
  return false;
};

const routeWithToken = (path, accessToken = '') => {
  if (!accessToken) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}access_token=${encodeURIComponent(accessToken)}`;
};

const hiddenTokenInput = (accessToken = '') => (
  accessToken ? `<input type="hidden" name="access_token" value="${htmlEscape(accessToken)}">` : ''
);

const renderOperationPage = (session, { accessToken = '' } = {}) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${htmlEscape(session.source_name)} 登录协助</title>
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f8fa; color: #1f2937; }
      main { max-width: 920px; margin: 0 auto; padding: 32px 20px; }
      section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; }
      h1 { font-size: 22px; margin: 0 0 16px; }
      dl { display: grid; grid-template-columns: 120px 1fr; gap: 10px 16px; margin: 0 0 20px; }
      dt { color: #6b7280; }
      dd { margin: 0; word-break: break-all; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .control-grid { display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 18px; }
      .control-grid form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
      .coord-form { grid-template-columns: 96px 96px auto !important; }
      label { font-size: 13px; color: #4b5563; }
      input { border: 1px solid #d1d5db; border-radius: 6px; padding: 9px 10px; font-size: 14px; min-width: 0; }
      .screenshot { margin-top: 18px; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; background: #f9fafb; }
      .screenshot h2 { font-size: 16px; margin: 0; padding: 12px 14px; border-bottom: 1px solid #e5e7eb; }
      .screenshot img { display: block; width: 100%; min-height: 240px; object-fit: contain; }
      button, a.button { border: 1px solid #2563eb; background: #2563eb; color: #fff; border-radius: 6px; padding: 9px 13px; text-decoration: none; cursor: pointer; font-size: 14px; }
      button.secondary { background: #fff; color: #2563eb; }
      code { background: #f3f4f6; border-radius: 4px; padding: 2px 5px; }
      .error { color: #b91c1c; }
    </style>
  </head>
  <body>
    <main data-session-id="${htmlEscape(session.id)}">
      <section>
        <h1>${htmlEscape(session.source_name)} 登录协助</h1>
        <dl>
          <dt>负责人</dt><dd>${htmlEscape(session.owner_name)}</dd>
          <dt>状态</dt><dd><code>${htmlEscape(session.runtime_status || 'stopped')}</code></dd>
          <dt>入口</dt><dd>${htmlEscape(session.target_url || session.login_url || '')}</dd>
          <dt>Profile</dt><dd>${htmlEscape(session.profile_ref || '')}</dd>
          <dt>运行地址</dt><dd>${htmlEscape(session.runtime_url || '未启动')}</dd>
          <dt>最近错误</dt><dd class="error">${htmlEscape(session.last_error || '无')}</dd>
        </dl>
        <div class="actions">
          <form method="post" action="/sessions/${htmlEscape(session.id)}/start">${hiddenTokenInput(accessToken)}<button type="submit">启动会话</button></form>
          <form method="post" action="/sessions/${htmlEscape(session.id)}/stop">${hiddenTokenInput(accessToken)}<button class="secondary" type="submit">停止会话</button></form>
          <a class="button" href="${htmlEscape(session.target_url || session.login_url || '#')}" target="_blank" rel="noreferrer">打开网站</a>
        </div>
        <div class="screenshot">
          <h2>浏览器截图</h2>
          <img src="${htmlEscape(routeWithToken(`/sessions/${session.id}/snapshot`, accessToken))}" alt="当前浏览器截图">
        </div>
        <div class="control-grid">
          <form method="post" action="/sessions/${htmlEscape(session.id)}/navigate">
            ${hiddenTokenInput(accessToken)}
            <input name="url" value="${htmlEscape(session.target_url || session.login_url || '')}" aria-label="网址">
            <button type="submit">导航</button>
          </form>
          <form class="coord-form" method="post" action="/sessions/${htmlEscape(session.id)}/click">
            ${hiddenTokenInput(accessToken)}
            <input name="x" inputmode="numeric" placeholder="x" aria-label="x 坐标">
            <input name="y" inputmode="numeric" placeholder="y" aria-label="y 坐标">
            <button type="submit">点击坐标</button>
          </form>
          <form method="post" action="/sessions/${htmlEscape(session.id)}/type">
            ${hiddenTokenInput(accessToken)}
            <input name="text" placeholder="输入验证码、关键词或账号内容" aria-label="输入文本">
            <button type="submit">输入文本</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;

const respondSession = (request, response, session, accessToken = '') => {
  if (wantsHtml(request)) {
    html(response, 200, renderOperationPage(session, { accessToken }));
    return;
  }
  json(response, 200, session);
};

const accessTokenFrom = async (request, url) => {
  const queryToken = url.searchParams.get('access_token');
  if (queryToken) return queryToken;
  if (!['POST', 'PUT', 'PATCH'].includes(request.method || '')) return '';
  if (!String(request.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) return '';
  const body = await readBodyByContentType(request);
  request.formBody = body;
  return body.access_token || '';
};

const ensureSessionAccess = async (request, response, url, session, accessSecret) => {
  if (!isAccessProtectionEnabled(accessSecret)) return true;
  const token = await accessTokenFrom(request, url);
  if (verifyAccessToken(session, token, accessSecret)) return true;
  json(response, 403, { error: 'invalid or missing access token' });
  return false;
};

const controlError = (request, response, error) => {
  if (/not running/.test(error.message)) {
    if (wantsHtml(request)) {
      response.writeHead(303, { Location: request.headers.referer || '/' });
      response.end();
      return;
    }
    json(response, 409, { error: error.message });
    return;
  }
  throw error;
};

const redirectAccessToken = (request, url) => (
  request.formBody?.access_token || url.searchParams.get('access_token') || ''
);

const redirectBackToSession = (request, response, url, sessionId) => {
  if (wantsHtml(request) || String(request.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) {
    response.writeHead(303, { Location: routeWithToken(`/sessions/${sessionId}`, redirectAccessToken(request, url)) });
    response.end();
    return true;
  }
  return false;
};

const readBodyByContentType = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (String(request.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  if (!raw.trim()) return {};
  return JSON.parse(raw);
};

export const createServer = ({
  store = createSessionStore(),
  runtime = createBrowserRuntime(),
  accessSecret = process.env.BROWSER_ACCESS_SECRET || '',
  internalApiToken = process.env.BROWSER_INTERNAL_API_TOKEN || '',
} = {}) => http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');

    if (request.method === 'GET' && url.pathname === '/health') {
      json(response, 200, { ok: true, service: 'browser-worker' });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/sessions') {
      if (!ensureInternalApiAccess(request, response, internalApiToken)) return;
      const body = await readJsonBody(request);
      const session = store.create({
        sourceId: body.sourceId || body.source_id || '',
        sourceName: body.sourceName || body.source_name || '',
        ownerName: body.ownerName || body.owner_name || '',
        loginUrl: body.loginUrl || body.login_url || '',
        createdAt: body.createdAt || body.created_at || '',
        updatedAt: body.updatedAt || body.updated_at || '',
        expiresAt: body.expiresAt || body.expires_at || '',
      });
      json(response, 201, session);
      return;
    }

    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)(?:\/(revoke))?$/);
    if (sessionMatch && request.method === 'GET' && !sessionMatch[2]) {
      const session = store.get(sessionMatch[1]);
      if (!session) {
        json(response, 404, { error: 'session not found' });
        return;
      }
      if (!await ensureSessionAccess(request, response, url, session, accessSecret)) return;
      respondSession(request, response, session, url.searchParams.get('access_token') || '');
      return;
    }

    if (sessionMatch && request.method === 'POST' && sessionMatch[2] === 'revoke') {
      if (!ensureInternalApiAccess(request, response, internalApiToken)) return;
      const session = store.revoke(sessionMatch[1]);
      if (!session) {
        json(response, 404, { error: 'session not found' });
        return;
      }
      json(response, 200, session);
      return;
    }

    const runtimeMatch = url.pathname.match(/^\/sessions\/([^/]+)\/(start|stop)$/);
    if (runtimeMatch && request.method === 'POST') {
      const session = store.get(runtimeMatch[1]);
      if (!session) {
        json(response, 404, { error: 'session not found' });
        return;
      }
      if (!await ensureSessionAccess(request, response, url, session, accessSecret)) return;
      const runtimePatch = runtimeMatch[2] === 'start'
        ? await runtime.start(session)
        : await runtime.stop(session.id);
      const updated = store.updateRuntime(session.id, runtimePatch);
      if (wantsHtml(request)) {
        response.writeHead(303, { Location: routeWithToken(`/sessions/${session.id}`, redirectAccessToken(request, url)) });
        response.end();
        return;
      }
      json(response, 200, updated);
      return;
    }

    const snapshotMatch = url.pathname.match(/^\/sessions\/([^/]+)\/snapshot$/);
    if (snapshotMatch && request.method === 'GET') {
      const session = store.get(snapshotMatch[1]);
      if (!session) {
        json(response, 404, { error: 'session not found' });
        return;
      }
      if (!await ensureSessionAccess(request, response, url, session, accessSecret)) return;
      try {
        const snapshot = await runtime.snapshot(session.id);
        sendBody(response, 200, snapshot.content_type, snapshot.data);
      } catch (error) {
        controlError(request, response, error);
      }
      return;
    }

    const controlMatch = url.pathname.match(/^\/sessions\/([^/]+)\/(navigate|click|type)$/);
    if (controlMatch && request.method === 'POST') {
      const session = store.get(controlMatch[1]);
      if (!session) {
        json(response, 404, { error: 'session not found' });
        return;
      }
      if (!await ensureSessionAccess(request, response, url, session, accessSecret)) return;
      try {
        const body = request.formBody || await readBodyByContentType(request);
        let runtimePatch;
        if (controlMatch[2] === 'navigate') {
          runtimePatch = await runtime.navigate(session.id, body.url || body.target_url || session.target_url);
        } else if (controlMatch[2] === 'click') {
          runtimePatch = await runtime.click(session.id, { x: body.x, y: body.y });
        } else {
          runtimePatch = await runtime.typeText(session.id, body.text || '');
        }
        const updated = store.updateRuntime(session.id, runtimePatch);
        if (redirectBackToSession(request, response, url, session.id)) return;
        json(response, 200, updated);
      } catch (error) {
        controlError(request, response, error);
      }
      return;
    }

    json(response, 404, { error: 'not found' });
  } catch (error) {
    json(response, 500, { error: error.message });
  }
});

const isMainModule = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMainModule) {
  const port = Number(process.env.BROWSER_WORKER_PORT || 8095);
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`[browser-worker] listening on ${port}`);
  });
}
