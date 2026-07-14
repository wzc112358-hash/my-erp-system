import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createJsonFileConfigStore } from './local-config-store.ts';

test('json config store persists cloud pairing across helper restarts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcz-helper-'));
  const filePath = path.join(dir, 'config.json');
  const store = createJsonFileConfigStore(filePath);

  store.writeCloudPairing({
    paired: true,
    cloudUrl: 'https://agent.henghuacheng.cn',
    token: 'token-xiaowei',
    deviceId: 'device-1',
    ownerName: '小魏',
    deviceName: 'WX-PC-01',
    pairedAt: '2026-05-28T01:00:00.000Z',
  });

  const restarted = createJsonFileConfigStore(filePath);
  assert.equal(restarted.readCloudPairing()?.token, 'token-xiaowei');
  assert.equal(restarted.readCloudPairing()?.ownerName, '小魏');
});

test('json config store returns null for missing or broken files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcz-helper-'));
  const filePath = path.join(dir, 'config.json');
  const store = createJsonFileConfigStore(filePath);

  assert.equal(store.readCloudPairing(), null);
  fs.writeFileSync(filePath, '{broken json', 'utf8');
  assert.equal(store.readCloudPairing(), null);
});

test('json config store persists local LLM settings without touching cloud pairing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcz-helper-'));
  const filePath = path.join(dir, 'config.json');
  const store = createJsonFileConfigStore(filePath);

  store.writeCloudPairing({
    paired: true,
    cloudUrl: 'https://agent.henghuacheng.cn',
    token: 'token-xiaowei',
    deviceId: 'device-1',
    ownerName: '小魏',
    deviceName: 'WX-PC-01',
    pairedAt: '2026-05-28T01:00:00.000Z',
  });
  store.writeLLMConfig({
    enabled: true,
    baseUrl: 'https://llm.example/v1',
    apiKey: 'sk-local',
    model: 'demo-model',
  });

  const restarted = createJsonFileConfigStore(filePath);
  assert.equal(restarted.readCloudPairing()?.token, 'token-xiaowei');
  assert.equal(restarted.readLLMConfig()?.apiKey, 'sk-local');

  restarted.clearLLMConfig();
  assert.equal(restarted.readLLMConfig(), null);
  assert.equal(restarted.readCloudPairing()?.token, 'token-xiaowei');
});

test('json config store persists feedback learning without touching other settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcz-helper-'));
  const filePath = path.join(dir, 'config.json');
  const store = createJsonFileConfigStore(filePath);

  store.writeLLMConfig({
    enabled: true,
    baseUrl: 'https://llm.example/v1',
    apiKey: 'sk-local',
    model: 'demo-model',
  });
  store.writeFeedbackLearning({
    version: 1,
    updatedAt: '2026-06-22T10:00:00.000Z',
    terms: {
      阻聚剂: {
        term: '阻聚剂',
        weightDelta: 20,
        positiveCount: 1,
        negativeCount: 0,
        askBossCount: 0,
        sourceNames: ['能源一号'],
        lastStatus: 'sent_to_group',
        lastFeedbackAt: '2026-06-22T10:00:00.000Z',
      },
    },
    notices: {},
    recent: [],
  });

  const restarted = createJsonFileConfigStore(filePath);
  assert.equal(restarted.readFeedbackLearning()?.terms['阻聚剂'].weightDelta, 20);
  assert.equal(restarted.readLLMConfig()?.apiKey, 'sk-local');

  restarted.clearFeedbackLearning();
  assert.equal(restarted.readFeedbackLearning(), null);
  assert.equal(restarted.readLLMConfig()?.apiKey, 'sk-local');
});

test('json config store persists local schedules without touching other settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcz-helper-'));
  const filePath = path.join(dir, 'config.json');
  const store = createJsonFileConfigStore(filePath);

  store.writeLLMConfig({
    enabled: true,
    baseUrl: 'https://llm.example/v1',
    apiKey: 'sk-local',
    model: 'demo-model',
  });
  store.writeLocalSchedules([{
    id: 'schedule-1',
    sourceName: '能源一号',
    searchTerms: '阻聚剂',
    entryUrl: 'https://example.com',
    actionSteps: '进入公告列表',
    times: ['09:00'],
    enabled: true,
    runMode: 'agent',
  }]);

  const restarted = createJsonFileConfigStore(filePath);
  assert.equal(restarted.readLocalSchedules()[0].sourceName, '能源一号');
  assert.equal(restarted.readLLMConfig()?.apiKey, 'sk-local');

  restarted.clearLocalSchedules();
  assert.deepEqual(restarted.readLocalSchedules(), []);
  assert.equal(restarted.readLLMConfig()?.apiKey, 'sk-local');
});
