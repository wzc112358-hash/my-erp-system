import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from './server.js';
import { createBrowserRuntime } from './browser-runtime.js';
import { createSessionStore } from './session-manager.js';

const listen = async (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    server.off('error', reject);
    resolve(server.address());
  });
});

const close = async (server) => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

const withServer = async (fn, options = {}) => {
  const store = createSessionStore({
    publicBaseUrl: 'https://browser.example.com',
    accessSecret: options.accessSecret || '',
    now: () => new Date('2026-05-26T01:00:00.000Z'),
  });
  const runtime = createBrowserRuntime({ mode: 'stub' });
  const server = createServer({
    store,
    runtime,
    accessSecret: options.accessSecret || '',
    internalApiToken: options.internalApiToken || '',
  });
  const address = await listen(server);
  try {
    return await fn(`http://${address.address}:${address.port}`);
  } finally {
    await close(server);
  }
};

test('GET /health returns service health', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, service: 'browser-worker' });
  });
});

test('internal session creation requires API token when configured', async () => {
  await withServer(async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_123', sourceName: '云梦泽询价网' }),
    });
    const wrong = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-token',
      },
      body: JSON.stringify({ sourceId: 'source_123', sourceName: '云梦泽询价网' }),
    });
    const allowed = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer internal-secret',
      },
      body: JSON.stringify({ sourceId: 'source_123', sourceName: '云梦泽询价网' }),
    });

    assert.equal(denied.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(allowed.status, 201);
  }, { internalApiToken: 'internal-secret' });
});

test('POST /sessions creates a session and GET /sessions/:id loads it', async () => {
  await withServer(async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_123',
        sourceName: '云梦泽询价网',
        ownerName: '小陈',
        loginUrl: 'https://ymz.example.com/login',
      }),
    });
    const created = await createdResponse.json();
    const loadedResponse = await fetch(`${baseUrl}/sessions/${created.id}`);
    const loaded = await loadedResponse.json();

    assert.equal(createdResponse.status, 201);
    assert.equal(created.status, 'login_required');
    assert.equal(created.browser_url, `https://browser.example.com/sessions/${created.id}`);
    assert.equal(loadedResponse.status, 200);
    assert.deepEqual(loaded, created);
  });
});

test('GET /sessions/:id returns an employee operation page for html requests', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_123',
        sourceName: '云梦泽询价网',
        ownerName: '小陈',
        loginUrl: 'https://ymz.example.com/login',
      }),
    })).json();

    const response = await fetch(`${baseUrl}/sessions/${created.id}`, {
      headers: { Accept: 'text/html' },
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(html, /云梦泽询价网/);
    assert.match(html, /打开网站/);
    assert.match(html, /data-session-id="session_/);
    assert.match(html, /浏览器截图/);
    assert.match(html, new RegExp(`/sessions/${created.id}/snapshot`));
    assert.match(html, new RegExp(`/sessions/${created.id}/navigate`));
    assert.match(html, new RegExp(`/sessions/${created.id}/click`));
    assert.match(html, new RegExp(`/sessions/${created.id}/type`));
  });
});

test('POST /sessions/:id/start starts runtime and updates session metadata', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_789', sourceName: '裕龙招投标网', loginUrl: 'https://yulong.example.com' }),
    })).json();

    const response = await fetch(`${baseUrl}/sessions/${created.id}/start`, { method: 'POST' });
    const started = await response.json();

    assert.equal(response.status, 200);
    assert.equal(started.runtime_status, 'running');
    assert.equal(started.runtime_url, `stub://browser/${created.id}`);
    assert.equal(started.target_url, 'https://yulong.example.com');
  });
});

test('POST /sessions/:id/stop stops runtime and updates session metadata', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_789', sourceName: '裕龙招投标网', loginUrl: 'https://yulong.example.com' }),
    })).json();
    await fetch(`${baseUrl}/sessions/${created.id}/start`, { method: 'POST' });

    const response = await fetch(`${baseUrl}/sessions/${created.id}/stop`, { method: 'POST' });
    const stopped = await response.json();

    assert.equal(response.status, 200);
    assert.equal(stopped.runtime_status, 'stopped');
    assert.equal(stopped.runtime_url, '');
  });
});

test('GET /sessions/:id/snapshot returns the current browser screenshot', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_789', sourceName: '裕龙招投标网', loginUrl: 'https://yulong.example.com' }),
    })).json();
    await fetch(`${baseUrl}/sessions/${created.id}/start`, { method: 'POST' });

    const response = await fetch(`${baseUrl}/sessions/${created.id}/snapshot`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(body, /https:\/\/yulong.example.com/);
  });
});

test('POST /sessions/:id/navigate updates the running target url', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_789', sourceName: '裕龙招投标网', loginUrl: 'https://yulong.example.com' }),
    })).json();
    await fetch(`${baseUrl}/sessions/${created.id}/start`, { method: 'POST' });

    const response = await fetch(`${baseUrl}/sessions/${created.id}/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://yulong.example.com/notices' }),
    });
    const updated = await response.json();

    assert.equal(response.status, 200);
    assert.equal(updated.target_url, 'https://yulong.example.com/notices');
    assert.match(updated.last_action, /navigate/);
  });
});

test('POST /sessions/:id/click and /type send control actions to runtime', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_789', sourceName: '裕龙招投标网', loginUrl: 'https://yulong.example.com' }),
    })).json();
    await fetch(`${baseUrl}/sessions/${created.id}/start`, { method: 'POST' });

    const click = await (await fetch(`${baseUrl}/sessions/${created.id}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 120, y: 80 }),
    })).json();
    const type = await (await fetch(`${baseUrl}/sessions/${created.id}/type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '验证码1234' }),
    })).json();

    assert.equal(click.last_action, 'click 120,80');
    assert.equal(type.last_action, 'type 验证码1234');
  });
});

test('control routes return 409 before a session is started', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_789', sourceName: '裕龙招投标网', loginUrl: 'https://yulong.example.com' }),
    })).json();

    const response = await fetch(`${baseUrl}/sessions/${created.id}/snapshot`);
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /not running/);
  });
});

test('POST /sessions/:id/revoke revokes an existing session', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_456', sourceName: '易派克' }),
    })).json();
    const revokedResponse = await fetch(`${baseUrl}/sessions/${created.id}/revoke`, { method: 'POST' });
    const revoked = await revokedResponse.json();

    assert.equal(revokedResponse.status, 200);
    assert.equal(revoked.id, created.id);
    assert.equal(revoked.status, 'revoked');
  });
});

test('GET /sessions/:id returns 404 for missing sessions', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/sessions/session_missing`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, 'session not found');
  });
});

test('protected employee routes return 403 without access token', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_secure', sourceName: '安全访问测试', loginUrl: 'https://example.com' }),
    })).json();

    const paths = [
      { method: 'GET', path: `/sessions/${created.id}`, headers: { Accept: 'text/html' } },
      { method: 'GET', path: `/sessions/${created.id}/snapshot` },
      { method: 'POST', path: `/sessions/${created.id}/start` },
      { method: 'POST', path: `/sessions/${created.id}/stop` },
      { method: 'POST', path: `/sessions/${created.id}/navigate`, body: { url: 'https://example.com/a' } },
      { method: 'POST', path: `/sessions/${created.id}/click`, body: { x: 1, y: 2 } },
      { method: 'POST', path: `/sessions/${created.id}/type`, body: { text: 'abc' } },
    ];

    for (const item of paths) {
      const response = await fetch(`${baseUrl}${item.path}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...(item.headers || {}),
        },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      assert.equal(response.status, 403, item.path);
    }
  }, { accessSecret: 'secret' });
});

test('protected employee routes accept signed access token', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_secure', sourceName: '安全访问测试', loginUrl: 'https://example.com' }),
    })).json();
    const token = new URL(created.browser_url).searchParams.get('access_token');
    const protectedUrl = (path) => `${baseUrl}${path}?access_token=${token}`;

    const page = await fetch(protectedUrl(`/sessions/${created.id}`), { headers: { Accept: 'text/html' } });
    const started = await fetch(protectedUrl(`/sessions/${created.id}/start`), { method: 'POST' });
    const snapshot = await fetch(protectedUrl(`/sessions/${created.id}/snapshot`));
    const navigate = await fetch(protectedUrl(`/sessions/${created.id}/navigate`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/notices' }),
    });

    assert.equal(page.status, 200);
    assert.equal(started.status, 200);
    assert.equal(snapshot.status, 200);
    assert.equal(navigate.status, 200);
  }, { accessSecret: 'secret' });
});

test('protected operation page preserves access token in forms and snapshot url', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_secure', sourceName: '安全访问测试', loginUrl: 'https://example.com' }),
    })).json();
    const token = new URL(created.browser_url).searchParams.get('access_token');

    const response = await fetch(`${baseUrl}/sessions/${created.id}?access_token=${token}`, {
      headers: { Accept: 'text/html' },
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, new RegExp(`/sessions/${created.id}/snapshot\\?access_token=${token}`));
    assert.match(html, new RegExp(`<input type="hidden" name="access_token" value="${token}">`));
    assert.match(html, new RegExp(`/sessions/${created.id}/navigate`));
    assert.match(html, new RegExp(`/sessions/${created.id}/click`));
    assert.match(html, new RegExp(`/sessions/${created.id}/type`));
  }, { accessSecret: 'secret' });
});

test('protected html control redirects preserve the access token', async () => {
  await withServer(async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'source_secure', sourceName: '安全访问测试', loginUrl: 'https://example.com' }),
    })).json();
    const token = new URL(created.browser_url).searchParams.get('access_token');

    const start = await fetch(`${baseUrl}/sessions/${created.id}/start`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Accept: 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ access_token: token }),
    });
    const navigate = await fetch(`${baseUrl}/sessions/${created.id}/navigate`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Accept: 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ access_token: token, url: 'https://example.com/notices' }),
    });

    assert.equal(start.status, 303);
    assert.equal(start.headers.get('location'), `/sessions/${created.id}?access_token=${token}`);
    assert.equal(navigate.status, 303);
    assert.equal(navigate.headers.get('location'), `/sessions/${created.id}?access_token=${token}`);
  }, { accessSecret: 'secret' });
});
