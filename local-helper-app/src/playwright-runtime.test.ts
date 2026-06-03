import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlaywrightRuntime } from './playwright-runtime.ts';

test('playwright runtime opens urls in persistent profile and captures visible text', async () => {
  const calls: string[] = [];
  const fakePage = {
    goto: async (url: string) => calls.push(`goto:${url}`),
    title: async () => '华锦兵器网',
    url: () => 'https://www.norincogroup-ebuy.com/notice/list',
    locator: () => ({
      innerText: async () => '2026-05-27 华锦化工液氮采购询价公告',
    }),
    screenshot: async ({ path }: { path: string }) => {
      calls.push(`screenshot:${path}`);
      return Buffer.from('');
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
  const screenshotPath = await runtime.screenshot();

  assert.equal(observation.title, '华锦兵器网');
  assert.equal(observation.visibleText, '2026-05-27 华锦化工液氮采购询价公告');
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
