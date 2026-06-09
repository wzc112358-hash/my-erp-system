import test from 'node:test';
import assert from 'node:assert/strict';

import { createTaskStore } from './task-store.ts';

test('task store pairs a device and exposes health state', () => {
  const store = createTaskStore();

  const paired = store.pair({ code: 'ABC123', userName: '小魏' });

  assert.equal(paired.paired, true);
  assert.equal(paired.device.userName, '小魏');
  assert.equal(store.health().paired, true);
});

test('task store restores and persists cloud pairing through config store', () => {
  const persisted: Array<unknown> = [];
  const configStore = {
    readCloudPairing: () => ({
      paired: true,
      cloudUrl: 'https://agent.henghuacheng.cn',
      token: 'old-token',
      deviceId: 'device-old',
      ownerName: '小魏',
      deviceName: 'WX-PC-01',
      pairedAt: '2026-05-27T01:00:00.000Z',
    }),
    writeCloudPairing: (pairing: unknown) => persisted.push(pairing),
    clearCloudPairing: () => undefined,
  };
  const store = createTaskStore({ configStore });

  assert.equal(store.health().cloudPaired, true);
  assert.equal(store.getCloudPairing().token, 'old-token');

  store.setCloudPairing({
    cloudUrl: 'https://agent.henghuacheng.cn',
    token: 'new-token',
    device: { id: 'device-new', ownerName: '小魏', deviceName: 'WX-PC-01' },
  });

  assert.equal((persisted[0] as { token: string }).token, 'new-token');
});

test('task store manages local helper task lifecycle', () => {
  const store = createTaskStore();
  store.addTask({
    id: 'task-huajin-1',
    sourceName: '华锦兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    status: 'pending',
  });

  const started = store.startTask('task-huajin-1');
  const continued = store.continueTask('task-huajin-1', {
    observation: '员工已完成登录，当前页面显示询价交易列表。',
  });

  assert.equal(started.status, 'running');
  assert.equal(continued.status, 'waiting_agent');
  assert.equal(store.listTasks()[0].lastObservation, '员工已完成登录，当前页面显示询价交易列表。');
});

test('task store cancels a task', () => {
  const store = createTaskStore();
  store.addTask({ id: 'task-1', sourceName: '易派克', entryUrl: 'https://example.com', status: 'pending' });

  const cancelled = store.cancelTask('task-1');

  assert.equal(cancelled.status, 'cancelled');
});
