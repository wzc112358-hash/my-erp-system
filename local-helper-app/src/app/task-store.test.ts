import assert from 'node:assert/strict';
import test from 'node:test';

import { createTaskStore, type CloudPairing } from './task-store.ts';

const memoryConfig = () => {
  let pairing: CloudPairing | null = null;
  let llm: any = null;
  return {
    readCloudPairing: () => pairing,
    writeCloudPairing: (value: CloudPairing) => { pairing = value; },
    clearCloudPairing: () => { pairing = null; },
    readLLMConfig: () => llm,
    writeLLMConfig: (value: any) => { llm = value; },
    clearLLMConfig: () => { llm = null; },
  };
};

test('task store creates pilot tasks from the central registry', () => {
  const store = createTaskStore({ now: () => new Date('2026-07-14T10:00:00Z') });
  const task = store.createTask({ sourceName: '裕龙招投标网' });
  assert.match(task.entryUrl, /ctbpsp/);
  assert.match(task.searchTerms || '', /裕龙石化/);
  assert.equal(task.status, 'pending');
  assert.equal(task.updatedAt, '2026-07-14T10:00:00.000Z');
});

test('task store owns the complete collection lifecycle', () => {
  const store = createTaskStore();
  const created = store.createTask({ sourceName: '国能E购' });
  assert.equal(store.startTask(created.id).status, 'running');
  const waiting = store.continueTask(created.id, {
    status: 'waiting_agent',
    observation: '安全验证',
    log: '请员工验证',
  });
  assert.equal(waiting.status, 'waiting_agent');
  const completed = store.continueTask(created.id, {
    status: 'completed',
    resultSummary: '没有相关信息',
    screenedNotices: [],
  });
  assert.equal(completed.status, 'completed');
  assert.equal(store.listTasks()[0]?.id, created.id);
});

test('task store persists cloud pairing and hides the LLM key from health', () => {
  const configStore = memoryConfig();
  const store = createTaskStore({ configStore, helperVersion: '0.2.0' });
  store.setCloudPairing({
    cloudUrl: 'https://erp.example.com/',
    token: 'cloud-token',
    device: { id: 'pc-1', deviceName: '办公室电脑' },
  });
  store.setLLMConfig({
    enabled: true,
    baseUrl: 'https://api.deepseek.com/',
    apiKey: 'secret',
    model: 'deepseek-v4-pro',
  });
  assert.equal(store.health().cloudPaired, true);
  assert.equal(store.health().helperVersion, '0.2.0');
  const publicConfig = store.getLLMConfig() as { hasApiKey: boolean };
  const privateConfig = store.getLLMConfig({ includeApiKey: true }) as { apiKey?: string } | null;
  assert.equal(publicConfig.hasApiKey, true);
  assert.equal('apiKey' in publicConfig, false);
  assert.equal(privateConfig?.apiKey, 'secret');
});
