import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cancelCloudTask,
  continueCloudTask,
  pairWithCloud,
  pullCloudTasks,
  sendHeartbeat,
  startCloudTask,
} from './cloud-client.ts';

const createFetch = () => {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, options: RequestInit = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, url: String(url), tasks: [{ id: 'task-huajin-1' }] }),
    } as Response;
  };
  return { calls, fetchImpl };
};

test('cloud client pairs local helper with cloud API', async () => {
  const { calls, fetchImpl } = createFetch();

  const result = await pairWithCloud({ cloudUrl: 'https://agent.example.com/', fetchImpl }, {
    code: 'ABCD1234',
    deviceName: 'WX-PC-01',
    deviceFingerprint: 'fp-xw',
    helperVersion: '0.2.0',
    platform: 'win32',
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://agent.example.com/local-helper/pair');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].options.body)).deviceName, 'WX-PC-01');
});

test('cloud client sends bearer token for task channel calls', async () => {
  const { calls, fetchImpl } = createFetch();
  const options = { cloudUrl: 'https://agent.example.com', token: 'token-xiaowei', fetchImpl };

  await sendHeartbeat(options, { helperVersion: '0.2.0', platform: 'win32' });
  await pullCloudTasks(options);
  await startCloudTask(options, 'task-huajin-1');
  await continueCloudTask(options, 'task-huajin-1', {
    observation: '页面出现验证码，需要人工接管。',
    requestHuman: true,
  });
  await cancelCloudTask(options, 'task-huajin-1');

  assert.equal(calls[0].url, 'https://agent.example.com/local-helper/heartbeat');
  assert.equal(calls[1].url, 'https://agent.example.com/local-helper/tasks');
  assert.equal(calls[2].url, 'https://agent.example.com/local-helper/tasks/task-huajin-1/start');
  assert.equal(calls[3].url, 'https://agent.example.com/local-helper/tasks/task-huajin-1/continue');
  assert.equal(calls[4].url, 'https://agent.example.com/local-helper/tasks/task-huajin-1/cancel');
  assert.equal((calls[3].options.headers as Record<string, string>).Authorization, 'Bearer token-xiaowei');
});

test('cloud client surfaces structured cloud errors', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: 'invalid local helper token' }),
  }) as Response;

  await assert.rejects(
    () => pullCloudTasks({ cloudUrl: 'https://agent.example.com', token: 'bad', fetchImpl }),
    /invalid local helper token/,
  );
});
