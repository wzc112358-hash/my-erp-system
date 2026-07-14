import assert from 'node:assert/strict';
import test from 'node:test';

import { pairWithCloud, uploadCloudTaskReport } from './cloud-client.ts';

test('cloud client pairs and uploads through the two retained cloud calls', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ token: 'paired-token', ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await pairWithCloud({ cloudUrl: 'https://erp.example.com/', fetchImpl }, {
    code: 'PAIR',
    deviceName: '测试电脑',
    deviceFingerprint: 'pc-1',
    helperVersion: '0.2.0',
    platform: 'win32',
  });
  await uploadCloudTaskReport({
    cloudUrl: 'https://erp.example.com/',
    token: 'paired-token',
    fetchImpl,
  }, 'task-1', { status: 'no_matches' });
  assert.equal(calls[0]?.url, 'https://erp.example.com/local-helper/pair');
  assert.equal(calls[1]?.url, 'https://erp.example.com/local-helper/tasks/task-1/result');
  assert.equal(new Headers(calls[1]?.init?.headers).get('authorization'), 'Bearer paired-token');
});

test('cloud client exposes a structured cloud error', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: 'pair code expired' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(() => pairWithCloud({ cloudUrl: 'https://erp.example.com', fetchImpl }, {
    code: 'OLD', deviceName: '', deviceFingerprint: '', helperVersion: '', platform: '',
  }), /pair code expired/);
});
