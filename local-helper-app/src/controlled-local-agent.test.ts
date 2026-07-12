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

test('controlled local agent uses site public feed before browser fallback', async () => {
  let opened = false;
  const steps: any[] = [];
  const result = await runControlledLocalAgentTask({
    task: {
      id: 'task-egou',
      sourceName: '国能E购',
      entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
      searchTerms: '亚硫酸钠',
    },
    browser: {
      open: async () => {
        opened = true;
        return { title: '', url: '', visibleText: '' };
      },
      observe: async () => ({ title: '', url: '', visibleText: '' }),
    },
    search: {
      name: 'mock-search',
      async discoverLinks() {
        throw new Error('search should not run when public feed succeeds');
      },
    },
    publicFeedCollector: async ({ task }) => ({
      provider: 'site-public-feed:guoneng-egou',
      status: 'success',
      warnings: [],
      artifacts: [{
        artifact_type: 'network_response',
        title: '国能E购 feed',
        url: task.entryUrl,
        content: '{"rows":[]}',
        mime_type: 'application/json',
      }],
      candidateBundle: {
        source_name: task.sourceName,
        candidates: [{
          title: '化工中心焦亚硫酸钠询价采购项目采购',
          url: 'https://example.com/neep/1.html',
          published_at: '2026-05-27',
          deadline_at: '2026-05-31',
          buyer_name: '化工中心',
          raw_text: '化工中心焦亚硫酸钠询价采购项目采购 报价截止 2026-05-31',
          attachments: [],
        }],
      },
    }),
    recordStep: (step) => steps.push(step),
  });

  assert.equal(opened, false);
  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.match(result.resultSummary, /商机卡片|候选/);
  assert.ok(steps.some((step) => step.action === 'collect_site_public_feed'));
});

test('controlled local agent completes no-match when an authoritative public feed is all low relevance', async () => {
  let searched = false;
  let openedUrl = '';
  const steps: any[] = [];
  const result = await runControlledLocalAgentTask({
    task: {
      id: 'task-egou-low',
      sourceName: '国能E购',
      entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
      searchTerms: '焦亚硫酸钠,消泡剂',
    },
    browser: {
      open: async (url: string) => {
        openedUrl = url;
        return {
          title: '国能E购详情',
          url,
          visibleText: '2026-06-26 焦亚硫酸钠采购询价公告 报价截止 2026-06-30',
          domSnapshot: '<html>焦亚硫酸钠采购询价公告</html>',
        };
      },
      observe: async () => ({ title: '', url: '', visibleText: '' }),
      screenshot: async () => '/tmp/hcz/deep.png',
    },
    search: {
      name: 'mock-search',
      async discoverLinks() {
        searched = true;
        return {
          provider: 'mock-search',
          query: 'site:neep.shop 焦亚硫酸钠 询价采购',
          warnings: [],
          links: [{
            title: '焦亚硫酸钠采购询价公告',
            url: 'https://neep.shop/detail/1.html',
            description: '报价截止 2026-06-30',
            source: 'mock-search',
            score: 99,
          }],
        };
      },
    },
    publicFeedCollector: async ({ task }) => ({
      provider: 'site-public-feed:guoneng-egou',
      status: 'success',
      warnings: [],
      artifacts: [{
        artifact_type: 'network_response',
        title: '国能E购 feed',
        url: task.entryUrl,
        content: '{"rows":[]}',
        mime_type: 'application/json',
      }],
      candidateBundle: {
        source_name: task.sourceName,
        candidates: [{
          title: '电脑维护服务采购项目询价采购',
          url: 'https://example.com/neep/office.html',
          published_at: '2026-05-27',
          deadline_at: '2026-05-31',
          buyer_name: '综合部',
          raw_text: '电脑维护服务采购项目询价采购',
          attachments: [],
        }],
      },
    }),
    recordStep: (step) => steps.push(step),
  });

  assert.equal(searched, false);
  assert.equal(openedUrl, '');
  assert.equal(result.status, 'completed');
  assert.match(result.resultSummary, /没有筛选出/);
  assert.match(result.candidateBundle?.candidates[0]?.title || '', /电脑维护/);
  assert.equal(result.opportunityCards?.some((card) => card.recommendedAction !== 'ignore'), false);
  assert.ok(steps.some((step) => step.action === 'public_feed_no_matches'));
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
