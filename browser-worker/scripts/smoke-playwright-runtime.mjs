import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createBrowserRuntime } from '../src/browser-runtime.js';
import { createServer } from '../src/server.js';
import { createSessionStore } from '../src/session-manager.js';

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

const postJson = async (url, body = {}) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.ok(response.ok, `${url} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};

const main = async () => {
  const accessSecret = process.env.BROWSER_ACCESS_SECRET || 'local-smoke-secret';
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'erp-browser-smoke-'));
  const store = createSessionStore({
    publicBaseUrl: 'http://127.0.0.1:0',
    profileRoot,
    accessSecret,
  });
  const runtime = createBrowserRuntime({ mode: 'playwright', headless: true });
  const server = createServer({ store, runtime, accessSecret });
  const address = await listen(server);
  const baseUrl = `http://${address.address}:${address.port}`;

  try {
    const created = await postJson(`${baseUrl}/sessions`, {
      sourceId: 'smoke-source',
      sourceName: 'Playwright Smoke',
      ownerName: 'Codex',
      loginUrl: 'data:text/html,<html><body><input autofocus id="q"><main>initial smoke page</main></body></html>',
    });
    const token = new URL(created.browser_url).searchParams.get('access_token');
    assert.ok(token, 'created browser_url should include an access token');

    const protectedUrl = (pathName) => `${baseUrl}${pathName}?access_token=${token}`;
    const started = await postJson(protectedUrl(`/sessions/${created.id}/start`));
    assert.equal(started.runtime_status, 'running');

    const firstSnapshot = await fetch(protectedUrl(`/sessions/${created.id}/snapshot`));
    assert.equal(firstSnapshot.status, 200);
    assert.match(firstSnapshot.headers.get('content-type'), /image\/png/);
    assert.ok((await firstSnapshot.arrayBuffer()).byteLength > 1000, 'first screenshot should not be empty');

    const html = '<html><body><h1>Second smoke page</h1><input autofocus id="q"></body></html>';
    const navigated = await postJson(protectedUrl(`/sessions/${created.id}/navigate`), {
      url: `data:text/html,${encodeURIComponent(html)}`,
    });
    assert.equal(navigated.runtime_status, 'running');
    assert.match(navigated.last_action, /navigate/);

    const typed = await postJson(protectedUrl(`/sessions/${created.id}/type`), {
      text: 'hello smoke',
    });
    assert.equal(typed.last_action, 'type hello smoke');

    const secondSnapshot = await fetch(protectedUrl(`/sessions/${created.id}/snapshot`));
    assert.equal(secondSnapshot.status, 200);
    assert.ok((await secondSnapshot.arrayBuffer()).byteLength > 1000, 'second screenshot should not be empty');

    const stopped = await postJson(protectedUrl(`/sessions/${created.id}/stop`));
    assert.equal(stopped.runtime_status, 'stopped');
    console.log(JSON.stringify({
      ok: true,
      session_id: created.id,
      profile_root: profileRoot,
      screenshot_content_type: firstSnapshot.headers.get('content-type'),
    }, null, 2));
  } finally {
    await runtime.stop(store.list()[0]?.id || '').catch(() => {});
    await close(server);
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
