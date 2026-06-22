import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDiscoveryQuery,
  createDefaultSearchAdapter,
  createFirecrawlSearchAdapter,
  hostnameForUrl,
  splitSearchTerms,
} from './agent-search-adapter.ts';

const cnpcTask = {
  id: 'task-cnpc',
  sourceName: '中石油招投标网',
  entryUrl: 'https://www.cnpcbidding.com/#/tenders',
  searchTerms: '缓蚀剂,阻垢剂,水处理剂',
};

test('search adapter builds domain-scoped bidding discovery query', () => {
  const query = buildDiscoveryQuery(cnpcTask);

  assert.match(query, /site:cnpcbidding\.com/);
  assert.match(query, /中石油招投标网/);
  assert.match(query, /缓蚀剂/);
  assert.match(query, /招标/);
});

test('search adapter splits Chinese keyword lists', () => {
  assert.deepEqual(splitSearchTerms('缓蚀剂，阻垢剂、 水处理剂;缓蚀剂'), [
    '缓蚀剂',
    '阻垢剂',
    '水处理剂',
  ]);
  assert.equal(hostnameForUrl('https://www.cnpcbidding.com/#/tenders'), 'cnpcbidding.com');
});

test('firecrawl search adapter maps web and nested links', async () => {
  let requestBody: any = null;
  const adapter = createFirecrawlSearchAdapter({
    env: {
      FIRECRAWL_API_KEY: 'fc-test',
      FIRECRAWL_BASE_URL: 'https://firecrawl.example/v2',
    },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({
        success: true,
        data: {
          web: [{
            title: '中石油缓蚀剂采购询价公告',
            description: '公开采购公告',
            url: 'https://www.cnpcbidding.com/#/tender/detail/1',
            links: ['https://www.cnpcbidding.com/files/a.pdf'],
          }],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const result = await adapter.discoverLinks({ task: cnpcTask, limit: 5 });

  assert.deepEqual(requestBody.includeDomains, ['cnpcbidding.com']);
  assert.equal(result.provider, 'firecrawl');
  assert.equal(result.links[0].url, 'https://www.cnpcbidding.com/#/tender/detail/1');
  assert.equal(result.links.some((link) => link.url === 'https://www.cnpcbidding.com/files/a.pdf'), true);
});

test('default search adapter falls back to entry URL when Firecrawl is not configured', async () => {
  const adapter = createDefaultSearchAdapter({ env: {} });

  const result = await adapter.discoverLinks({ task: cnpcTask });

  assert.equal(result.links[0].url, 'https://www.cnpcbidding.com/#/tenders');
  assert.match(result.warnings.join('\n'), /未配置 FIRECRAWL/);
});

