import test from 'node:test';
import assert from 'node:assert/strict';

import { continueLocalHelperTaskAfterHuman, runLocalHelperTask } from './task-runner.ts';

test('task runner reports request_human when local browser sees login verification', async () => {
  const cloudEvents: Array<Record<string, unknown>> = [];
  const cloud = {
    start: async () => ({ run: { id: 'run-1' } }),
    continue: async (_taskId: string, payload: Record<string, unknown>) => {
      cloudEvents.push(payload);
      return { status: payload.status };
    },
  };
  const browser = {
    open: async () => ({
      title: '华锦供应商登录',
      url: 'https://www.norincogroup-ebuy.com/',
      visibleText: '账号 密码 验证码',
    }),
    observe: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
  };

  const result = await runLocalHelperTask({
    task: {
      id: 'task-huajin',
      sourceName: '华锦兵器网',
      entryUrl: 'https://www.norincogroup-ebuy.com/',
    },
    browser,
    cloud,
  });

  assert.equal(result.status, 'request_human');
  assert.equal(cloudEvents[0].requestHuman, true);
  assert.equal(cloudEvents[0].status, 'request_human');
  assert.match(String(cloudEvents[0].humanReason), /验证码/);
});

test('task runner keeps browser open after opening a ready page instead of completing the task', async () => {
  const cloudEvents: Array<Record<string, unknown>> = [];
  const cloud = {
    start: async () => ({ run: { id: 'run-1' } }),
    continue: async (_taskId: string, payload: Record<string, unknown>) => {
      cloudEvents.push(payload);
      return { status: payload.status };
    },
  };
  const browser = {
    open: async () => ({
      title: '华锦兵器网',
      url: 'https://www.norincogroup-ebuy.com/list',
      visibleText: '2026-05-27 华锦化工消泡剂采购询价公告 截止 2026-05-30',
    }),
    observe: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
  };

  const result = await runLocalHelperTask({
    task: {
      id: 'task-huajin',
      sourceName: '华锦兵器网',
      entryUrl: 'https://www.norincogroup-ebuy.com/',
    },
    browser,
    cloud,
  });

  assert.equal(result.status, 'request_human');
  assert.equal(result.candidateBundle, null);
  assert.equal(cloudEvents[0].status, 'request_human');
  assert.equal(cloudEvents[0].requestHuman, true);
  assert.equal(cloudEvents[0].action, 'open_task');
  assert.equal(cloudEvents[0].candidateBundle, undefined);
  assert.match(String(cloudEvents[0].humanReason), /继续采集/);
});

test('task runner continues after human verification and records screenshot path', async () => {
  const cloudEvents: Array<Record<string, unknown>> = [];
  const cloud = {
    start: async () => ({ run: { id: 'run-1' } }),
    continue: async (_taskId: string, payload: Record<string, unknown>) => {
      cloudEvents.push(payload);
      return { status: payload.status };
    },
  };
  const browser = {
    open: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
    observe: async () => ({
      title: '华锦兵器网',
      url: 'https://www.norincogroup-ebuy.com/list',
      visibleText: '2026-05-27 华锦化工消泡剂采购询价公告 截止 2026-05-30',
      domSnapshot: '<html>华锦化工消泡剂采购询价公告</html>',
      networkResponses: [{
        url: 'https://www.norincogroup-ebuy.com/api/notice/list',
        status: 200,
        contentType: 'application/json',
        bodySnippet: '{"title":"华锦化工消泡剂采购询价公告"}',
      }],
      links: [{ text: '下载招标文件', href: 'https://www.norincogroup-ebuy.com/files/tender.pdf' }],
    }),
    screenshot: async () => '/tmp/hcz-artifacts/after-login.png',
  };

  const result = await continueLocalHelperTaskAfterHuman({
    task: {
      id: 'task-huajin',
      sourceName: '华锦兵器网',
      entryUrl: 'https://www.norincogroup-ebuy.com/',
    },
    browser,
    cloud,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.observation.screenshotPath, '/tmp/hcz-artifacts/after-login.png');
  assert.equal(cloudEvents[0].status, 'completed');
  assert.equal(cloudEvents[0].action, 'continue_after_human');
  assert.equal(cloudEvents[0].screenshotPath, '/tmp/hcz-artifacts/after-login.png');
  assert.deepEqual((cloudEvents[0].artifacts as any[]).map((artifact) => artifact.artifact_type), [
    'dom_snapshot',
    'network_response',
    'attachment',
  ]);
  assert.equal((cloudEvents[0].candidateBundle as any).candidates.length, 1);
});

test('task runner keeps the task waiting when cloud ingestion creates no opportunity', async () => {
  const cloudEvents: Array<Record<string, unknown>> = [];
  const cloud = {
    start: async () => ({ run: { id: 'run-1' } }),
    continue: async (_taskId: string, payload: Record<string, unknown>) => {
      cloudEvents.push(payload);
      return {
        status: 'request_human',
        ingestion: {
          status: 'request_human',
          processedCount: 1,
          createdCount: 0,
          resultSummary: '本地助手已采集候选 1 条，但没有生成可入库商机。请在本地浏览器进入具体公告列表或按搜索词筛选后再次点击继续采集。',
        },
        nextAction: {
          type: 'request_human',
          reason: '请进入具体公告列表',
        },
      };
    },
  };
  const browser = {
    open: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
    observe: async () => ({
      title: '华锦兵器网',
      url: 'https://www.norincogroup-ebuy.com/',
      visibleText: '商避雷针检测鉴定服务\n2026-06-19 10:10',
    }),
    screenshot: async () => '/tmp/hcz-artifacts/platform-notice.png',
  };

  const result = await continueLocalHelperTaskAfterHuman({
    task: {
      id: 'task-huajin',
      sourceName: '华锦兵器网',
      entryUrl: 'https://www.norincogroup-ebuy.com/',
    },
    browser,
    cloud,
  });

  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /没有生成可入库商机/);
  assert.equal(cloudEvents[0].status, 'completed');
  assert.equal((cloudEvents[0].candidateBundle as any).candidates.length, 1);
});

test('task runner does not launch a screenshot browser when the task has no entry URL', async () => {
  const cloudEvents: Array<Record<string, unknown>> = [];
  const cloud = {
    start: async () => ({ run: { id: 'run-1' } }),
    continue: async (_taskId: string, payload: Record<string, unknown>) => {
      cloudEvents.push(payload);
      return { status: payload.status };
    },
  };
  const browser = {
    open: async () => {
      throw new Error('browser.open should not be called');
    },
    observe: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
    screenshot: async () => {
      throw new Error('browser.screenshot should not be called without a current URL');
    },
  };

  const result = await runLocalHelperTask({
    task: {
      id: 'task-no-entry',
      sourceName: '未知缺入口站点',
      entryUrl: '',
    },
    browser,
    cloud,
  });

  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /缺少入口 URL/);
  assert.equal(cloudEvents[0].screenshotPath, '');
});
