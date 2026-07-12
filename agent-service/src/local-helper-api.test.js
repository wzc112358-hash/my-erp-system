import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalHelperApiServer } from './local-helper-api.js';

const requestJson = async (baseUrl, path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  return { status: response.status, body: await response.json() };
};

test('local helper cloud API pairs a device and ingests only the filtered report', async () => {
  const reports = [];
  const server = createLocalHelperApiServer({
    port: 0,
    host: '127.0.0.1',
    pairCode: 'PAIR-123',
    apiToken: 'token-123',
    repository: {
      async ingestReport(report) {
        reports.push(report);
        return { runId: 'run-1', uploadedCount: report.items.length, recordIds: ['opp-1'] };
      },
    },
  });
  await server.start();
  try {
    const invalidPair = await requestJson(server.url(), '/local-helper/pair', {
      method: 'POST',
      body: JSON.stringify({ code: 'BAD' }),
    });
    const pair = await requestJson(server.url(), '/local-helper/pair', {
      method: 'POST',
      body: JSON.stringify({ code: 'PAIR-123', deviceName: '小杨电脑', deviceFingerprint: 'pc-1' }),
    });
    const unauthorized = await requestJson(server.url(), '/local-helper/tasks/task-1/result', {
      method: 'POST',
      body: JSON.stringify({ status: 'no_matches', selectedCount: 0, items: [] }),
    });
    const uploaded = await requestJson(server.url(), '/local-helper/tasks/task-1/result', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-123' },
      body: JSON.stringify({
        taskId: 'task-1',
        sourceName: '国能E购',
        status: 'has_matches',
        rawCount: 30,
        selectedCount: 1,
        summary: '筛选出 1 条信息',
        items: [{ title: '阻垢剂采购公告', sourceName: '国能E购', url: 'https://example.com/1' }],
      }),
    });

    assert.equal(invalidPair.status, 401);
    assert.equal(pair.body.token, 'token-123');
    assert.equal(unauthorized.status, 401);
    assert.equal(uploaded.body.uploadedCount, 1);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].items[0].title, '阻垢剂采购公告');
  } finally {
    await server.stop();
  }
});

test('local helper cloud API accepts a completed no-match inspection', async () => {
  const reports = [];
  const server = createLocalHelperApiServer({
    port: 0,
    host: '127.0.0.1',
    pairCode: 'PAIR',
    apiToken: 'token',
    repository: { async ingestReport(report) { reports.push(report); return { uploadedCount: 0, recordIds: [] }; } },
  });
  await server.start();
  try {
    const result = await requestJson(server.url(), '/local-helper/tasks/task-2/result', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({ sourceName: '易派克', status: 'no_matches', rawCount: 40, selectedCount: 0, items: [], summary: '今日无相关信息' }),
    });
    assert.equal(result.status, 200);
    assert.equal(reports[0].status, 'no_matches');
  } finally {
    await server.stop();
  }
});
