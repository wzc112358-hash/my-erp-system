import test from 'node:test';
import assert from 'node:assert/strict';

import { runControlledLocalAgentTask } from './controlled-local-agent.ts';
import type { SearchAdapter } from './agent-search-adapter.ts';

const task = {
  id: 'local-agent-1',
  sourceName: '中石油招投标网',
  entryUrl: 'https://www.cnpcbidding.com/#/tenders',
  searchTerms: '缓蚀剂',
};

test('controlled local agent opens the best discovered link and completes public candidates', async () => {
  let openedUrl = '';
  const steps: any[] = [];
  const search: SearchAdapter = {
    name: 'mock-search',
    async discoverLinks() {
      return {
        provider: 'mock-search',
        query: 'site:cnpcbidding.com 缓蚀剂',
        warnings: [],
        links: [{
          title: '中石油缓蚀剂采购询价公告',
          url: 'https://www.cnpcbidding.com/#/detail/notice-1',
          description: '公开公告',
          source: 'mock-search',
          score: 99,
        }],
      };
    },
  };
  const browser = {
    open: async (url: string) => {
      openedUrl = url;
      return {
        title: '中石油招投标网',
        url,
        visibleText: '2026-06-20 中石油缓蚀剂采购询价公告 截止 2026-06-25',
        domSnapshot: '<html>中石油缓蚀剂采购询价公告</html>',
      };
    },
    observe: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
    screenshot: async () => '/tmp/hcz/agent.png',
  };

  const result = await runControlledLocalAgentTask({
    task,
    browser,
    search,
    recordStep: (step) => steps.push(step),
  });

  assert.equal(openedUrl, 'https://www.cnpcbidding.com/#/detail/notice-1');
  assert.equal(result.status, 'completed');
  assert.equal(result.discoveredLinks?.length, 1);
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.match(result.resultSummary, /发现 1 条招投标候选|1 条候选/);
  assert.equal(result.artifacts[0].artifact_type, 'log');
  assert.ok(steps.some((step) => step.tool === 'link_discovery.search'));
  assert.ok(steps.some((step) => step.tool === 'playwright-cdp.open'));
  assert.ok(steps.some((step) => step.tool === 'playwright-cdp.screenshot'));
});

test('controlled local agent requests human takeover when discovered page needs login', async () => {
  const search: SearchAdapter = {
    name: 'mock-search',
    async discoverLinks({ task: inputTask }) {
      return {
        provider: 'mock-search',
        query: inputTask.sourceName,
        warnings: ['mock warning'],
        links: [],
      };
    },
  };
  const browser = {
    open: async (url: string) => ({
      title: '供应商登录',
      url,
      visibleText: '账号 密码 验证码',
    }),
    observe: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
  };

  const result = await runControlledLocalAgentTask({ task, browser, search });

  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /登录|验证码|人工/);
  assert.match(result.resultSummary, /mock warning/);
});
