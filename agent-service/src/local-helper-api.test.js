import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalHelperApiServer } from './local-helper-api.js';
import { createInMemoryLocalHelperStore, hashSecret } from './local-helper-store.js';

const requestJson = async (baseUrl, path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
};

test('local helper cloud API pairs a device, lists owner tasks, and accepts observations', async () => {
  const store = createInMemoryLocalHelperStore({
    tokenFactory: () => 'token-xiaowei',
    now: () => new Date('2026-05-27T01:00:00.000Z'),
  });
  const pair = store.createPairCode({ code: 'ABCD1234', ownerName: '小魏' });
  store.addTask({
    id: 'task-huajin-1',
    sourceName: '华锦兵器网',
    ownerName: '小魏',
    taskType: 'local_helper',
    status: 'pending',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    searchTerms: '消泡剂,液氮',
  });
  store.addTask({
    id: 'task-other-owner',
    sourceName: '易派克',
    ownerName: '小冯',
    taskType: 'local_helper',
    status: 'pending',
    entryUrl: 'https://example.com/',
  });

  const server = createLocalHelperApiServer({ store, port: 0, host: '127.0.0.1' });
  await server.start();
  try {
    const baseUrl = server.url();
    const health = await requestJson(baseUrl, '/health');
    const paired = await requestJson(baseUrl, '/local-helper/pair', {
      method: 'POST',
      body: JSON.stringify({
        code: pair.code,
        deviceName: 'WX-PC-01',
        deviceFingerprint: 'fp-xw',
        helperVersion: '0.2.0',
        platform: 'win32',
      }),
    });
    const token = paired.body.token;
    const tasks = await requestJson(baseUrl, '/local-helper/tasks', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const started = await requestJson(baseUrl, '/local-helper/tasks/task-huajin-1/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const continued = await requestJson(baseUrl, '/local-helper/tasks/task-huajin-1/continue', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        observation: '页面出现账号登录和验证码，员工需要接管。',
        requestHuman: true,
        humanReason: '验证码',
        currentUrl: 'https://www.norincogroup-ebuy.com/',
      }),
    });

    assert.equal(health.body.ok, true);
    assert.equal(paired.status, 200);
    assert.equal(paired.body.device.ownerName, '小魏');
    assert.equal(tasks.body.tasks.length, 1);
    assert.equal(tasks.body.tasks[0].id, 'task-huajin-1');
    assert.equal(started.body.task.status, 'in_progress');
    assert.equal(continued.body.status, 'request_human');
    assert.equal(continued.body.nextAction.type, 'request_human');
  } finally {
    await server.stop();
  }
});

test('local helper cloud API rejects missing tokens and used pair codes', async () => {
  const store = createInMemoryLocalHelperStore({
    tokenFactory: () => 'token-xiaowei',
    now: () => new Date('2026-05-27T01:00:00.000Z'),
  });
  store.createPairCode({ code: 'USED1234', ownerName: '小魏' });
  const server = createLocalHelperApiServer({ store, port: 0, host: '127.0.0.1' });
  await server.start();
  try {
    const baseUrl = server.url();
    const first = await requestJson(baseUrl, '/local-helper/pair', {
      method: 'POST',
      body: JSON.stringify({ code: 'USED1234', deviceName: 'pc' }),
    });
    const second = await requestJson(baseUrl, '/local-helper/pair', {
      method: 'POST',
      body: JSON.stringify({ code: 'USED1234', deviceName: 'pc' }),
    });
    const unauthorized = await requestJson(baseUrl, '/local-helper/tasks');

    assert.equal(first.status, 200);
    assert.equal(second.status, 400);
    assert.match(second.body.error, /invalid or used/);
    assert.equal(unauthorized.status, 401);
  } finally {
    await server.stop();
  }
});

test('hashSecret is stable for storing only token and pair-code digests', () => {
  assert.equal(hashSecret('ABC'), hashSecret('ABC'));
  assert.notEqual(hashSecret('ABC'), 'ABC');
});
