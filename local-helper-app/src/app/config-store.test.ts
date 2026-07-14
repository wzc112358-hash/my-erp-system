import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createJsonFileConfigStore } from './config-store.ts';

test('JSON config store preserves cloud pairing while updating LLM settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcz-config-'));
  const file = path.join(dir, 'config.json');
  const store = createJsonFileConfigStore(file);
  store.writeCloudPairing({
    paired: true,
    cloudUrl: 'https://erp.example.com',
    token: 'token',
    deviceId: 'device-1',
    ownerName: '小白',
    deviceName: '办公室电脑',
    pairedAt: '2026-07-14T00:00:00.000Z',
  });
  store.writeLLMConfig({
    enabled: true,
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'secret',
    model: 'deepseek-v4-pro',
  });
  assert.equal(store.readCloudPairing()?.deviceId, 'device-1');
  assert.equal(store.readLLMConfig()?.model, 'deepseek-v4-pro');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('JSON config store tolerates missing and broken files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcz-config-broken-'));
  const file = path.join(dir, 'config.json');
  const store = createJsonFileConfigStore(file);
  assert.equal(store.readCloudPairing(), null);
  fs.writeFileSync(file, '{broken', 'utf8');
  assert.equal(store.readLLMConfig(), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
