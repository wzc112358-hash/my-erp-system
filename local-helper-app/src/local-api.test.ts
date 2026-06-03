import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createLocalApiServer } from './local-api.ts';
import { createTaskStore } from './task-store.ts';

const requestJson = async (baseUrl: string, path: string, options: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
};

const createMockCloudServer = () => {
  const calls: Array<{ method: string; url: string; authorization: string }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls.push({
      method: request.method || '',
      url: request.url || '',
      authorization: String(request.headers.authorization || ''),
    });
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (request.url === '/local-helper/pair') {
      response.end(JSON.stringify({
        paired: true,
        token: 'cloud-token-xiaowei',
        device: { id: 'device-1', ownerName: '小魏', deviceName: 'WX-PC-01' },
      }));
      return;
    }
    if (request.url === '/local-helper/tasks') {
      response.end(JSON.stringify({
        tasks: [{
          id: 'cloud-task-huajin',
          sourceName: '华锦兵器网',
          ownerName: '小魏',
          entryUrl: 'https://www.norincogroup-ebuy.com/',
          searchTerms: '液氮,消泡剂',
          status: 'pending',
        }],
      }));
      return;
    }
    if (request.url === '/local-helper/tasks/cloud-task-huajin/start') {
      response.end(JSON.stringify({
        task: { id: 'cloud-task-huajin', status: 'in_progress' },
        run: { id: 'run-1' },
      }));
      return;
    }
    if (request.url === '/local-helper/tasks/cloud-task-huajin/continue') {
      response.end(JSON.stringify({
        status: 'request_human',
        nextAction: { type: 'request_human', reason: '验证码' },
      }));
      return;
    }
    response.end(JSON.stringify({ ok: true }));
  });

  return {
    calls,
    start: () => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve())),
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    url: () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('mock cloud not listening');
      return `http://127.0.0.1:${address.port}`;
    },
  };
};

test('local API exposes health, pair, tasks, and lifecycle endpoints', async () => {
  const store = createTaskStore();
  store.addTask({
    id: 'task-huajin-1',
    sourceName: '华锦兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    status: 'pending',
  });
  const server = createLocalApiServer({ store, port: 0 });
  await server.start();
  try {
    const baseUrl = server.url();

    const health = await requestJson(baseUrl, '/health');
    const pair = await requestJson(baseUrl, '/pair', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: '小魏' }),
    });
    const tasks = await requestJson(baseUrl, '/tasks');
    const started = await requestJson(baseUrl, '/tasks/task-huajin-1/start', { method: 'POST' });
    const continued = await requestJson(baseUrl, '/tasks/task-huajin-1/continue', {
      method: 'POST',
      body: JSON.stringify({ observation: '已登录，当前页面展示采购公告列表。' }),
    });

    assert.equal(health.body.ok, true);
    assert.equal(pair.body.paired, true);
    assert.equal(tasks.body.tasks.length, 1);
    assert.equal(started.body.status, 'running');
    assert.equal(continued.body.status, 'waiting_agent');
    assert.equal(continued.body.lastObservation, '已登录，当前页面展示采购公告列表。');
  } finally {
    await server.stop();
  }
});

test('local API bridges cloud pairing and task channel endpoints', async () => {
  const cloud = createMockCloudServer();
  await cloud.start();
  const store = createTaskStore();
  const server = createLocalApiServer({ store, port: 0 });
  await server.start();
  try {
    const baseUrl = server.url();
    const cloudUrl = cloud.url();

    const pair = await requestJson(baseUrl, '/cloud/pair', {
      method: 'POST',
      body: JSON.stringify({
        cloudUrl,
        code: 'ABCD1234',
        deviceName: 'WX-PC-01',
        deviceFingerprint: 'fp-xw',
      }),
    });
    const tasks = await requestJson(baseUrl, '/cloud/tasks');
    const started = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/start', { method: 'POST' });
    const continued = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/continue', {
      method: 'POST',
      body: JSON.stringify({ observation: '验证码，需要人工接管。', requestHuman: true }),
    });

    assert.equal(pair.body.paired, true);
    assert.equal(tasks.body.tasks.length, 1);
    assert.equal(tasks.body.tasks[0].sourceName, '华锦兵器网');
    assert.equal(started.body.run.id, 'run-1');
    assert.equal(continued.body.nextAction.type, 'request_human');
    assert.ok(cloud.calls.some((call) => call.authorization === 'Bearer cloud-token-xiaowei'));
  } finally {
    await server.stop();
    await cloud.stop();
  }
});
