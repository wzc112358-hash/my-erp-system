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
