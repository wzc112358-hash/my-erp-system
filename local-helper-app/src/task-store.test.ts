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
  store.markCloudHeartbeat({
    release: {
      latestVersion: '0.2.0',
      updateAvailable: true,
      portableUrl: 'https://erp.henghuacheng.cn/downloads/hcz-local-helper-app.zip',
    },
  });

  assert.equal((persisted[0] as { token: string }).token, 'new-token');
  assert.equal(store.health().latestRelease?.updateAvailable, true);
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

test('task store keeps local task artifacts when cloud sync omits them', () => {
  const store = createTaskStore();
  store.addTask({
    id: 'task-1',
    sourceName: '华锦兵器网',
    entryUrl: 'https://example.com/old',
    status: 'pending',
  });
  store.continueTask('task-1', {
    observation: '已完成验证码，当前页面展示公告列表。',
    screenshotPath: '/tmp/hcz-artifacts/task-1.png',
    log: '已尝试继续采集。',
  });

  const synced = store.syncCloudTasks([{
    id: 'task-1',
    sourceName: '华锦兵器网',
    entryUrl: 'https://example.com/new',
    status: 'in_progress',
  }]);

  assert.equal(synced[0].status, 'running');
  assert.equal(synced[0].entryUrl, 'https://example.com/new');
  assert.equal(synced[0].lastObservation, '已完成验证码，当前页面展示公告列表。');
  assert.equal(synced[0].lastScreenshotPath, '/tmp/hcz-artifacts/task-1.png');
  assert.equal(synced[0].lastLog, '已尝试继续采集。');
});

test('task store maps cloud task statuses to local display statuses', () => {
  const store = createTaskStore();

  const synced = store.syncCloudTasks([
    { id: 'pending', sourceName: 'A', entryUrl: 'https://a.example', status: 'pending' },
    { id: 'running', sourceName: 'B', entryUrl: 'https://b.example', status: 'in_progress' },
    { id: 'completed', sourceName: 'C', entryUrl: 'https://c.example', status: 'completed' },
    { id: 'failed', sourceName: 'D', entryUrl: 'https://d.example', status: 'failed' },
    { id: 'cancelled', sourceName: 'E', entryUrl: 'https://e.example', status: 'cancelled' },
    { id: 'human', sourceName: 'F', entryUrl: 'https://f.example', status: 'request_human' },
  ]);

  assert.deepEqual(
    synced.map((task) => [task.id, task.status]),
    [
      ['pending', 'pending'],
      ['running', 'running'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['cancelled', 'cancelled'],
      ['human', 'waiting_agent'],
    ],
  );
});
