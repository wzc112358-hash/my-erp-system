import test from 'node:test';
import assert from 'node:assert/strict';

import {
  continueLocalAgentTaskAfterHuman,
  openLocalAgentTask,
  summarizeCandidateBundle,
} from './local-agent-runner.ts';

test('local agent runner opens a site and pauses for employee verification', async () => {
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
    screenshot: async () => '/tmp/hcz/open.png',
  };

  const result = await openLocalAgentTask({
    task: {
      id: 'task-huajin',
      sourceName: '华锦兵器网',
      entryUrl: 'https://www.norincogroup-ebuy.com/',
    },
    browser,
  });

  assert.equal(result.status, 'request_human');
  assert.equal(result.candidateBundle, null);
  assert.equal(result.observation?.screenshotPath, '/tmp/hcz/open.png');
  assert.match(result.humanReason, /验证码/);
});

test('local agent runner continues after employee takeover and returns candidates', async () => {
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
      links: [{ text: '下载招标文件', href: 'https://www.norincogroup-ebuy.com/files/tender.pdf' }],
    }),
    screenshot: async () => '/tmp/hcz/continue.png',
  };

  const result = await continueLocalAgentTaskAfterHuman({
    task: {
      id: 'task-huajin',
      sourceName: '华锦兵器网',
      entryUrl: 'https://www.norincogroup-ebuy.com/',
    },
    browser,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.equal(result.artifacts[0].artifact_type, 'dom_snapshot');
  assert.match(result.resultSummary, /1 条候选/);
});

test('local agent summary explains empty candidate result', () => {
  assert.match(summarizeCandidateBundle(null), /没有识别/);
});
