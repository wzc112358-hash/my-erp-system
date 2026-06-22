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

test('task store exposes the configured helper version', () => {
  const store = createTaskStore({ helperVersion: '0.1.4' });

  assert.equal(store.health().helperVersion, '0.1.4');
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

test('task store stores public LLM settings without exposing api key in health', () => {
  const persisted: Array<unknown> = [];
  const store = createTaskStore({
    configStore: {
      readCloudPairing: () => null,
      writeCloudPairing: () => undefined,
      clearCloudPairing: () => undefined,
      readLLMConfig: () => null,
      writeLLMConfig: (config: unknown) => persisted.push(config),
      clearLLMConfig: () => undefined,
    },
  });

  const settings = store.setLLMConfig({
    enabled: true,
    baseUrl: 'https://llm.example/v1/',
    apiKey: 'sk-local',
    model: 'demo-model',
  });

  assert.equal(settings.baseUrl, 'https://llm.example/v1');
  assert.equal(settings.hasApiKey, true);
  assert.equal((store.getLLMConfig({ includeApiKey: true }) as { apiKey: string }).apiKey, 'sk-local');
  assert.equal((store.health().llm as { hasApiKey: boolean }).hasApiKey, true);
  assert.equal('apiKey' in (store.health().llm as Record<string, unknown>), false);
  assert.equal((persisted[0] as { apiKey: string }).apiKey, 'sk-local');
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

test('task store creates local tasks with known site entry URL defaults', () => {
  const store = createTaskStore();

  const task = store.createTask({
    sourceName: '中石油招投标网',
    searchTerms: '缓蚀剂',
  });

  assert.match(task.id, /^local-/);
  assert.equal(task.mode, 'local');
  assert.equal(task.entryUrl, 'https://www.cnpcbidding.com/#/tenders');
  assert.equal(task.searchTerms, '缓蚀剂');
});

test('task store fills known site search terms and action steps when omitted', () => {
  const store = createTaskStore();

  const task = store.createTask({
    sourceName: '裕龙招投标网',
  });

  assert.equal(task.entryUrl, 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96');
  assert.match(task.searchTerms || '', /裕龙石化/);
  assert.match(task.actionSteps || '', /安全验证/);
});

test('task store keeps local agent candidate bundle and artifacts', () => {
  const store = createTaskStore();
  const task = store.createTask({
    sourceName: '华锦兵器网',
    searchTerms: '消泡剂',
  });

  const updated = store.continueTask(task.id, {
    status: 'completed',
    observation: '2026-05-27 华锦化工消泡剂采购询价公告',
    candidateBundle: {
      source_name: '华锦兵器网',
      candidates: [{
        title: '华锦化工消泡剂采购询价公告',
        url: 'https://example.com/notice/1',
        published_at: '2026-05-27',
        deadline_at: '',
        buyer_name: '华锦兵器网',
        raw_text: '2026-05-27 华锦化工消泡剂采购询价公告',
        attachments: [],
      }],
    },
    artifacts: [{
      artifact_type: 'dom_snapshot',
      title: '华锦 DOM 快照',
      url: 'https://example.com',
      content: '<html></html>',
      mime_type: 'text/html',
    }],
    resultSummary: '本次采集识别到 1 条候选公告。',
    discoveredLinks: [{
      title: '华锦化工消泡剂采购询价公告',
      url: 'https://example.com/notice/1',
      source: 'mock-search',
      score: 88,
    }],
    opportunityCards: [{
      id: '华锦兵器网|华锦化工消泡剂采购询价公告|https://example.com/notice/1',
      title: '华锦化工消泡剂采购询价公告',
      sourceName: '华锦兵器网',
      url: 'https://example.com/notice/1',
      buyerName: '华锦兵器网',
      publishedAt: '2026-05-27',
      deadlineAt: '',
      matchedTerms: ['消泡剂'],
      matchedSources: ['erp_history'],
      relevanceScore: 70,
      bidability: 'needs_manual_check',
      hardRequirements: [],
      riskFlags: [],
      missingInfo: ['规格、数量、包装待确认'],
      recommendedAction: 'deep_read_document',
      evidenceText: '华锦化工消泡剂采购询价公告',
      wechatSummary: '【待确认】华锦兵器网 - 华锦化工消泡剂采购询价公告',
      confidence: 0.7,
    }],
  });

  assert.equal(updated.status, 'completed');
  assert.equal(updated.lastCandidateBundle?.candidates[0].title, '华锦化工消泡剂采购询价公告');
  assert.equal(updated.lastArtifacts?.[0].artifact_type, 'dom_snapshot');
  assert.match(updated.lastResultSummary || '', /1 条候选/);
  assert.equal(updated.lastDiscoveredLinks?.[0].source, 'mock-search');
  assert.equal(updated.lastOpportunityCards?.[0].matchedTerms[0], '消泡剂');
});

test('task store writes opportunity feedback without losing candidate data', () => {
  const store = createTaskStore();
  const task = store.createTask({
    sourceName: '能源一号',
    searchTerms: '阻聚剂',
  });
  const bundle = {
    source_name: '能源一号',
    candidates: [{
      title: '阻聚剂采购询源公告',
      url: 'https://example.com/notice/1',
      published_at: '2026-06-20',
      deadline_at: '2026-06-25',
      buyer_name: '中化',
      raw_text: '阻聚剂采购询源公告',
      attachments: [],
    }],
  };
  const continued = store.continueTask(task.id, {
    status: 'completed',
    candidateBundle: bundle,
    opportunityCards: [{
      id: 'card-1',
      title: '阻聚剂采购询源公告',
      sourceName: '能源一号',
      url: 'https://example.com/notice/1',
      buyerName: '中化',
      publishedAt: '2026-06-20',
      deadlineAt: '2026-06-25',
      matchedTerms: ['阻聚剂'],
      matchedSources: ['erp_history'],
      relevanceScore: 84,
      bidability: 'needs_manual_check',
      hardRequirements: [],
      riskFlags: [],
      missingInfo: [],
      recommendedAction: 'deep_read_document',
      evidenceText: '阻聚剂采购询源公告',
      wechatSummary: '【待确认】能源一号 - 阻聚剂采购询源公告',
      confidence: 0.84,
    }],
  });

  const result = store.updateOpportunityFeedback(continued.id, 0, {
    status: 'sent_to_group',
    note: '已复制并发群',
    updatedAt: '2026-06-22T10:00:00.000Z',
  });

  assert.equal(result.card.feedbackStatus, 'sent_to_group');
  assert.equal(result.card.erpReviewDraft?.decision, 'follow');
  assert.match(result.task.lastLog || '', /员工反馈/);
  assert.equal(result.task.lastCandidateBundle?.candidates[0].title, '阻聚剂采购询源公告');
  assert.equal(result.task.lastOpportunityCards?.[0].feedbackNote, '已复制并发群');
});

test('task store persists feedback learning and exposes learned product terms', () => {
  let persistedLearning: any = null;
  const configStore = {
    readCloudPairing: () => null,
    writeCloudPairing: () => undefined,
    clearCloudPairing: () => undefined,
    readFeedbackLearning: () => persistedLearning,
    writeFeedbackLearning: (state: any) => {
      persistedLearning = state;
    },
    clearFeedbackLearning: () => {
      persistedLearning = null;
    },
  };
  const store = createTaskStore({ configStore });
  const task = store.createTask({
    sourceName: '能源一号',
    searchTerms: '宽泛化工',
  });
  store.continueTask(task.id, {
    status: 'completed',
    opportunityCards: [{
      id: 'card-1',
      title: '宽泛化工服务采购公告',
      sourceName: '能源一号',
      url: 'https://example.com/notice/2',
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

  const result = store.updateOpportunityFeedback(task.id, 0, {
    status: 'irrelevant',
    updatedAt: '2026-06-22T12:00:00.000Z',
  });
  const terms = store.getProductTerms([{
    term: '宽泛化工',
    sources: ['curated'],
    weight: 50,
  }]);

  assert.equal(result.learning.negativeCount, 1);
  assert.equal(persistedLearning.terms['宽泛化工'].weightDelta, -60);
  assert.equal(terms[0].weight, -10);

  const restarted = createTaskStore({ configStore });
  assert.equal(restarted.getFeedbackLearningSummary().negativeCount, 1);
  assert.equal(restarted.getProductTerms([{ term: '宽泛化工', sources: ['curated'], weight: 50 }])[0].weight, -10);
});

test('task store persists local schedules and marks due runs', () => {
  let persistedSchedules: any[] = [];
  const configStore = {
    readCloudPairing: () => null,
    writeCloudPairing: () => undefined,
    clearCloudPairing: () => undefined,
    readLocalSchedules: () => persistedSchedules,
    writeLocalSchedules: (schedules: any[]) => {
      persistedSchedules = schedules;
    },
    clearLocalSchedules: () => {
      persistedSchedules = [];
    },
  };
  const store = createTaskStore({ configStore });
  const schedule = store.upsertSchedule({
    id: 'schedule-1',
    sourceName: '能源一号（兰州恒化成）',
    times: '09:00,15:00',
    runMode: 'create_task_only',
  });
  const due = store.dueSchedules({
    now: new Date('2026-06-22T09:05:00+08:00'),
    windowMinutes: 10,
  });

  assert.equal(schedule.searchTerms.includes('恒化成'), true);
  assert.equal(due.length, 1);
  assert.equal(due[0].runKey, '2026-06-22 09:00');

  store.markScheduleRun(schedule.id, {
    runKey: due[0].runKey,
    taskId: 'task-1',
    status: 'created',
    ranAt: '2026-06-22T09:05:00.000Z',
  });

  assert.equal(persistedSchedules[0].lastTaskId, 'task-1');
  assert.equal(store.dueSchedules({
    now: new Date('2026-06-22T09:06:00+08:00'),
    windowMinutes: 10,
  }).length, 0);

  const restarted = createTaskStore({ configStore });
  assert.equal(restarted.listSchedules()[0].lastTaskId, 'task-1');
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

test('task store fills known site entry URLs when cloud sync omits them', () => {
  const store = createTaskStore();

  const synced = store.syncCloudTasks([{
    id: 'task-cnpc-empty-entry',
    sourceName: '中石油招投标网',
    entryUrl: '',
    status: 'pending',
  }]);

  assert.equal(synced[0].entryUrl, 'https://www.cnpcbidding.com/#/tenders');
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
