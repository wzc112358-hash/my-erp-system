import assert from 'node:assert/strict';
import test from 'node:test';

import { collectGuonengEgouFeeds } from './public-collectors.ts';

test('Guoneng Egou keeps a healthy public baseline when optional server-side search is WAF-blocked', async () => {
  const result = await collectGuonengEgouFeeds({
    task: {
      id: 'scheduled-guoneng-egou',
      sourceName: '国能E购',
      entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
      searchTerms: '阻聚剂',
    },
    now: new Date('2026-08-06T08:00:00+08:00'),
    minimumIntervalMs: 0,
    fetchImpl: (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('searchCmsArticleList')) {
        return new Response('WAF rejected', { status: 405 });
      }
      return new Response(JSON.stringify({
        rows: [{
          title: '国能化工白油采购询价公告',
          link: '/upload/cms/article/inquireOne/10001.html',
          publishTime: '2026-08-06',
          quotDeadline: '2026-08-09',
          publishArea: '化工中心',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.deepEqual(result.warnings, []);
});
