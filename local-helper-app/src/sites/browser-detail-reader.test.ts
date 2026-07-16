import assert from 'node:assert/strict';
import test from 'node:test';

import type { BrowserSession, CandidateBundle } from '../browser/types.ts';
import { readRelevantBrowserDetails } from './browser-detail-reader.ts';
import { definitionFor } from './registry.ts';

test('detail reader replays the product search and enriches a relevant browser candidate', async () => {
  const actions: string[] = [];
  const list = {
    title: '中国石油招标投标网', url: 'https://www.cnpcbidding.com/#/tenders',
    visibleText: '吉林石化丁二烯阻聚剂采购公开招标公告', searchQuery: '阻聚剂',
    listItems: [{ title: '吉林石化丁二烯阻聚剂采购公开招标公告', elementId: 'hcz-7' }],
  };
  const detail = {
    title: '吉林石化丁二烯阻聚剂采购公开招标公告', url: list.url,
    visibleText: '招标条件 采购丁二烯阻聚剂20吨 投标人资格要求 接受代理商 投标截止时间2026-07-30',
  };
  const browser = {
    engine: 'test',
    open: async () => list,
    observe: async () => list,
    act: async (action) => {
      actions.push(action.type === 'search' ? `search:${action.query}` : action.type === 'click' ? `click:${action.elementId}` : action.type);
      if (action.type === 'search') return { performed: true, observation: list };
      if (action.type === 'click') return { performed: true, observation: detail };
      if (action.type === 'read_document') return {
        performed: true,
        observation: {
          ...detail,
          document: { title: detail.title, text: detail.visibleText, pageCount: 1 },
        },
      };
      return { performed: true, observation: detail };
    },
  } as BrowserSession;
  const bundle: CandidateBundle = {
    source_name: '中国石油招标投标网',
    candidates: [{
      title: '吉林石化丁二烯阻聚剂采购公开招标公告', url: list.url,
      published_at: '2026-07-15', deadline_at: '', buyer_name: '中国石油',
      raw_text: '列表证据', attachments: [], browser_ref: 'hcz-7', search_query: '阻聚剂',
    }],
  };

  const result = await readRelevantBrowserDetails({
    task: { id: 'detail-1', sourceName: bundle.source_name, entryUrl: list.url },
    browser,
    definition: definitionFor(bundle.source_name),
    bundle,
    relevantIndexes: [0],
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(actions.slice(0, 3), ['search:阻聚剂', 'click:hcz-7', 'read_document']);
  assert.match(result.bundle.candidates[0]?.raw_text || '', /接受代理商/);
  assert.equal(result.documentsByIndex.get(0)?.[0]?.text.includes('20吨'), true);
});
