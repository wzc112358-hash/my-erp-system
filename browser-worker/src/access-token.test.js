import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendAccessToken,
  createAccessToken,
  isAccessProtectionEnabled,
  verifyAccessToken,
} from './access-token.js';

const session = {
  id: 'session_abc123',
  expires_at: '2026-06-02T01:00:00.000Z',
};

test('isAccessProtectionEnabled requires a non-empty secret', () => {
  assert.equal(isAccessProtectionEnabled(''), false);
  assert.equal(isAccessProtectionEnabled('   '), false);
  assert.equal(isAccessProtectionEnabled('secret'), true);
});

test('createAccessToken returns a deterministic hmac token', () => {
  const first = createAccessToken(session, 'secret');
  const second = createAccessToken(session, 'secret');
  const changed = createAccessToken({ ...session, expires_at: '2026-06-03T01:00:00.000Z' }, 'secret');

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test('verifyAccessToken validates expected token and allows disabled protection', () => {
  const token = createAccessToken(session, 'secret');

  assert.equal(verifyAccessToken(session, token, 'secret'), true);
  assert.equal(verifyAccessToken(session, 'bad-token', 'secret'), false);
  assert.equal(verifyAccessToken(session, '', ''), true);
});

test('appendAccessToken adds access_token only when protection is enabled', () => {
  const protectedUrl = appendAccessToken('https://browser.example.com/sessions/session_abc123', session, 'secret');
  const openUrl = appendAccessToken('https://browser.example.com/sessions/session_abc123', session, '');

  assert.match(protectedUrl, /access_token=[a-f0-9]{64}/);
  assert.equal(openUrl, 'https://browser.example.com/sessions/session_abc123');
});
