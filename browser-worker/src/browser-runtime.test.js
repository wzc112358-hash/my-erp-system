import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPersistentContextOptions, createBrowserRuntime } from './browser-runtime.js';

const session = {
  id: 'session_abc123',
  login_url: 'https://example.com/login',
  target_url: 'https://example.com/login',
  profile_dir: '/browser_profiles/session_abc123',
};

test('stub runtime starts a deterministic browser session', async () => {
  const runtime = createBrowserRuntime({ mode: 'stub' });

  const started = await runtime.start(session);

  assert.equal(started.runtime_status, 'running');
  assert.equal(started.runtime_url, 'stub://browser/session_abc123');
  assert.equal(started.target_url, 'https://example.com/login');
  assert.equal(runtime.isRunning(session.id), true);
});

test('stub runtime reuses a running session', async () => {
  const runtime = createBrowserRuntime({ mode: 'stub' });

  const first = await runtime.start(session);
  const second = await runtime.start({
    ...session,
    target_url: 'https://example.com/changed',
  });

  assert.deepEqual(second, first);
});

test('stub runtime stops a running session', async () => {
  const runtime = createBrowserRuntime({ mode: 'stub' });
  await runtime.start(session);

  const stopped = await runtime.stop(session.id);

  assert.equal(stopped.runtime_status, 'stopped');
  assert.equal(stopped.runtime_url, '');
  assert.equal(runtime.isRunning(session.id), false);
});

test('stub runtime returns stopped for unknown sessions', async () => {
  const runtime = createBrowserRuntime({ mode: 'stub' });

  const stopped = await runtime.stop('session_missing');

  assert.equal(stopped.runtime_status, 'stopped');
  assert.equal(stopped.runtime_url, '');
});

test('stub runtime returns a deterministic snapshot for a running session', async () => {
  const runtime = createBrowserRuntime({ mode: 'stub' });
  await runtime.start(session);

  const snapshot = await runtime.snapshot(session.id);

  assert.equal(snapshot.content_type, 'image/svg+xml');
  assert.match(snapshot.data, /session_abc123/);
  assert.match(snapshot.data, /https:\/\/example.com\/login/);
});

test('stub runtime navigates a running session', async () => {
  const runtime = createBrowserRuntime({ mode: 'stub' });
  await runtime.start(session);

  const result = await runtime.navigate(session.id, 'https://example.com/notices');
  const snapshot = await runtime.snapshot(session.id);

  assert.equal(result.runtime_status, 'running');
  assert.equal(result.target_url, 'https://example.com/notices');
  assert.match(snapshot.data, /https:\/\/example.com\/notices/);
});

test('stub runtime records click and type actions', async () => {
  const runtime = createBrowserRuntime({ mode: 'stub' });
  await runtime.start(session);

  const click = await runtime.click(session.id, { x: 120, y: 80 });
  const type = await runtime.typeText(session.id, '验证码1234');
  const snapshot = await runtime.snapshot(session.id);

  assert.equal(click.last_action, 'click 120,80');
  assert.equal(type.last_action, 'type 验证码1234');
  assert.match(snapshot.data, /type 验证码1234/);
});

test('stub runtime rejects control actions before start', async () => {
  const runtime = createBrowserRuntime({ mode: 'stub' });

  await assert.rejects(
    () => runtime.snapshot(session.id),
    /browser session is not running/,
  );
  await assert.rejects(
    () => runtime.navigate(session.id, 'https://example.com'),
    /browser session is not running/,
  );
});

test('playwright launch options include an explicit browser executable when configured', () => {
  const options = buildPersistentContextOptions({
    headless: false,
    executablePath: '/usr/bin/google-chrome',
  });

  assert.equal(options.headless, false);
  assert.equal(options.executablePath, '/usr/bin/google-chrome');
  assert.deepEqual(options.viewport, { width: 1366, height: 900 });
});
