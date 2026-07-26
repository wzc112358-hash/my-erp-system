import assert from 'node:assert/strict';
import test from 'node:test';

import { PocketBaseClient } from './pocketbase-client.ts';

const jwtWithExpiry = (expiresAtMs: number) => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expiresAtMs / 1_000) })).toString('base64url');
  return `${header}.${payload}.signature`;
};

test('refreshes an expired superuser token before a protected list silently becomes empty', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1_000_000;
  let authCalls = 0;
  let activeToken = '';

  Date.now = () => now;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/_superusers/auth-with-password')) {
      authCalls += 1;
      activeToken = jwtWithExpiry(now + 120_000);
      return new Response(JSON.stringify({ token: activeToken }), { status: 200 });
    }
    const authorization = new Headers(init?.headers).get('Authorization') || '';
    const tokenIsCurrent = authorization === `Bearer ${activeToken}`;
    const tokenExpiresAt = Number(JSON.parse(Buffer.from(activeToken.split('.')[1] || '', 'base64url').toString()).exp) * 1_000;
    const items = tokenIsCurrent && now < tokenExpiresAt ? [{ id: 'notice-1' }] : [];
    return new Response(JSON.stringify({ items, totalPages: 1 }), { status: 200 });
  }) as typeof fetch;

  try {
    const client = new PocketBaseClient({ baseUrl: 'https://pocketbase.test', identity: 'admin', password: 'secret' });
    assert.equal((await client.listAll('bid_notices')).length, 1);

    now += 121_000;

    assert.equal((await client.listAll('bid_notices')).length, 1);
    assert.equal(authCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
