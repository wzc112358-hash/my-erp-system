import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { BrowserObservation, BrowserSession } from '../browser/types.ts';
import { createAgentHarnessStore } from '../collection/run-log.ts';
import { createLocalApiServer, resolveRuntimeDirs } from './local-api.ts';
import { createTaskStore } from './task-store.ts';

const requestJson = async (baseUrl: string, pathname: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  return { status: response.status, body: await response.json() };
};

const readyObservation = (): BrowserObservation => ({
  title: '测试采购平台',
  url: 'https://example.com/notices',
  visibleText: '2026-07-14 裕龙石化阻聚剂采购招标公告',
  links: [{
    text: '裕龙石化阻聚剂采购招标公告',
    href: 'https://example.com/notices/1',
  }],
  networkResponses: [],
});

const testHarness = async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcz-api-runs-'));
  return { rootDir, store: createAgentHarnessStore({ rootDir }) };
};

test('local workbench exposes only the current product surface', async () => {
  const harness = await testHarness();
  const store = createTaskStore({ helperVersion: '0.2.0' });
  const server = createLocalApiServer({ store, port: 0, agentHarness: harness.store });
  await server.start();
  try {
    const health = await requestJson(server.url(), '/health');
    const sites = await requestJson(server.url(), '/site-profiles');
    const removed = await requestJson(server.url(), '/schedules');
    assert.equal(health.body.helperVersion, '0.2.0');
    assert.deepEqual(sites.body.profiles.map((site: any) => site.sourceName), ['国能E购', '易派克', '裕龙招投标网']);
    assert.equal(removed.status, 404);
  } finally {
    await server.stop();
    await fs.rm(harness.rootDir, { recursive: true, force: true });
  }
});

test('local workbench runs one browser collection path and returns a report', async () => {
  const harness = await testHarness();
  const browser: BrowserSession = {
    engine: 'test',
    open: async () => readyObservation(),
    observe: async () => readyObservation(),
    close: async () => undefined,
  };
  const store = createTaskStore();
  const server = createLocalApiServer({
    store,
    port: 0,
    agentHarness: harness.store,
    createBrowserSession: () => browser,
    now: () => new Date('2026-07-14T10:00:00+08:00'),
  });
  await server.start();
  try {
    const created = await requestJson(server.url(), '/tasks', {
      method: 'POST',
      body: JSON.stringify({ sourceName: '测试站点', entryUrl: 'https://example.com/notices', searchTerms: '阻聚剂' }),
    });
    const taskId = created.body.task.id;
    const run = await requestJson(server.url(), `/tasks/${taskId}/agent-run`, { method: 'POST', body: '{}' });
    const report = await requestJson(server.url(), `/tasks/${taskId}/collection-report`);
    const runs = await requestJson(server.url(), '/agent-runs');
    assert.equal(run.body.status, 'completed');
    assert.equal(report.body.status, 'has_matches');
    assert.equal(report.body.selectedCount, 1);
    assert.equal(runs.body.runs.length, 1);
  } finally {
    await server.stop();
    await fs.rm(harness.rootDir, { recursive: true, force: true });
  }
});

test('local workbench reuses the browser session after employee verification', async () => {
  const harness = await testHarness();
  let observeCount = 0;
  const browser: BrowserSession = {
    engine: 'test',
    open: async () => ({
      title: '访问验证',
      url: 'https://example.com/challenge',
      visibleText: '加载中',
      networkResponses: [{
        url: 'https://example.com/search', status: 200, contentType: 'text/html', challenge: true,
      }],
    }),
    observe: async () => {
      observeCount += 1;
      return readyObservation();
    },
    screenshot: async () => '/tmp/challenge.png',
    close: async () => undefined,
  };
  const store = createTaskStore();
  const server = createLocalApiServer({
    store, port: 0, agentHarness: harness.store, createBrowserSession: () => browser,
  });
  await server.start();
  try {
    const created = await requestJson(server.url(), '/tasks', {
      method: 'POST', body: JSON.stringify({ sourceName: '测试站点', entryUrl: 'https://example.com' }),
    });
    const id = created.body.task.id;
    const first = await requestJson(server.url(), `/tasks/${id}/agent-run`, { method: 'POST', body: '{}' });
    const resumed = await requestJson(server.url(), `/tasks/${id}/continue-run`, { method: 'POST', body: '{}' });
    assert.equal(first.body.status, 'request_human');
    assert.equal(resumed.body.status, 'completed');
    assert.equal(observeCount, 1);
  } finally {
    await server.stop();
    await fs.rm(harness.rootDir, { recursive: true, force: true });
  }
});

test('local workbench stores and tests OpenAI-compatible LLM settings', async () => {
  const harness = await testHarness();
  const store = createTaskStore();
  const server = createLocalApiServer({
    store,
    port: 0,
    agentHarness: harness.store,
    testLLMConnection: async ({ config }) => ({
      ok: true,
      baseUrl: config?.baseUrl || '',
      model: config?.model || '',
      message: '连接正常',
    }),
  });
  await server.start();
  try {
    const saved = await requestJson(server.url(), '/settings/llm', {
      method: 'POST',
      body: JSON.stringify({ baseUrl: 'https://api.deepseek.com', apiKey: 'secret', model: 'deepseek-v4-pro' }),
    });
    const tested = await requestJson(server.url(), '/settings/llm/test', { method: 'POST', body: '{}' });
    assert.equal(saved.body.hasApiKey, true);
    assert.equal(saved.body.apiKey, undefined);
    assert.equal(tested.body.ok, true);
  } finally {
    await server.stop();
    await fs.rm(harness.rootDir, { recursive: true, force: true });
  }
});

test('completed reports upload through the paired cloud seam', async () => {
  const harness = await testHarness();
  const store = createTaskStore();
  store.setCloudPairing({ cloudUrl: 'https://erp.example.com', token: 'token', device: {} });
  const task = store.createTask({ sourceName: '国能E购' });
  store.continueTask(task.id, { status: 'completed', candidateBundle: null, screenedNotices: [] });
  let uploadedTaskId = '';
  const server = createLocalApiServer({
    store,
    port: 0,
    agentHarness: harness.store,
    uploadReport: async (_options, taskId) => {
      uploadedTaskId = taskId;
      return { ok: true };
    },
  });
  await server.start();
  try {
    const uploaded = await requestJson(server.url(), `/tasks/${task.id}/upload`, { method: 'POST', body: '{}' });
    assert.equal(uploaded.body.uploaded, true);
    assert.equal(uploaded.body.report.status, 'no_matches');
    assert.equal(uploadedTaskId, task.id);
  } finally {
    await server.stop();
    await fs.rm(harness.rootDir, { recursive: true, force: true });
  }
});

test('runtime directories remain isolated per site', () => {
  const dirs = resolveRuntimeDirs({ sourceName: '裕龙招投标网' }, { LOCALAPPDATA: '/tmp/hcz-data' });
  assert.match(dirs.profileDir, /裕龙招投标网/);
  assert.match(dirs.screenshotDir, /artifacts/);
});
