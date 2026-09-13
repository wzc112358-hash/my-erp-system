import assert from 'node:assert/strict';
import test from 'node:test';

import { createBidApiServer } from './api-server.ts';
import { PocketBaseClient } from './pocketbase-client.ts';

test('API server only emits CORS headers for configured browser origins', async () => {
  const client = new PocketBaseClient({
    baseUrl: 'http://127.0.0.1:1',
    identity: '',
    password: '',
  });
  const server = createBidApiServer({
    client,
    host: '127.0.0.1',
    port: 0,
    env: { ERP_ALLOWED_ORIGINS: 'https://erp.henghuacheng.cn' },
  });

  await server.start();
  try {
    const allowed = await fetch(`${server.url()}/health`, {
      headers: { Origin: 'https://erp.henghuacheng.cn' },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://erp.henghuacheng.cn');

    const denied = await fetch(`${server.url()}/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://attacker.example' },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);

    const nonBrowser = await fetch(`${server.url()}/health`);
    assert.equal(nonBrowser.status, 200);
    assert.equal(nonBrowser.headers.get('access-control-allow-origin'), null);
  } finally {
    await server.stop();
  }
});
