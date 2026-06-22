import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createLocalApiServer, resolveRuntimeDirs } from './local-api.ts';
import { buildOpportunityCards } from './product-knowledge.ts';
import { createTaskStore } from './task-store.ts';

const requestJson = async (baseUrl: string, path: string, options: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
};

const createMockCloudServer = () => {
  const calls: Array<{ method: string; url: string; authorization: string }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls.push({
      method: request.method || '',
      url: request.url || '',
      authorization: String(request.headers.authorization || ''),
    });
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (request.url === '/local-helper/pair') {
      response.end(JSON.stringify({
        paired: true,
        token: 'cloud-token-xiaowei',
        device: { id: 'device-1', ownerName: '小魏', deviceName: 'WX-PC-01' },
      }));
      return;
    }
    if (request.url === '/local-helper/tasks') {
      response.end(JSON.stringify({
        tasks: [{
          id: 'cloud-task-huajin',
          sourceName: '华锦兵器网',
          ownerName: '小魏',
          entryUrl: 'https://www.norincogroup-ebuy.com/',
          searchTerms: '液氮,消泡剂',
          status: 'pending',
        }],
      }));
      return;
    }
    if (request.url === '/local-helper/heartbeat') {
      response.end(JSON.stringify({
        ok: true,
        release: {
          latestVersion: '0.2.0',
          updateAvailable: true,
          portableUrl: 'https://erp.example.com/downloads/hcz-local-helper-app.zip',
        },
      }));
      return;
    }
    if (request.url === '/local-helper/tasks/cloud-task-huajin/start') {
      response.end(JSON.stringify({
        task: { id: 'cloud-task-huajin', status: 'in_progress' },
        run: { id: 'run-1' },
      }));
      return;
    }
    if (request.url === '/local-helper/tasks/cloud-task-huajin/continue') {
      response.end(JSON.stringify({
        status: 'request_human',
        nextAction: { type: 'request_human', reason: '验证码' },
      }));
      return;
    }
    response.end(JSON.stringify({ ok: true }));
  });

  return {
    calls,
    start: () => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve())),
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    url: () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('mock cloud not listening');
      return `http://127.0.0.1:${address.port}`;
    },
  };
};

test('local API exposes health, pair, tasks, and lifecycle endpoints', async () => {
  const store = createTaskStore();
  store.addTask({
    id: 'task-huajin-1',
    sourceName: '华锦兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    status: 'pending',
  });
  const server = createLocalApiServer({ store, port: 0 });
  await server.start();
  try {
    const baseUrl = server.url();

    const health = await requestJson(baseUrl, '/health');
    const pair = await requestJson(baseUrl, '/pair', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: '小魏' }),
    });
    const tasks = await requestJson(baseUrl, '/tasks');
    const started = await requestJson(baseUrl, '/tasks/task-huajin-1/start', { method: 'POST' });
    const continued = await requestJson(baseUrl, '/tasks/task-huajin-1/continue', {
      method: 'POST',
      body: JSON.stringify({ observation: '已登录，当前页面展示采购公告列表。' }),
    });

    assert.equal(health.body.ok, true);
    assert.equal(pair.body.paired, true);
    assert.equal(tasks.body.tasks.length, 1);
    assert.equal(started.body.status, 'running');
    assert.equal(continued.body.status, 'waiting_agent');
    assert.equal(continued.body.lastObservation, '已登录，当前页面展示采购公告列表。');
  } finally {
    await server.stop();
  }
});

test('local API creates and runs local agent tasks without cloud pairing', async () => {
  const store = createTaskStore();
  const server = createLocalApiServer({
    store,
    port: 0,
    runLocalTask: async ({ task }) => ({
      status: 'request_human',
      humanReason: `请在 ${task.sourceName} 完成登录后继续采集。`,
      observation: {
        title: task.sourceName,
        url: task.entryUrl,
        visibleText: '账号 密码 验证码',
        screenshotPath: '/tmp/hcz/open.png',
      },
      candidateBundle: null,
      artifacts: [],
      resultSummary: '等待员工完成验证。',
    }),
    continueLocalTaskAfterHuman: async ({ task }) => ({
      status: 'completed',
      humanReason: '',
      observation: {
        title: task.sourceName,
        url: `${task.entryUrl}#/list`,
        visibleText: '2026-06-20 中石油缓蚀剂采购询价公告 截止 2026-06-25',
        screenshotPath: '/tmp/hcz/done.png',
      },
      candidateBundle: {
        source_name: task.sourceName,
        candidates: [{
          title: '中石油缓蚀剂采购询价公告',
          url: `${task.entryUrl}#/detail/1`,
          published_at: '2026-06-20',
          deadline_at: '2026-06-25',
          buyer_name: '中石油',
          raw_text: '2026-06-20 中石油缓蚀剂采购询价公告 截止 2026-06-25',
          attachments: [],
        }],
      },
      artifacts: [{
        artifact_type: 'dom_snapshot',
        title: '中石油招投标网 DOM 快照',
        url: task.entryUrl,
        content: '<html></html>',
        mime_type: 'text/html',
      }],
      resultSummary: '本次采集识别到 1 条候选公告，请确认后上传 ERP 或生成群摘要。',
    }),
    runAgentTask: async ({ task }) => ({
      status: 'completed',
      humanReason: '',
      observation: {
        title: task.sourceName,
        url: `${task.entryUrl}#/agent-detail`,
        visibleText: '2026-06-20 中石油缓蚀剂采购询价公告 截止 2026-06-25',
        screenshotPath: '/tmp/hcz/agent.png',
      },
      candidateBundle: {
        source_name: task.sourceName,
        candidates: [{
          title: '中石油缓蚀剂采购询价公告',
          url: `${task.entryUrl}#/agent-detail`,
          published_at: '2026-06-20',
          deadline_at: '2026-06-25',
          buyer_name: '中石油',
          raw_text: '2026-06-20 中石油缓蚀剂采购询价公告 截止 2026-06-25',
          attachments: [],
        }],
      },
      artifacts: [{
        artifact_type: 'log',
        title: '链接发现',
        url: task.entryUrl,
        content: '1. 中石油缓蚀剂采购询价公告',
        mime_type: 'text/plain',
      }],
      resultSummary: '发现 1 条招投标候选。',
      discoveredLinks: [{
        title: '中石油缓蚀剂采购询价公告',
        url: `${task.entryUrl}#/agent-detail`,
        source: 'mock-search',
        score: 99,
      }],
    }),
  });
  await server.start();
  try {
    const baseUrl = server.url();

    const profiles = await requestJson(baseUrl, '/site-profiles');
    const created = await requestJson(baseUrl, '/tasks', {
      method: 'POST',
      body: JSON.stringify({
        sourceName: '中石油招投标网',
        searchTerms: '缓蚀剂',
      }),
    });
    const taskId = created.body.task.id;
    const agentRun = await requestJson(baseUrl, `/tasks/${taskId}/agent-run`, { method: 'POST' });
    const opened = await requestJson(baseUrl, `/tasks/${taskId}/run`, { method: 'POST' });
    const continued = await requestJson(baseUrl, `/tasks/${taskId}/continue-run`, { method: 'POST' });
    const tasks = await requestJson(baseUrl, '/tasks');

    const cnpcProfile = profiles.body.profiles.find((profile: { sourceName: string }) => profile.sourceName === '中石油招投标网');
    assert.ok(cnpcProfile);
    assert.match(cnpcProfile.defaultSearchTerms, /缓蚀阻垢剂/);
    assert.equal(created.status, 201);
    assert.match(created.body.task.id, /^local-/);
    assert.equal(created.body.task.entryUrl, 'https://www.cnpcbidding.com/#/tenders');
    assert.equal(agentRun.body.status, 'completed');
    assert.equal(agentRun.body.discoveredLinks[0].source, 'mock-search');
    assert.equal(opened.body.status, 'request_human');
    assert.equal(continued.body.candidateBundle.candidates.length, 1);
    assert.equal(tasks.body.tasks[0].status, 'completed');
    assert.equal(tasks.body.tasks[0].lastCandidateBundle.candidates[0].title, '中石油缓蚀剂采购询价公告');
    assert.equal(tasks.body.tasks[0].lastArtifacts[0].artifact_type, 'dom_snapshot');
    assert.equal(tasks.body.tasks[0].lastDiscoveredLinks[0].source, 'mock-search');
    assert.ok(Array.isArray(tasks.body.tasks[0].lastOpportunityCards));
  } finally {
    await server.stop();
  }
});

test('local API stores LLM settings, hides key, and tests with saved config', async () => {
  const store = createTaskStore();
  const testedConfigs: unknown[] = [];
  const server = createLocalApiServer({
    store,
    port: 0,
    testLLMConnection: async ({ config }) => {
      testedConfigs.push(config);
      return {
        ok: true,
        baseUrl: config?.baseUrl || '',
        model: config?.model || '',
        message: 'LLM 连接成功。',
      };
    },
  });
  await server.start();
  try {
    const baseUrl = server.url();

    const saved = await requestJson(baseUrl, '/settings/llm', {
      method: 'POST',
      body: JSON.stringify({
        enabled: true,
        baseUrl: 'https://llm.example/v1/',
        apiKey: 'sk-local',
        model: 'demo-model',
      }),
    });
    const settings = await requestJson(baseUrl, '/settings/llm');
    const tested = await requestJson(baseUrl, '/settings/llm/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    assert.equal(saved.body.baseUrl, 'https://llm.example/v1');
    assert.equal(saved.body.hasApiKey, true);
    assert.equal('apiKey' in saved.body, false);
    assert.equal(settings.body.model, 'demo-model');
    assert.equal(tested.body.ok, true);
    assert.equal((testedConfigs[0] as { apiKey: string }).apiKey, 'sk-local');
  } finally {
    await server.stop();
  }
});

test('local API deep-reads one opportunity card and updates the task card', async () => {
  const documentServer = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('附件要求：第三方检测报告、供货业绩，允许代理商提供厂家授权。');
  });
  await new Promise<void>((resolve) => documentServer.listen(0, '127.0.0.1', resolve));
  const documentAddress = documentServer.address();
  if (!documentAddress || typeof documentAddress === 'string') throw new Error('document server not listening');
  const documentUrl = `http://127.0.0.1:${documentAddress.port}/tender.txt`;

  const store = createTaskStore();
  const task = store.createTask({
    sourceName: '能源一号',
    entryUrl: 'https://example.com/list',
    searchTerms: '阻聚剂',
  });
  const candidateBundle = {
    source_name: '能源一号',
    candidates: [{
      title: '阻聚剂采购询源公告',
      url: 'https://example.com/detail/1',
      published_at: '2026-06-20',
      deadline_at: '2026-06-25',
      buyer_name: '中化',
      raw_text: '阻聚剂采购询源公告',
      attachments: [],
    }],
  };
  store.continueTask(task.id, {
    status: 'completed',
    candidateBundle,
    opportunityCards: buildOpportunityCards({ bundle: candidateBundle, task }),
  });

  let closed = false;
  const server = createLocalApiServer({
    store,
    port: 0,
    createBrowserRuntime: () => ({
      open: async (url: string) => ({
        title: '阻聚剂采购询源公告',
        url,
        visibleText: '详情页：阻聚剂 20 吨，报价截止 2026-06-25，代理商需厂家授权。',
        links: [{
          text: '下载采购文件',
          href: documentUrl,
        }],
      }),
      observe: async () => ({
        title: '阻聚剂采购询源公告',
        url: 'https://example.com/detail/1',
        visibleText: '详情页',
      }),
      screenshot: async () => '/tmp/hcz/deep-read.png',
      close: async () => {
        closed = true;
      },
    }),
  });
  await server.start();
  try {
    const baseUrl = server.url();
    const result = await requestJson(baseUrl, `/tasks/${task.id}/opportunities/0/deep-read`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const tasks = await requestJson(baseUrl, '/tasks');
    const updated = tasks.body.tasks[0];

    assert.equal(result.body.status, 'completed');
    assert.equal(closed, true);
    assert.match(result.body.resultSummary, /已查清楚/);
    assert.ok(updated.lastOpportunityCards[0].deepReadAt);
    assert.equal(updated.lastOpportunityCards[0].detailScreenshotPath, '/tmp/hcz/deep-read.png');
    assert.match(updated.lastOpportunityCards[0].documentSummaries[0].textSnippet, /第三方检测报告/);
    assert.match(updated.lastCandidateBundle.candidates[0].raw_text, /代理商需厂家授权/);
    assert.ok(updated.lastArtifacts.some((artifact: { artifact_type: string }) => artifact.artifact_type === 'manual_text'));
  } finally {
    await server.stop();
    await new Promise<void>((resolve, reject) => documentServer.close((error) => (error ? reject(error) : resolve())));
  }
});

test('local API exposes copy-ready WeChat summaries', async () => {
  const store = createTaskStore();
  const task = store.createTask({
    sourceName: '能源一号',
    entryUrl: 'https://example.com/list',
    searchTerms: '阻聚剂',
  });
  const candidateBundle = {
    source_name: '能源一号',
    candidates: [{
      title: '阻聚剂采购询源公告',
      url: 'https://example.com/detail/1',
      published_at: '2026-06-20',
      deadline_at: '2026-06-25',
      buyer_name: '中化',
      raw_text: '阻聚剂采购询源公告，需要确认具体装置。',
      attachments: [],
    }],
  };
  store.continueTask(task.id, {
    status: 'completed',
    candidateBundle,
    opportunityCards: buildOpportunityCards({ bundle: candidateBundle, task }),
  });
  const server = createLocalApiServer({ store, port: 0 });
  await server.start();
  try {
    const baseUrl = server.url();
    const single = await requestJson(baseUrl, `/tasks/${task.id}/opportunities/0/wechat-summary`);
    const report = await requestJson(baseUrl, `/tasks/${task.id}/wechat-report`);
    const daily = await requestJson(baseUrl, '/wechat/daily-report');
    const priorityBoard = await requestJson(baseUrl, '/opportunities/priority-board');
    const priorityReport = await requestJson(baseUrl, '/wechat/priority-report');

    assert.match(single.body.text, /【待确认】能源一号/);
    assert.match(single.body.text, /阻聚剂/);
    assert.match(report.body.text, /【站点日报】能源一号/);
    assert.match(report.body.text, /建议重点关注/);
    assert.match(daily.body.text, /今日招投标信息汇总/);
    assert.match(daily.body.text, /阻聚剂采购询源公告/);
    assert.equal(priorityBoard.body.actionableCount, 1);
    assert.equal(priorityBoard.body.items[0].card.title, '阻聚剂采购询源公告');
    assert.match(priorityReport.body.text, /今日招投标重点清单/);
  } finally {
    await server.stop();
  }
});

test('local API records opportunity feedback and returns ERP review draft', async () => {
  const store = createTaskStore();
  const task = store.createTask({
    sourceName: '能源一号',
    entryUrl: 'https://example.com/list',
    searchTerms: '阻聚剂',
  });
  const candidateBundle = {
    source_name: '能源一号',
    candidates: [{
      title: '阻聚剂采购询源公告',
      url: 'https://example.com/detail/1',
      published_at: '2026-06-20',
      deadline_at: '2026-06-25',
      buyer_name: '中化',
      raw_text: '阻聚剂采购询源公告',
      attachments: [],
    }],
  };
  store.continueTask(task.id, {
    status: 'completed',
    candidateBundle,
    opportunityCards: buildOpportunityCards({ bundle: candidateBundle, task }),
  });
  const server = createLocalApiServer({ store, port: 0 });
  await server.start();
  try {
    const baseUrl = server.url();
    const feedback = await requestJson(baseUrl, `/tasks/${task.id}/opportunities/0/feedback`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'irrelevant',
        note: '不是我们产品',
      }),
    });
    const tasks = await requestJson(baseUrl, '/tasks');
    const learning = await requestJson(baseUrl, '/settings/feedback-learning');
    const cleared = await requestJson(baseUrl, '/settings/feedback-learning/clear', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    assert.equal(feedback.body.card.feedbackStatus, 'irrelevant');
    assert.equal(feedback.body.card.recommendedAction, 'ignore');
    assert.equal(feedback.body.reviewDraft.decision, 'irrelevant');
    assert.equal(feedback.body.learning.negativeCount, 1);
    assert.match(feedback.body.reviewDraft.comment, /不是我们产品/);
    assert.equal(tasks.body.tasks[0].lastOpportunityCards[0].feedbackStatus, 'irrelevant');
    assert.equal(learning.body.negativeCount, 1);
    assert.equal(cleared.body.noticeCount, 0);
  } finally {
    await server.stop();
  }
});

test('local API manages daily schedules and runs due local tasks', async () => {
  const store = createTaskStore();
  const server = createLocalApiServer({
    store,
    port: 0,
    enableScheduler: false,
  });
  await server.start();
  try {
    const baseUrl = server.url();
    const saved = await requestJson(baseUrl, '/schedules', {
      method: 'POST',
      body: JSON.stringify({
        id: 'schedule-1',
        sourceName: '能源一号（兰州恒化成）',
        times: '09:00',
        runMode: 'create_task_only',
      }),
    });
    const due = await requestJson(baseUrl, '/schedules/run-due', {
      method: 'POST',
      body: JSON.stringify({
        now: '2026-06-22T09:05:00+08:00',
        windowMinutes: 10,
      }),
    });
    const repeated = await requestJson(baseUrl, '/schedules/run-due', {
      method: 'POST',
      body: JSON.stringify({
        now: '2026-06-22T09:06:00+08:00',
        windowMinutes: 10,
      }),
    });
    const schedules = await requestJson(baseUrl, '/schedules');
    const tasks = await requestJson(baseUrl, '/tasks');

    assert.equal(saved.body.schedule.searchTerms.includes('恒化成'), true);
    assert.equal(due.body.dueCount, 1);
    assert.equal(due.body.runs[0].task.status, 'pending');
    assert.equal(repeated.body.dueCount, 0);
    assert.equal(schedules.body.schedules[0].lastTaskId, tasks.body.tasks[0].id);
    assert.equal(tasks.body.tasks[0].ownerName, '本地自动巡检');
  } finally {
    await server.stop();
  }
});

test('local API can run a schedule immediately through the agent path', async () => {
  const store = createTaskStore();
  const server = createLocalApiServer({
    store,
    port: 0,
    enableScheduler: false,
    createBrowserRuntime: () => ({
      open: async () => ({ visibleText: '', url: 'https://example.com/list' }),
      close: async () => undefined,
    }),
    runAgentTask: async ({ task }) => ({
      status: 'completed',
      humanReason: '',
      observation: {
        title: task.sourceName,
        url: task.entryUrl,
        visibleText: '阻聚剂采购询源公告',
      },
      candidateBundle: {
        source_name: task.sourceName,
        candidates: [{
          title: '阻聚剂采购询源公告',
          url: 'https://example.com/detail/1',
          published_at: '2026-06-22',
          deadline_at: '2026-06-25',
          buyer_name: '中化',
          raw_text: '阻聚剂采购询源公告',
          attachments: [],
        }],
      },
      artifacts: [],
      resultSummary: '',
      opportunityCards: [],
    }),
  });
  await server.start();
  try {
    const baseUrl = server.url();
    await requestJson(baseUrl, '/schedules', {
      method: 'POST',
      body: JSON.stringify({
        id: 'schedule-agent',
        sourceName: '能源一号',
        entryUrl: 'https://example.com/list',
        searchTerms: '阻聚剂',
        times: '09:00',
        runMode: 'agent',
      }),
    });
    const run = await requestJson(baseUrl, '/schedules/schedule-agent/run-now', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const tasks = await requestJson(baseUrl, '/tasks');

    assert.equal(run.body.schedule.lastStatus, 'completed');
    assert.equal(tasks.body.tasks[0].status, 'completed');
  } finally {
    await server.stop();
  }
});

test('local API uses feedback learning when generating future opportunity cards', async () => {
  const store = createTaskStore();
  const firstTask = store.createTask({
    sourceName: '能源一号',
    entryUrl: 'https://example.com/list',
    searchTerms: '宽泛化工',
  });
  store.continueTask(firstTask.id, {
    status: 'completed',
    opportunityCards: [{
      id: 'card-1',
      title: '宽泛化工服务采购公告',
      sourceName: '能源一号',
      url: 'https://example.com/detail/old',
      buyerName: '中化',
      publishedAt: '2026-06-20',
      deadlineAt: '2026-06-25',
      matchedTerms: ['宽泛化工'],
      matchedSources: ['curated'],
      relevanceScore: 50,
      bidability: 'needs_manual_check',
      hardRequirements: [],
      riskFlags: [],
      missingInfo: [],
      recommendedAction: 'ask_boss',
      evidenceText: '宽泛化工服务采购公告',
      wechatSummary: '【待确认】能源一号 - 宽泛化工服务采购公告',
      confidence: 0.5,
    }],
  });
  store.updateOpportunityFeedback(firstTask.id, 0, {
    status: 'irrelevant',
    updatedAt: '2026-06-22T10:00:00.000Z',
  });
  const secondTask = store.createTask({
    sourceName: '能源一号',
    entryUrl: 'https://example.com/list',
    searchTerms: '宽泛化工',
  });
  const server = createLocalApiServer({
    store,
    port: 0,
    createBrowserRuntime: () => ({
      open: async () => ({ visibleText: '', url: 'https://example.com/list' }),
      close: async () => undefined,
    }),
    continueLocalTaskAfterHuman: async ({ task }) => ({
      status: 'completed',
      humanReason: '',
      observation: {
        title: task.sourceName,
        url: `${task.entryUrl}#/list`,
        visibleText: '宽泛化工服务采购公告',
      },
      candidateBundle: {
        source_name: task.sourceName,
        candidates: [{
          title: '宽泛化工服务采购公告',
          url: 'https://example.com/detail/new',
          published_at: '2026-06-22',
          deadline_at: '2026-06-30',
          buyer_name: '中化',
          raw_text: '宽泛化工服务采购公告',
          attachments: [],
        }],
      },
      artifacts: [],
      resultSummary: '',
    }),
  });
  await server.start();
  try {
    const baseUrl = server.url();
    await requestJson(baseUrl, `/tasks/${secondTask.id}/continue-run`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const tasks = await requestJson(baseUrl, '/tasks');
    const updated = tasks.body.tasks.find((task: any) => task.id === secondTask.id);

    assert.equal(updated.lastOpportunityCards[0].relevanceScore, 0);
    assert.equal(updated.lastOpportunityCards[0].recommendedAction, 'ignore');
    assert.deepEqual(updated.lastOpportunityCards[0].matchedTerms, []);
  } finally {
    await server.stop();
  }
});

test('local API start rejects when the configured port is already in use', async () => {
  const occupied = createLocalApiServer({ store: createTaskStore(), port: 0 });
  await occupied.start();
  try {
    const occupiedUrl = new URL(occupied.url());
    const blocked = createLocalApiServer({
      store: createTaskStore(),
      port: Number(occupiedUrl.port),
    });

    await assert.rejects(
      blocked.start(),
      (error) => error instanceof Error && 'code' in error && error.code === 'EADDRINUSE',
    );
  } finally {
    await occupied.stop();
  }
});

test('local API defaults browser profile and artifacts to the user data directory', () => {
  const dirs = resolveRuntimeDirs({
    sourceName: '华锦兵器网',
  }, {
    LOCALAPPDATA: 'C:\\Users\\wzc\\AppData\\Local',
  });

  assert.equal(
    dirs.profileDir,
    path.join('C:\\Users\\wzc\\AppData\\Local', 'HengHuaChengLocalHelper', 'profiles', '华锦兵器网'),
  );
  assert.equal(
    dirs.screenshotDir,
    path.join('C:\\Users\\wzc\\AppData\\Local', 'HengHuaChengLocalHelper', 'artifacts'),
  );
  assert.doesNotMatch(dirs.profileDir, /^profiles[\\/]/);
});

test('local API runtime directories preserve explicit env overrides', () => {
  const dirs = resolveRuntimeDirs({
    sourceName: '华锦兵器网',
  }, {
    LOCALAPPDATA: 'C:\\Users\\wzc\\AppData\\Local',
    HCZ_LOCAL_HELPER_PROFILE_DIR: 'D:\\hcz-profile',
    HCZ_LOCAL_HELPER_ARTIFACT_DIR: 'D:\\hcz-artifacts',
  });

  assert.equal(dirs.profileDir, 'D:\\hcz-profile');
  assert.equal(dirs.screenshotDir, 'D:\\hcz-artifacts');
});

test('local API serves fallback renderer pages for browser-based helper UI', async () => {
  const rendererDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcz-renderer-'));
  await fs.writeFile(path.join(rendererDir, 'pair.html'), '<!doctype html><script src="./pair.js"></script>', 'utf8');
  await fs.writeFile(path.join(rendererDir, 'pair.js'), 'window.__pair = true;', 'utf8');
  await fs.writeFile(path.join(rendererDir, 'tasks.html'), '<!doctype html><script src="./tasks.js"></script>', 'utf8');
  await fs.writeFile(path.join(rendererDir, 'tasks.js'), 'window.__tasks = true;', 'utf8');

  const server = createLocalApiServer({
    store: createTaskStore(),
    port: 0,
    rendererDir,
  });
  await server.start();
  try {
    const baseUrl = server.url();
    const pair = await fetch(`${baseUrl}/ui/pair`);
    const pairScript = await fetch(`${baseUrl}/ui/pair.js`);
    const tasks = await fetch(`${baseUrl}/ui/tasks`);

    assert.equal(pair.status, 200);
    assert.match(await pair.text(), /pair\.js/);
    assert.equal(pairScript.headers.get('content-type'), 'application/javascript; charset=utf-8');
    assert.match(await pairScript.text(), /__pair/);
    assert.match(await tasks.text(), /tasks\.js/);
  } finally {
    await server.stop();
    await fs.rm(rendererDir, { recursive: true, force: true });
  }
});

test('local API bridges cloud pairing and task channel endpoints', async () => {
  const cloud = createMockCloudServer();
  await cloud.start();
  const store = createTaskStore();
  const server = createLocalApiServer({ store, port: 0 });
  await server.start();
  try {
    const baseUrl = server.url();
    const cloudUrl = cloud.url();

    const pair = await requestJson(baseUrl, '/cloud/pair', {
      method: 'POST',
      body: JSON.stringify({
        cloudUrl,
        code: 'ABCD1234',
        deviceName: 'WX-PC-01',
        deviceFingerprint: 'fp-xw',
      }),
    });
    const heartbeat = await requestJson(baseUrl, '/cloud/heartbeat', { method: 'POST' });
    const tasks = await requestJson(baseUrl, '/cloud/tasks');
    const started = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/start', { method: 'POST' });
    const continued = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/continue', {
      method: 'POST',
      body: JSON.stringify({ observation: '验证码，需要人工接管。', requestHuman: true }),
    });

    assert.equal(pair.body.paired, true);
    assert.equal(heartbeat.body.release.updateAvailable, true);
    assert.equal(tasks.body.tasks.length, 1);
    assert.equal((await requestJson(baseUrl, '/health')).body.latestRelease.updateAvailable, true);
    assert.equal(tasks.body.tasks[0].sourceName, '华锦兵器网');
    assert.equal(started.body.run.id, 'run-1');
    assert.equal(continued.body.nextAction.type, 'request_human');
    assert.ok(cloud.calls.some((call) => call.authorization === 'Bearer cloud-token-xiaowei'));
  } finally {
    await server.stop();
    await cloud.stop();
  }
});

test('local API continue-run resumes the local browser task and updates task details', async () => {
  const cloud = createMockCloudServer();
  await cloud.start();
  const store = createTaskStore();
  const server = createLocalApiServer({
    store,
    port: 0,
    continueTaskAfterHuman: async ({ task, cloud: taskCloud }) => {
      await taskCloud.continue(task.id, {
        status: 'completed',
        observation: '员工已完成验证码，页面展示采购公告列表。',
        action: 'continue_after_human',
        screenshotPath: '/tmp/hcz-artifacts/task.png',
      });
      return {
        status: 'completed',
        observation: {
          title: '采购公告列表',
          url: task.entryUrl,
          visibleText: '员工已完成验证码，页面展示采购公告列表。',
          screenshotPath: '/tmp/hcz-artifacts/task.png',
        },
      };
    },
  });
  await server.start();
  try {
    const baseUrl = server.url();
    const cloudUrl = cloud.url();

    await requestJson(baseUrl, '/cloud/pair', {
      method: 'POST',
      body: JSON.stringify({
        cloudUrl,
        code: 'ABCD1234',
        deviceName: 'WX-PC-01',
        deviceFingerprint: 'fp-xw',
      }),
    });
    await requestJson(baseUrl, '/cloud/tasks');
    const continued = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/continue-run', {
      method: 'POST',
    });
    const tasks = await requestJson(baseUrl, '/tasks');

    assert.equal(continued.body.status, 'completed');
    assert.equal(tasks.body.tasks[0].status, 'completed');
    assert.equal(tasks.body.tasks[0].lastObservation, '员工已完成验证码，页面展示采购公告列表。');
    assert.equal(tasks.body.tasks[0].lastScreenshotPath, '/tmp/hcz-artifacts/task.png');
  } finally {
    await server.stop();
    await cloud.stop();
  }
});

test('local API marks continue-run as waiting when the runner still needs human input', async () => {
  const cloud = createMockCloudServer();
  await cloud.start();
  const store = createTaskStore();
  const server = createLocalApiServer({
    store,
    port: 0,
    continueTaskAfterHuman: async ({ task, cloud: taskCloud }) => {
      await taskCloud.continue(task.id, {
        status: 'request_human',
        requestHuman: true,
        observation: '采到了文本，但没有可入库商机。',
        action: 'continue_after_human',
      });
      return {
        status: 'request_human',
        humanReason: '本地助手已采集候选 1 条，但没有生成可入库商机。',
        observation: {
          title: '门户首页',
          url: task.entryUrl,
          visibleText: '采到了文本，但没有可入库商机。',
        },
      };
    },
  });
  await server.start();
  try {
    const baseUrl = server.url();
    const cloudUrl = cloud.url();

    await requestJson(baseUrl, '/cloud/pair', {
      method: 'POST',
      body: JSON.stringify({
        cloudUrl,
        code: 'ABCD1234',
        deviceName: 'WX-PC-01',
        deviceFingerprint: 'fp-xw',
      }),
    });
    await requestJson(baseUrl, '/cloud/tasks');
    const continued = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/continue-run', {
      method: 'POST',
    });
    const tasks = await requestJson(baseUrl, '/tasks');

    assert.equal(continued.body.status, 'request_human');
    assert.equal(tasks.body.tasks[0].status, 'waiting_agent');
    assert.match(tasks.body.tasks[0].lastLog, /没有生成可入库商机/);
  } finally {
    await server.stop();
    await cloud.stop();
  }
});

test('local API reuses the same browser runtime between open and continue-run for a cloud task', async () => {
  const cloud = createMockCloudServer();
  await cloud.start();
  const store = createTaskStore();
  let browserFromOpen: unknown = null;
  let browserFromContinue: unknown = null;
  const server = createLocalApiServer({
    store,
    port: 0,
    runTask: async ({ task, browser, cloud: taskCloud }) => {
      browserFromOpen = browser;
      await taskCloud.start(task.id, { entryUrl: task.entryUrl });
      await taskCloud.continue(task.id, {
        status: 'request_human',
        requestHuman: true,
        observation: '请先登录。',
        action: 'open_task',
      });
      return {
        status: 'request_human',
        observation: {
          title: '登录',
          url: task.entryUrl,
          visibleText: '请先登录。',
        },
        humanReason: '需要登录',
      };
    },
    continueTaskAfterHuman: async ({ task, browser, cloud: taskCloud }) => {
      browserFromContinue = browser;
      await taskCloud.continue(task.id, {
        status: 'completed',
        observation: '已登录，看到公告列表。',
        action: 'continue_after_human',
      });
      return {
        status: 'completed',
        observation: {
          title: '公告列表',
          url: `${task.entryUrl}#/list`,
          visibleText: '已登录，看到公告列表。',
        },
      };
    },
  });
  await server.start();
  try {
    const baseUrl = server.url();
    const cloudUrl = cloud.url();

    await requestJson(baseUrl, '/cloud/pair', {
      method: 'POST',
      body: JSON.stringify({
        cloudUrl,
        code: 'ABCD1234',
        deviceName: 'WX-PC-01',
        deviceFingerprint: 'fp-xw',
      }),
    });
    await requestJson(baseUrl, '/cloud/tasks');
    const opened = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/run', { method: 'POST' });
    const continued = await requestJson(baseUrl, '/cloud/tasks/cloud-task-huajin/continue-run', { method: 'POST' });

    assert.equal(opened.body.status, 'request_human');
    assert.equal(continued.body.status, 'completed');
    assert.ok(browserFromOpen);
    assert.equal(browserFromContinue, browserFromOpen);
  } finally {
    await server.stop();
    await cloud.stop();
  }
});
