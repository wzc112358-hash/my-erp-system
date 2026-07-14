import assert from 'node:assert/strict';
import test from 'node:test';

import type { BrowserSession } from '../browser/types.ts';
import { runCollection } from './pipeline.ts';

const idleBrowser: BrowserSession = {
  engine: 'test',
  open: async () => ({ title: '', url: '', visibleText: '' }),
  observe: async () => ({ title: '', url: '', visibleText: '' }),
};

test('collection run completes authoritative public feeds through one path', async () => {
  const result = await runCollection({
    task: { id: 'task-1', sourceName: '国能E购', entryUrl: '', searchTerms: '阻聚剂' },
    browser: idleBrowser,
    publicFeedCollector: async () => ({
      provider: 'test-feed',
      status: 'success',
      warnings: [],
      artifacts: [],
      candidateBundle: {
        source_name: '国能E购',
        candidates: [{
          title: '循环水阻聚剂采购公告',
          url: 'https://example.com/1',
          published_at: '2026-07-14',
          deadline_at: '',
          buyer_name: '测试公司',
          raw_text: '采购阻聚剂',
          attachments: [],
        }],
      },
    }),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.notEqual(result.screenedNotices?.[0]?.recommendedAction, 'ignore');
});

test('collection run returns a real no-new conclusion from an authoritative feed', async () => {
  const result = await runCollection({
    task: { id: 'task-2', sourceName: '易派克', entryUrl: '' },
    browser: idleBrowser,
    publicFeedCollector: async () => ({
      provider: 'test-feed', status: 'no_new', warnings: [], artifacts: [], candidateBundle: null,
    }),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle, null);
  assert.match(result.resultSummary, /没有新公告/);
});

test('collection run stops immediately when network evidence identifies a challenge', async () => {
  let screenshots = 0;
  const browser: BrowserSession = {
    engine: 'test',
    open: async () => ({
      title: '全国招标公告公示搜索引擎',
      url: 'https://ctbpsp.com/#/bulletinList',
      visibleText: '加载中...',
      networkResponses: [{
        url: 'https://ctbpsp.com/cutominfoapi/searchkeyword',
        status: 200,
        contentType: 'text/html',
        responseHeaders: { 'punish-type': 'sigchl' },
        challenge: true,
      }],
    }),
    observe: async () => ({ title: '', url: '', visibleText: '' }),
    screenshot: async () => { screenshots += 1; return '/tmp/challenge.png'; },
  };
  const result = await runCollection({
    task: { id: 'task-yulong', sourceName: '裕龙招投标网', entryUrl: 'https://ctbpsp.com/' },
    browser,
  });
  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /安全挑战/);
  assert.equal(screenshots, 1);
});

test('collection run merges LLM page extraction with deterministic extraction', async () => {
  const steps: string[] = [];
  const browser: BrowserSession = {
    engine: 'test',
    open: async () => ({
      title: '裕龙采购平台',
      url: 'https://example.com/list',
      visibleText: '裕龙石化最新采购信息',
      links: [{ text: '采购详情', href: 'https://example.com/detail/1' }],
    }),
    observe: async () => ({ title: '', url: '', visibleText: '' }),
  };
  const result = await runCollection({
    task: { id: 'task-llm', sourceName: '裕龙招投标网', entryUrl: 'https://example.com/list', searchTerms: '硅油' },
    browser,
    llmCandidateExtractor: async () => ({
      source_name: '裕龙招投标网',
      candidates: [{
        title: '裕龙石化二甲基硅油采购招标公告',
        url: 'https://example.com/detail/1',
        published_at: '2026-07-14',
        deadline_at: '',
        buyer_name: '裕龙石化',
        raw_text: '二甲基硅油采购',
        attachments: [],
      }],
    }),
    recordStep: (step) => { steps.push(step.action); },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle?.candidates[0]?.title, '裕龙石化二甲基硅油采购招标公告');
  assert.ok(steps.includes('extract_candidates'));
});
