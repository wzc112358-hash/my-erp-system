import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createBrowserSession,
  createSessionStore,
} from './session-manager.js';

const fixedNow = new Date('2026-05-26T01:00:00.000Z');

test('createBrowserSession builds a stable login-required session shape', () => {
  const session = createBrowserSession({
    sourceId: 'source_123',
    sourceName: '云梦泽询价网',
    ownerName: '小陈',
    loginUrl: 'https://ymz.example.com/login',
    publicBaseUrl: 'https://browser.example.com/',
    profileRoot: '/browser_profiles',
    now: fixedNow,
  });

  assert.match(session.id, /^session_[a-f0-9]{12}$/);
  assert.equal(session.source_id, 'source_123');
  assert.equal(session.source_name, '云梦泽询价网');
  assert.equal(session.owner_name, '小陈');
  assert.equal(session.status, 'login_required');
  assert.equal(session.login_url, 'https://ymz.example.com/login');
  assert.equal(session.target_url, 'https://ymz.example.com/login');
  assert.equal(session.browser_url, `https://browser.example.com/sessions/${session.id}`);
  assert.equal(session.profile_ref, `profiles/${session.id}`);
  assert.equal(session.profile_dir, `/browser_profiles/${session.id}`);
  assert.equal(session.runtime_status, 'stopped');
  assert.equal(session.created_at, '2026-05-26T01:00:00.000Z');
  assert.equal(session.updated_at, '2026-05-26T01:00:00.000Z');
  assert.equal(session.expires_at, '2026-06-02T01:00:00.000Z');
});

test('createBrowserSession returns deterministic ids for the same source', () => {
  const first = createBrowserSession({
    sourceId: 'source_123',
    sourceName: '云梦泽询价网',
    publicBaseUrl: 'https://browser.example.com',
    now: fixedNow,
  });
  const second = createBrowserSession({
    sourceId: 'source_123',
    sourceName: '云梦泽询价网',
    publicBaseUrl: 'https://browser.example.com',
    now: fixedNow,
  });

  assert.equal(first.id, second.id);
  assert.equal(first.profile_ref, second.profile_ref);
});

test('createSessionStore gets and revokes sessions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-sessions-'));
  const store = createSessionStore({
    publicBaseUrl: 'https://browser.example.com',
    profileRoot: path.join(dir, 'profiles'),
    sessionStorePath: path.join(dir, 'sessions.json'),
    now: () => fixedNow,
  });

  try {
    const created = store.create({
      sourceId: 'source_456',
      sourceName: '易派克',
      ownerName: '小冯',
      loginUrl: 'https://epec.example.com',
    });
    const loaded = store.get(created.id);
    const revoked = store.revoke(created.id, new Date('2026-05-26T02:00:00.000Z'));

    assert.deepEqual(loaded, created);
    assert.equal(revoked.status, 'revoked');
    assert.equal(revoked.runtime_status, 'stopped');
    assert.equal(revoked.updated_at, '2026-05-26T02:00:00.000Z');
    assert.equal(store.get(created.id).status, 'revoked');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createSessionStore updates runtime metadata for a session', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-sessions-'));
  const store = createSessionStore({
    publicBaseUrl: 'https://browser.example.com',
    profileRoot: path.join(dir, 'profiles'),
    sessionStorePath: path.join(dir, 'sessions.json'),
    now: () => fixedNow,
  });
  try {
    const created = store.create({
      sourceId: 'source_789',
      sourceName: '裕龙招投标网',
      loginUrl: 'https://yulong.example.com',
    });

    const updated = store.updateRuntime(created.id, {
      runtime_status: 'running',
      runtime_url: 'stub://session/session_123',
      target_url: 'https://yulong.example.com/notices',
    }, new Date('2026-05-26T03:00:00.000Z'));

    assert.equal(updated.runtime_status, 'running');
    assert.equal(updated.runtime_url, 'stub://session/session_123');
    assert.equal(updated.target_url, 'https://yulong.example.com/notices');
    assert.equal(updated.updated_at, '2026-05-26T03:00:00.000Z');
    assert.equal(store.get(created.id).runtime_status, 'running');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createSessionStore appends access token to browser url when secret is configured', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-sessions-'));
  const store = createSessionStore({
    publicBaseUrl: 'https://browser.example.com',
    profileRoot: path.join(dir, 'profiles'),
    sessionStorePath: path.join(dir, 'sessions.json'),
    accessSecret: 'secret',
    now: () => fixedNow,
  });

  try {
    const created = store.create({
      sourceId: 'source_secure',
      sourceName: '安全访问测试',
      loginUrl: 'https://example.com/login',
    });

    assert.match(created.browser_url, new RegExp(`^https://browser.example.com/sessions/${created.id}\\?access_token=[a-f0-9]{64}$`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createSessionStore persists sessions across store instances', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-sessions-'));
  try {
    const firstStore = createSessionStore({
      publicBaseUrl: 'https://browser.example.com',
      profileRoot: path.join(dir, 'profiles'),
      sessionStorePath: path.join(dir, 'sessions.json'),
      now: () => fixedNow,
    });
    const created = firstStore.create({
      sourceId: 'source_persisted',
      sourceName: '华锦兵器网',
      ownerName: '小魏',
      loginUrl: 'https://www.norincogroup-ebuy.com/',
    });
    firstStore.updateRuntime(created.id, {
      runtime_status: 'running',
      runtime_url: 'chrome-profile://session_persisted',
      last_error: 'navigation failed',
    }, new Date('2026-05-26T03:00:00.000Z'));

    const secondStore = createSessionStore({
      publicBaseUrl: 'https://browser.example.com',
      profileRoot: path.join(dir, 'profiles'),
      sessionStorePath: path.join(dir, 'sessions.json'),
      now: () => fixedNow,
    });
    const loaded = secondStore.get(created.id);

    assert.equal(loaded.id, created.id);
    assert.equal(loaded.source_name, '华锦兵器网');
    assert.equal(loaded.runtime_status, 'stopped');
    assert.equal(loaded.runtime_url, '');
    assert.equal(loaded.last_error, 'navigation failed');
    assert.equal(loaded.browser_url, created.browser_url);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createSessionStore preserves imported session timing for regenerated links', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-sessions-'));
  try {
    const store = createSessionStore({
      publicBaseUrl: 'https://browser.example.com',
      profileRoot: path.join(dir, 'profiles'),
      sessionStorePath: path.join(dir, 'sessions.json'),
      accessSecret: 'secret',
      now: () => fixedNow,
    });

    const created = store.create({
      sourceId: 'source_imported',
      sourceName: '旧链接重建',
      loginUrl: 'https://example.com/login',
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      expiresAt: '2026-05-30T00:00:00.000Z',
    });

    assert.equal(created.created_at, '2026-05-20T00:00:00.000Z');
    assert.equal(created.updated_at, '2026-05-21T00:00:00.000Z');
    assert.equal(created.expires_at, '2026-05-30T00:00:00.000Z');
    assert.match(created.browser_url, /access_token=[a-f0-9]{64}/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createSessionStore normalizes PocketBase timestamps for stable access tokens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-sessions-'));
  try {
    const store = createSessionStore({
      publicBaseUrl: 'https://browser.example.com',
      profileRoot: path.join(dir, 'profiles'),
      sessionStorePath: path.join(dir, 'sessions.json'),
      accessSecret: 'secret',
      now: () => fixedNow,
    });

    const created = store.create({
      sourceId: 'source_pb_timestamp',
      sourceName: 'PocketBase 日期',
      loginUrl: 'https://example.com/login',
      expiresAt: '2026-06-03 03:50:36.659Z',
    });

    assert.equal(created.expires_at, '2026-06-03T03:50:36.659Z');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
