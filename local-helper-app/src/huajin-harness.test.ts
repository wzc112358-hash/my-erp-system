import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeHuajinObservation,
  createHuajinHarness,
  extractHuajinCandidateBundle,
} from './huajin-harness.ts';

const task = {
  id: 'task-huajin-1',
  sourceName: '华锦兵器网',
  entryUrl: 'https://www.norincogroup-ebuy.com/',
  searchTerms: '消泡剂,液氮',
};

test('huajin observation asks for human takeover on login or captcha states', () => {
  const result = analyzeHuajinObservation({
    title: '供应商登录',
    url: 'https://www.norincogroup-ebuy.com/',
    visibleText: '请输入账号 密码 验证码',
  });

  assert.equal(result.status, 'request_human');
  assert.match(result.reason, /验证码/);
});

test('huajin candidate extraction converts visible notice text to CandidateBundle', () => {
  const bundle = extractHuajinCandidateBundle({
    title: '华锦兵器网',
    url: 'https://www.norincogroup-ebuy.com/notice/list',
    visibleText: [
      '首页 登录',
      '2026-05-27 华锦精细化工消泡剂采购询价公告 报价截止 2026-05-30',
      '2026-05-26 办公用品采购公告',
    ].join('\n'),
  }, task);

  assert.equal(bundle.source_name, '华锦兵器网');
  assert.equal(bundle.candidates.length, 2);
  assert.match(bundle.candidates[0].title, /消泡剂/);
  assert.equal(bundle.candidates[0].published_at, '2026-05-27');
});

test('huajin harness opens local browser, pauses for human, then continues after login', async () => {
  const browser = {
    open: async () => ({
      title: '华锦兵器网 登录',
      url: 'https://www.norincogroup-ebuy.com/',
      visibleText: '供应商登录 验证码',
    }),
    observe: async () => ({
      title: '询价交易',
      url: 'https://www.norincogroup-ebuy.com/notice/list',
      visibleText: '2026-05-27 华锦化工液氮采购询价公告 截止 2026-05-29',
    }),
  };
  const harness = createHuajinHarness({ browser });

  const first = await harness.openTask(task);
  const continued = await harness.continueTask(task);

  assert.equal(first.status, 'request_human');
  assert.equal(continued.status, 'completed');
  assert.equal(continued.candidateBundle?.candidates.length, 1);
  assert.match(continued.candidateBundle?.candidates[0].title || '', /液氮/);
});
