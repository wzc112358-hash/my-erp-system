import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createLocalApiServer, resolveRuntimeDirs } from './local-api.ts';
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
    if (request.url === '/local-helper/heartbeat') {
      response.end(JSON.stringify({
        ok: true,
        release: {
          latestVersion: '0.2.0',
          updateAvailable: true,
          portableUrl: 'https://erp.example.com/downloads/hcz-local-helper-app.zip',
        },
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

test('local API start rejects when the configured port is already in use', async () => {
  const occupied = createLocalApiServer({ store: createTaskStore(), port: 0 });
  await occupied.start();
  try {
    const occupiedUrl = new URL(occupied.url());
    const blocked = createLocalApiServer({
      store: createTaskStore(),
      port: Number(occupiedUrl.port),
    });

    await assert.rejects(
      blocked.start(),
      (error) => error instanceof Error && 'code' in error && error.code === 'EADDRINUSE',
    );
  } finally {
    await occupied.stop();
  }
});

test('local API defaults browser profile and artifacts to the user data directory', () => {
  const dirs = resolveRuntimeDirs({
    sourceName: '华锦兵器网',
  }, {
    LOCALAPPDATA: 'C:\\Users\\wzc\\AppData\\Local',
  });

  assert.equal(
    dirs.profileDir,
    path.join('C:\\Users\\wzc\\AppData\\Local', 'HengHuaChengLocalHelper', 'profiles', '华锦兵器网'),
  );
  assert.equal(
    dirs.screenshotDir,
    path.join('C:\\Users\\wzc\\AppData\\Local', 'HengHuaChengLocalHelper', 'artifacts'),
  );
  assert.doesNotMatch(dirs.profileDir, /^profiles[\\/]/);
});

test('local API runtime directories preserve explicit env overrides', () => {
  const dirs = resolveRuntimeDirs({
    sourceName: '华锦兵器网',
  }, {
    LOCALAPPDATA: 'C:\\Users\\wzc\\AppData\\Local',
    HCZ_LOCAL_HELPER_PROFILE_DIR: 'D:\\hcz-profile',
    HCZ_LOCAL_HELPER_ARTIFACT_DIR: 'D:\\hcz-artifacts',
  });

  assert.equal(dirs.profileDir, 'D:\\hcz-profile');
  assert.equal(dirs.screenshotDir, 'D:\\hcz-artifacts');
});

test('local API serves fallback renderer pages for browser-based helper UI', async () => {
  const rendererDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcz-renderer-'));
  await fs.writeFile(path.join(rendererDir, 'pair.html'), '<!doctype html><script src="./pair.js"></script>', 'utf8');
  await fs.writeFile(path.join(rendererDir, 'pair.js'), 'window.__pair = true;', 'utf8');
  await fs.writeFile(path.join(rendererDir, 'tasks.html'), '<!doctype html><script src="./tasks.js"></script>', 'utf8');
  await fs.writeFile(path.join(rendererDir, 'tasks.js'), 'window.__tasks = true;', 'utf8');

  const server = createLocalApiServer({
    store: createTaskStore(),
    port: 0,
    rendererDir,
  });
  await server.start();
  try {
    const baseUrl = server.url();
    const pair = await fetch(`${baseUrl}/ui/pair`);
    const pairScript = await fetch(`${baseUrl}/ui/pair.js`);
    const tasks = await fetch(`${baseUrl}/ui/tasks`);

    assert.equal(pair.status, 200);
    assert.match(await pair.text(), /pair\.js/);
    assert.equal(pairScript.headers.get('content-type'), 'application/javascript; charset=utf-8');
    assert.match(await pairScript.text(), /__pair/);
    assert.match(await tasks.text(), /tasks\.js/);
  } finally {
    await server.stop();
    await fs.rm(rendererDir, { recursive: true, force: true });
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
    const heartbeat = await requestJson(baseUrl, '/cloud/heartbeat', { method: 'POST' });
    const tasks = await requestJson(baseUrl, '/cloud/tasks');
    const started = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/start', { method: 'POST' });
    const continued = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/continue', {
      method: 'POST',
      body: JSON.stringify({ observation: '验证码，需要人工接管。', requestHuman: true }),
    });

    assert.equal(pair.body.paired, true);
    assert.equal(heartbeat.body.release.updateAvailable, true);
    assert.equal(tasks.body.tasks.length, 1);
    assert.equal((await requestJson(baseUrl, '/health')).body.latestRelease.updateAvailable, true);
    assert.equal(tasks.body.tasks[0].sourceName, '华锦兵器网');
    assert.equal(started.body.run.id, 'run-1');
    assert.equal(continued.body.nextAction.type, 'request_human');
    assert.ok(cloud.calls.some((call) => call.authorization === 'Bearer cloud-token-xiaowei'));
  } finally {
    await server.stop();
    await cloud.stop();
  }
});

test('local API continue-run resumes the local browser task and updates task details', async () => {
  const cloud = createMockCloudServer();
  await cloud.start();
  const store = createTaskStore();
  const server = createLocalApiServer({
    store,
    port: 0,
    continueTaskAfterHuman: async ({ task, cloud: taskCloud }) => {
      await taskCloud.continue(task.id, {
        status: 'completed',
        observation: '员工已完成验证码，页面展示采购公告列表。',
        action: 'continue_after_human',
        screenshotPath: '/tmp/hcz-artifacts/task.png',
      });
      return {
        status: 'completed',
        observation: {
          title: '采购公告列表',
          url: task.entryUrl,
          visibleText: '员工已完成验证码，页面展示采购公告列表。',
          screenshotPath: '/tmp/hcz-artifacts/task.png',
        },
      };
    },
  });
  await server.start();
  try {
    const baseUrl = server.url();
    const cloudUrl = cloud.url();

    await requestJson(baseUrl, '/cloud/pair', {
      method: 'POST',
      body: JSON.stringify({
        cloudUrl,
        code: 'ABCD1234',
        deviceName: 'WX-PC-01',
        deviceFingerprint: 'fp-xw',
      }),
    });
    await requestJson(baseUrl, '/cloud/tasks');
    const continued = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/continue-run', {
      method: 'POST',
    });
    const tasks = await requestJson(baseUrl, '/tasks');

    assert.equal(continued.body.status, 'completed');
    assert.equal(tasks.body.tasks[0].status, 'waiting_agent');
    assert.equal(tasks.body.tasks[0].lastObservation, '员工已完成验证码，页面展示采购公告列表。');
    assert.equal(tasks.body.tasks[0].lastScreenshotPath, '/tmp/hcz-artifacts/task.png');
  } finally {
    await server.stop();
    await cloud.stop();
  }
});
