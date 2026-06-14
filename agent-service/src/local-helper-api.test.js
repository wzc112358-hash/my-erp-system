import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalHelperApiServer } from './local-helper-api.js';
import {
  buildLocalHelperReleaseInfo,
  compareVersions,
  createInMemoryLocalHelperStore,
  createPocketBaseLocalHelperStore,
  hashSecret,
} from './local-helper-store.js';

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

test('local helper release info marks update prompts from semantic versions', () => {
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1);
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('0.1.0', '0.2.0'), -1);

  const release = buildLocalHelperReleaseInfo({
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    minSupportedVersion: '0.1.0',
    downloadBaseUrl: 'https://erp.example.com/downloads',
  });

  assert.equal(release.updateAvailable, true);
  assert.equal(release.updateRequired, false);
  assert.equal(release.portableUrl, 'https://erp.example.com/downloads/hcz-local-helper-app.zip');
  assert.equal(release.installerUrl, 'https://erp.example.com/downloads/hcz-local-helper-setup.exe');
});

test('local helper cloud API exposes release manifest and heartbeat update hints', async () => {
  const store = createInMemoryLocalHelperStore({
    tokenFactory: () => 'token-xiaowei',
    now: () => new Date('2026-06-14T01:00:00.000Z'),
  });
  const pair = store.createPairCode({ code: 'REL12345', ownerName: '小魏' });
  const server = createLocalHelperApiServer({ store, port: 0, host: '127.0.0.1' });
  await server.start();
  try {
    const baseUrl = server.url();
    const release = await requestJson(baseUrl, '/local-helper/release?currentVersion=0.0.1');
    const paired = await requestJson(baseUrl, '/local-helper/pair', {
      method: 'POST',
      body: JSON.stringify({ code: pair.code, deviceName: 'WX-PC-01', helperVersion: '0.0.1' }),
    });
    const heartbeat = await requestJson(baseUrl, '/local-helper/heartbeat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paired.body.token}` },
      body: JSON.stringify({ helperVersion: '0.0.1', platform: 'win32' }),
    });

    assert.equal(release.status, 200);
    assert.match(release.body.portableUrl, /hcz-local-helper-app\.zip$/);
    assert.equal(heartbeat.body.ok, true);
    assert.equal(typeof heartbeat.body.release.updateAvailable, 'boolean');
  } finally {
    await server.stop();
  }
});

test('local helper cloud API ingests completed candidate bundle and finishes the agent task', async () => {
  const ingestions = [];
  const store = createInMemoryLocalHelperStore({
    tokenFactory: () => 'token-xiaowei',
    now: () => new Date('2026-06-12T01:00:00.000Z'),
    ingestCandidateBundle: async (input) => {
      ingestions.push(input);
      return { rawCount: 1, processedCount: 1, createdCount: 1 };
    },
  });
  const pair = store.createPairCode({ code: 'BUNDLE12', ownerName: '小魏' });
  store.addTask({
    id: 'task-huajin-1',
    sourceId: 'source-huajin',
    sourceName: '华锦兵器网',
    ownerName: '小魏',
    taskType: 'local_helper',
    status: 'pending',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    searchTerms: '消泡剂',
  });

  const server = createLocalHelperApiServer({ store, port: 0, host: '127.0.0.1' });
  await server.start();
  try {
    const baseUrl = server.url();
    const paired = await requestJson(baseUrl, '/local-helper/pair', {
      method: 'POST',
      body: JSON.stringify({ code: pair.code, deviceName: 'WX-PC-01' }),
    });
    const token = paired.body.token;
    await requestJson(baseUrl, '/local-helper/tasks/task-huajin-1/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const continued = await requestJson(baseUrl, '/local-helper/tasks/task-huajin-1/continue', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: 'completed',
        currentUrl: 'https://www.norincogroup-ebuy.com/list',
        observation: '已提取 1 条公告。',
        action: 'continue_after_human',
        screenshotPath: '/tmp/hcz-artifacts/task-huajin-1.png',
        log: '员工完成验证码后继续采集。',
        candidateBundle: {
          source_name: '华锦兵器网',
          candidates: [{
            title: '华锦化工消泡剂采购询价公告',
            url: 'https://example.com/notices/1',
            raw_text: '采购消泡剂，截止 2026-06-10。',
            attachments: [],
          }],
        },
      }),
    });
    const tasks = await requestJson(baseUrl, '/local-helper/tasks', {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(continued.status, 200);
    assert.equal(continued.body.ingestion.createdCount, 1);
    assert.equal(ingestions.length, 1);
    assert.equal(ingestions[0].task.id, 'task-huajin-1');
    assert.equal(ingestions[0].candidateBundle.candidates.length, 1);
    assert.equal(tasks.body.tasks.length, 0);
    const artifacts = store.debugState().artifacts;
    assert.equal(artifacts.some((item) => item.artifactType === 'candidate_bundle'), true);
    assert.equal(artifacts.some((item) => item.artifactType === 'screenshot'), true);
    assert.equal(artifacts.some((item) => item.artifactType === 'log'), true);
  } finally {
    await server.stop();
  }
});

test('PocketBase local helper store passes token-aware record functions to candidate bundle ingestion', async () => {
  const ingestionInputs = [];
  const fetchCalls = [];
  const records = {
    local_helper_devices: [{
      id: 'device-1',
      owner_name: '小魏',
      status: 'active',
      access_token_hash: hashSecret('token-xiaowei'),
    }],
    agent_tasks: {
      'task-huajin-1': {
        id: 'task-huajin-1',
        source: 'source-huajin',
        monitor_run: 'run-huajin',
        source_name: '华锦兵器网',
        owner_name: '小魏',
        task_type: 'local_helper',
        status: 'in_progress',
      },
    },
    local_helper_runs: [{
      id: 'local-run-1',
      device: 'device-1',
      agent_task: 'task-huajin-1',
      source_name: '华锦兵器网',
      owner_name: '小魏',
      status: 'running',
    }],
  };
  const store = createPocketBaseLocalHelperStore({
    apiUrl: 'https://pb.example.test',
    superuserEmail: 'admin@example.com',
    superuserPassword: 'secret',
    ingestCandidateBundle: async (input) => {
      ingestionInputs.push(input);
      const existing = await input.listRecordsFn('bid_opportunities', input.token);
      const created = await input.createRecordFn('bid_opportunities', input.token, { title: '公告' });
      const updated = await input.updateRecordFn('agent_tasks', input.task.id, input.token, { status: 'completed' });
      return {
        rawCount: existing.length + 1,
        processedCount: 1,
        createdCount: created && updated ? 1 : 0,
      };
    },
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      const path = String(url).replace('https://pb.example.test', '');
      const json = (body, ok = true, status = ok ? 200 : 400) => ({
        ok,
        status,
        statusText: ok ? 'OK' : 'Bad Request',
        json: async () => body,
        text: async () => JSON.stringify(body),
      });
      if (path === '/api/collections/_superusers/auth-with-password') {
        return json({ token: 'pb-token' });
      }
      if (path.startsWith('/api/collections/local_helper_devices/records?')) {
        return json({ items: records.local_helper_devices });
      }
      if (path === '/api/collections/agent_tasks/records/task-huajin-1' && options.method !== 'PATCH') {
        return json(records.agent_tasks['task-huajin-1']);
      }
      if (path.startsWith('/api/collections/local_helper_runs/records?')) {
        return json({ items: records.local_helper_runs });
      }
      if (path === '/api/collections/local_helper_runs/records/local-run-1') {
        return json({
          ...records.local_helper_runs[0],
          status: JSON.parse(options.body).status,
          current_url: JSON.parse(options.body).current_url,
        });
      }
      if (path === '/api/collections/local_agent_steps/records') {
        return json({ id: 'step-1', ...JSON.parse(options.body) });
      }
      if (path === '/api/collections/agent_artifacts/records') {
        return json({ id: 'artifact-1', ...JSON.parse(options.body) });
      }
      if (path.startsWith('/api/collections/bid_opportunities/records?')) {
        assert.equal(new URL(String(url)).searchParams.get('filter'), null);
        return json({ items: [] });
      }
      if (path === '/api/collections/bid_opportunities/records') {
        const body = JSON.parse(options.body);
        assert.deepEqual(body, { title: '公告' });
        return json({ id: 'opportunity-1', ...body });
      }
      if (path === '/api/collections/agent_tasks/records/task-huajin-1' && options.method === 'PATCH') {
        const body = JSON.parse(options.body);
        assert.deepEqual(body, { status: 'completed' });
        return json({ id: 'task-huajin-1', ...body });
      }
      return json({ error: `unexpected ${path}` }, false, 404);
    },
  });

  const result = await store.continueTask('token-xiaowei', 'task-huajin-1', {
    status: 'completed',
    currentUrl: 'https://example.com/list',
    observation: '已提取 1 条公告。',
    candidateBundle: {
      source_name: '华锦兵器网',
      candidates: [{ title: '华锦化工消泡剂采购询价公告' }],
    },
  });

  assert.equal(result.ingestion.createdCount, 1);
  assert.equal(ingestionInputs[0].token, 'pb-token');
  assert.ok(fetchCalls.some((call) => String(call.url).includes('/api/collections/bid_opportunities/records?')));
  assert.ok(fetchCalls.some((call) => String(call.url).endsWith('/api/collections/agent_tasks/records/task-huajin-1')));
});
