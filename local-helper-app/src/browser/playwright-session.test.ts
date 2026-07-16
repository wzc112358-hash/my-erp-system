import test from 'node:test';
import assert from 'node:assert/strict';

import {
  browserChannelCandidatesFor,
  createPlaywrightRuntime,
  proxyServerFor,
} from './playwright-session.ts';

test('playwright runtime opens urls in persistent profile and captures visible text', async () => {
  const calls: string[] = [];
  const handlers: Record<string, (payload: unknown) => void> = {};
  const fakePage = {
    goto: async (url: string) => {
      calls.push(`goto:${url}`);
      handlers.response?.({
        url: () => 'https://www.norincogroup-ebuy.com/api/notice/list',
        status: () => 200,
        headers: () => ({ 'content-type': 'application/json' }),
        text: async () => '{"title":"华锦化工液氮采购询价公告"}',
      });
    },
    title: async () => '华锦兵器网',
    url: () => 'https://www.norincogroup-ebuy.com/notice/list',
    content: async () => '<html><body><a href="/notice/1">华锦化工液氮采购询价公告</a></body></html>',
    locator: () => ({
      innerText: async () => '2026-05-27 华锦化工液氮采购询价公告',
      evaluateAll: async () => [{
        text: '华锦化工液氮采购询价公告',
        href: 'https://www.norincogroup-ebuy.com/notice/1',
        title: '',
      }],
    }),
    screenshot: async ({ path }: { path: string }) => {
      calls.push(`screenshot:${path}`);
      return Buffer.from('');
    },
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers[event] = handler;
    },
  };
  const fakeContext = {
    pages: () => [fakePage],
    newPage: async () => fakePage,
  };
  const chromium = {
    launchPersistentContext: async (profileDir: string, options: Record<string, unknown>) => {
      calls.push(`profile:${profileDir}`);
      calls.push(`headless:${String(options.headless)}`);
      return fakeContext;
    },
  };
  const runtime = createPlaywrightRuntime({
    chromium,
    profileDir: 'profiles/huajin',
    screenshotDir: 'artifacts',
    headless: false,
    captureDomSnapshot: true,
  });

  const observation = await runtime.open('https://www.norincogroup-ebuy.com/');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const enrichedObservation = await runtime.observe();
  const screenshotPath = await runtime.screenshot?.() || '';

  assert.equal(observation.title, '华锦兵器网');
  assert.equal(observation.visibleText, '2026-05-27 华锦化工液氮采购询价公告');
  assert.match(enrichedObservation.domSnapshot || '', /液氮采购/);
  assert.equal(enrichedObservation.links?.[0]?.href, 'https://www.norincogroup-ebuy.com/notice/1');
  assert.equal(enrichedObservation.networkResponses?.[0]?.status, 200);
  assert.match(screenshotPath, /artifacts/);
  assert.deepEqual(calls.slice(0, 3), [
    'profile:profiles/huajin',
    'headless:false',
    'goto:https://www.norincogroup-ebuy.com/',
  ]);
});

test('playwright runtime reuses existing page for observe', async () => {
  let observeCount = 0;
  const fakePage = {
    goto: async () => {},
    title: async () => '询价交易',
    url: () => 'https://example.com/list',
    locator: () => ({
      innerText: async () => {
        observeCount += 1;
        return `公告 ${observeCount}`;
      },
    }),
  };
  const chromium = {
    launchPersistentContext: async () => ({
      pages: () => [fakePage],
      newPage: async () => fakePage,
    }),
  };

  const runtime = createPlaywrightRuntime({ chromium, profileDir: 'profiles/huajin' });

  assert.equal((await runtime.observe()).visibleText, '公告 1');
  assert.equal((await runtime.observe()).visibleText, '公告 2');
});

test('playwright adapter executes the shared search and document actions', async () => {
  const evaluated: string[] = [];
  const fakePage = {
    goto: async () => {},
    waitForTimeout: async () => {},
    title: async () => '中国石油招标投标网',
    url: () => 'https://www.cnpcbidding.com/#/tenders',
    locator: () => ({ innerText: async () => '' }),
    evaluate: async <T>(script: string): Promise<T> => {
      evaluated.push(script);
      if (script.includes('HCZ_PAGE_OBSERVATION')) {
        return {
          title: '中国石油招标投标网',
          url: 'https://www.cnpcbidding.com/#/tenders',
          visibleText: '阻聚剂采购招标公告',
          links: [],
          interactiveElements: [],
          listItems: [{ title: '阻聚剂采购招标公告', elementId: 'hcz-3' }],
        } as T;
      }
      if (script.includes('HCZ_READ_DOCUMENT')) {
        return { title: '阻聚剂采购招标公告', text: '采购阻聚剂 20 吨，投标截止时间 2026-07-30。' } as T;
      }
      return { performed: true, detail: 'search button' } as T;
    },
  };
  const runtime = createPlaywrightRuntime({
    chromium: {
      launchPersistentContext: async () => ({ pages: () => [fakePage], newPage: async () => fakePage }),
    },
    profileDir: 'profiles/cnpc',
    settleTimeoutMs: 0,
  });

  const searched = await runtime.act?.({ type: 'search', query: '阻聚剂' });
  const read = await runtime.act?.({ type: 'read_document' });

  assert.equal(searched?.performed, true);
  assert.equal(searched?.observation.listItems?.[0]?.elementId, 'hcz-3');
  assert.match(read?.observation.document?.text || '', /20 吨/);
  assert.ok(evaluated.some((script) => script.includes('阻聚剂')));
});

test('playwright runtime waits briefly for SPA content after navigation', async () => {
  const calls: string[] = [];
  let settled = false;
  const fakePage = {
    goto: async () => {
      calls.push('goto');
    },
    waitForTimeout: async (timeout: number) => {
      calls.push(`timeout:${timeout}`);
      settled = true;
    },
    title: async () => '裕龙招投标网',
    url: () => 'https://ctbpsp.com/#/bulletinList',
    locator: () => ({
      innerText: async () => settled ? '2026-06-26 裕龙石化阻聚剂采购招标公告' : '加载中...',
    }),
  };
  const chromium = {
    launchPersistentContext: async () => ({
      pages: () => [fakePage],
      newPage: async () => fakePage,
    }),
  };

  const runtime = createPlaywrightRuntime({
    chromium,
    profileDir: 'profiles/spa',
    settleTimeoutMs: 1200,
  });

  const observation = await runtime.open('https://ctbpsp.com/#/bulletinList');

  assert.equal(observation.visibleText, '2026-06-26 裕龙石化阻聚剂采购招标公告');
  assert.deepEqual(calls, ['goto', 'timeout:1200']);
});

test('playwright runtime prefers system browsers before bundled Chromium on desktop platforms', () => {
  assert.deepEqual(browserChannelCandidatesFor({
    platform: 'win32',
    env: {},
  }), ['chrome', 'msedge', '']);
  assert.deepEqual(browserChannelCandidatesFor({
    platform: 'linux',
    env: {},
  }), ['chrome', 'msedge', '']);
  assert.deepEqual(browserChannelCandidatesFor({
    platform: 'darwin',
    env: {},
  }), ['chrome', 'msedge', '']);
  assert.deepEqual(browserChannelCandidatesFor({
    platform: 'win32',
    env: { HCZ_LOCAL_HELPER_BROWSER_CHANNEL: 'msedge' },
  }), ['msedge', '']);
  assert.deepEqual(browserChannelCandidatesFor({
    platform: 'win32',
    env: { HCZ_LOCAL_HELPER_BROWSER_CHANNEL: 'bundled' },
  }), ['']);
});

test('playwright runtime falls back when the preferred system browser is unavailable', async () => {
  const launchOptions: Record<string, unknown>[] = [];
  const fakePage = {
    goto: async () => {},
    title: async () => '询价交易',
    url: () => 'https://example.com/list',
    locator: () => ({ innerText: async () => '公告' }),
  };
  const chromium = {
    launchPersistentContext: async (_profileDir: string, options: Record<string, unknown>) => {
      launchOptions.push(options);
      if (options.channel === 'chrome') throw new Error('chrome is not installed');
      return {
        pages: () => [fakePage],
        newPage: async () => fakePage,
      };
    },
  };

  const runtime = createPlaywrightRuntime({
    chromium,
    profileDir: 'profiles/fallback',
    browserChannels: ['chrome', 'msedge', ''],
  });

  assert.equal((await runtime.observe()).title, '询价交易');
  assert.equal(launchOptions[0]?.channel, 'chrome');
  assert.equal(launchOptions[1]?.channel, 'msedge');
  assert.deepEqual(launchOptions[1]?.args, ['--disable-features=AsyncDns']);
});

test('playwright runtime resolves proxy server from local helper env first', () => {
  assert.equal(proxyServerFor({
    HCZ_LOCAL_HELPER_PROXY: 'http://127.0.0.1:7890',
    HTTPS_PROXY: 'http://proxy.example',
  }), 'http://127.0.0.1:7890');
});
