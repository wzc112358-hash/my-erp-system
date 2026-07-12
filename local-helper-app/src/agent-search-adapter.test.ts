import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDiscoveryQueries,
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

test('search adapter builds site-specific deep search queries', () => {
  const queries = buildDiscoveryQueries({
    id: 'task-egou',
    sourceName: '国能E购',
    entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
    searchTerms: '焦亚硫酸钠,消泡剂',
  });

  assert.ok(queries.length >= 2);
  assert.match(queries.join('\n'), /gd-prod\.cn-beijing\.oss\.aliyuncs\.com/);
  assert.match(queries.join('\n'), /焦亚硫酸钠/);
});

test('search adapter accepts an LLM-planned query while keeping the site domain restriction', async () => {
  let requestBody: any = null;
  const adapter = createFirecrawlSearchAdapter({
    env: { FIRECRAWL_API_KEY: 'fc-test', FIRECRAWL_BASE_URL: 'https://firecrawl.example/v2' },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({ success: true, data: { web: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  await adapter.discoverLinks({
    task: cnpcTask,
    queryOverride: 'site:cnpcbidding.com 新型清净剂 招标 询价',
  });
  assert.equal(requestBody.query, 'site:cnpcbidding.com 新型清净剂 招标 询价');
  assert.deepEqual(requestBody.includeDomains, ['cnpcbidding.com']);
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

test('firecrawl search adapter runs site-specific query templates and merges results', async () => {
  const requestBodies: any[] = [];
  const adapter = createFirecrawlSearchAdapter({
    env: {
      FIRECRAWL_API_KEY: 'fc-test',
      FIRECRAWL_BASE_URL: 'https://firecrawl.example/v2',
    },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      requestBodies.push(body);
      return new Response(JSON.stringify({
        success: true,
        data: {
          web: [{
            title: body.query.includes('oss') ? '国能E购焦亚硫酸钠询价采购' : '国能E购阻聚剂采购',
            description: '公开询价采购公告',
            url: body.query.includes('oss')
              ? 'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/article/inquireOne/1.html'
              : 'https://neep.shop/html/portal/index-Inquiries.html',
          }],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const result = await adapter.discoverLinks({
    task: {
      id: 'task-egou',
      sourceName: '国能E购',
      entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
      searchTerms: '焦亚硫酸钠,阻聚剂',
    },
    limit: 5,
  });

  assert.ok(requestBodies.length >= 2);
  assert.deepEqual(requestBodies[0].includeDomains, ['neep.shop', 'gd-prod.cn-beijing.oss.aliyuncs.com']);
  assert.equal(result.links.some((link) => /焦亚硫酸钠/.test(link.title)), true);
  assert.match(result.query, /询价采购/);
});

test('default search adapter falls back to entry URL when Firecrawl is not configured', async () => {
  const adapter = createDefaultSearchAdapter({ env: {} });

  const result = await adapter.discoverLinks({ task: cnpcTask });

  assert.equal(result.links[0].url, 'https://www.cnpcbidding.com/#/tenders');
  assert.match(result.warnings.join('\n'), /未配置 FIRECRAWL/);
});
