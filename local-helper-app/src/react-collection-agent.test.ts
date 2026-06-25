import test from 'node:test';
import assert from 'node:assert/strict';

import { runReActCollectionAgent } from './react-collection-agent.ts';
import type { SearchAdapter } from './agent-search-adapter.ts';

const task = {
  id: 'task-react-1',
  sourceName: '能源一号',
  entryUrl: 'https://example.com/list',
  searchTerms: '阻聚剂',
};

test('ReAct collection agent searches, opens, reads documents, and completes candidates', async () => {
  const steps: any[] = [];
  const openedUrls: string[] = [];
  const search: SearchAdapter = {
    name: 'mock-search',
    async discoverLinks() {
      return {
        provider: 'mock-search',
        query: 'site:example.com 阻聚剂',
        warnings: [],
        links: [{
          title: '阻聚剂采购询源公告',
          url: 'https://example.com/detail/1',
          description: '公开公告',
          source: 'mock-search',
          score: 95,
        }],
      };
    },
  };
  const result = await runReActCollectionAgent({
    task,
    search,
    recordStep: (step) => steps.push(step),
    documentReader: async () => [{
      title: '采购文件.pdf',
      url: 'https://example.com/file.pdf',
      contentType: 'application/pdf',
      text: '附件要求：代理商需提供厂家授权。',
    }],
    browser: {
      open: async (url) => {
        openedUrls.push(url);
        return {
          title: '阻聚剂采购询源公告',
          url,
          visibleText: '2026-06-22 阻聚剂采购询源公告 报价截止 2026-06-25',
          links: [{
            text: '下载采购文件',
            href: 'https://example.com/file.pdf',
          }],
          domSnapshot: '<html>阻聚剂采购询源公告</html>',
        };
      },
      observe: async () => ({
        title: '',
        url: '',
        visibleText: '',
      }),
      screenshot: async () => '/tmp/hcz/react.png',
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(openedUrls, ['https://example.com/detail/1']);
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.match(result.candidateBundle?.candidates[0].raw_text || '', /厂家授权/);
  assert.equal(result.documents.length, 1);
  assert.ok(result.artifacts.some((artifact) => artifact.artifact_type === 'manual_text'));
  assert.deepEqual(result.iterations.map((item) => item.action.type), [
    'search',
    'open_url',
    'read_documents',
    'finish',
  ]);
  assert.ok(steps.some((step) => step.action === 'react_decide_next_action'));
  assert.ok(steps.some((step) => step.tool === 'link_discovery.search'));
  assert.ok(steps.some((step) => step.tool === 'playwright-cdp.open'));
  assert.ok(steps.some((step) => step.tool === 'documents.read'));
});

test('ReAct collection agent requests human takeover on login verification pages', async () => {
  const search: SearchAdapter = {
    name: 'mock-search',
    async discoverLinks() {
      return {
        provider: 'mock-search',
        query: 'site:example.com',
        warnings: [],
        links: [{
          title: '能源一号入口',
          url: 'https://example.com/login',
          source: 'mock-search',
          score: 50,
        }],
      };
    },
  };
  const result = await runReActCollectionAgent({
    task,
    search,
    browser: {
      open: async (url) => ({
        title: '供应商登录',
        url,
        visibleText: '账号 密码 验证码',
      }),
      observe: async () => ({
        title: '供应商登录',
        url: 'https://example.com/login',
        visibleText: '账号 密码 验证码',
      }),
    },
  });

  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /登录|验证码|人工|安全验证/);
  assert.equal(result.candidateBundle, null);
});

