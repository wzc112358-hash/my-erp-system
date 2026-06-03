import test from 'node:test';
import assert from 'node:assert/strict';

import { runLocalHelperTask } from './task-runner.ts';

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

test('task runner sends CandidateBundle after successful local extraction', async () => {
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

  assert.equal(result.status, 'completed');
  assert.equal(cloudEvents[0].status, 'completed');
  assert.equal((cloudEvents[0].candidateBundle as any).candidates.length, 1);
});
