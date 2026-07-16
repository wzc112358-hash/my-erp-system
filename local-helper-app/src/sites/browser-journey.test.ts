import assert from 'node:assert/strict';
import test from 'node:test';

import type { BrowserSession } from '../browser/types.ts';
import { definitionFor } from './registry.ts';
import { runBrowserSearchJourney } from './browser-journey.ts';

test('browser journey searches configured product terms and keeps recent list references', async () => {
  const actions: string[] = [];
  const browser = {
    engine: 'test',
    open: async () => ({ title: '列表', url: 'https://example.com/list', visibleText: '公告列表' }),
    observe: async () => ({ title: '列表', url: 'https://example.com/list', visibleText: '公告列表' }),
    act: async (action) => {
      actions.push(action.type === 'search' ? `search:${action.query}` : action.type);
      const query = action.type === 'search' ? action.query : '';
      return {
        performed: true,
        observation: {
          title: '列表', url: 'https://example.com/list', visibleText: `${query}采购招标公告`, searchQuery: query,
          listItems: [{
            title: `${query}采购招标公告`, elementId: `row-${query}`,
            publishedAt: query === '白油' ? '2024-01-01' : '2026-07-15',
          }],
        },
      };
    },
  } as BrowserSession;
  const definition = {
    ...definitionFor('中国石油招标投标网'),
    browserJourney: {
      strategy: 'keyword' as const,
      queryTerms: ['阻聚剂', '白油'],
      maxPages: 1,
      maxDetails: 2,
      recentDays: 30,
    },
  };

  const result = await runBrowserSearchJourney({
    task: { id: 'journey-1', sourceName: definition.sourceName, entryUrl: definition.entryUrl || '' },
    browser,
    definition,
    now: new Date('2026-07-16T00:00:00+08:00'),
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(actions, ['search:阻聚剂', 'search:白油']);
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.equal(result.candidateBundle?.candidates[0]?.browser_ref, 'row-阻聚剂');
});

test('browser journey stops at a real human challenge', async () => {
  const challenge = {
    title: '安全验证', url: 'https://example.com/list', visibleText: '请完成滑块安全验证', humanChallengeVisible: true,
  };
  const browser = {
    engine: 'test',
    open: async () => challenge,
    observe: async () => challenge,
    act: async () => ({ performed: true, observation: challenge }),
  } as BrowserSession;
  const definition = definitionFor('云梦泽智慧平台');

  const result = await runBrowserSearchJourney({
    task: { id: 'journey-2', sourceName: definition.sourceName, entryUrl: definition.entryUrl || '' },
    browser,
    definition,
  });

  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /验证/);
});
