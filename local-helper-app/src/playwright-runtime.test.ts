import test from 'node:test';
import assert from 'node:assert/strict';

import {
  browserChannelCandidatesFor,
  createPlaywrightRuntime,
  proxyServerFor,
} from './playwright-runtime.ts';

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
  });

  const observation = await runtime.open('https://www.norincogroup-ebuy.com/');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const enrichedObservation = await runtime.observe();
  const screenshotPath = await runtime.screenshot();

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

test('playwright runtime prefers system browsers on Windows before bundled Chromium', () => {
  assert.deepEqual(browserChannelCandidatesFor({
    platform: 'win32',
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
  assert.equal(launchOptions[0].channel, 'chrome');
  assert.equal(launchOptions[1].channel, 'msedge');
  assert.deepEqual(launchOptions[1].args, ['--disable-features=AsyncDns']);
});

test('playwright runtime resolves proxy server from local helper env first', () => {
  assert.equal(proxyServerFor({
    HCZ_LOCAL_HELPER_PROXY: 'http://127.0.0.1:7890',
    HTTPS_PROXY: 'http://proxy.example',
  }), 'http://127.0.0.1:7890');
});
