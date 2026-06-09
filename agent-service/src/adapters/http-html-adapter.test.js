import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectHttpHtmlCandidates,
  fetchHtml,
  urlsForSource,
} from './http-html-adapter.js';

const html = `
  <html>
    <body>
      <a href="/notice/1001.html">宁夏电力英力特化工2026年焦亚硫酸钠物资询价采购 报价截止时间：2026-05-06 14:00:00</a>
      <a href="/notice/1002.html">第一批物资询价采购公告</a>
      <a href="/news/1.html">公司新闻</a>
    </body>
  </html>
`;

test('urlsForSource uses category urls before source url', () => {
  assert.deepEqual(
    urlsForSource({
      source_url: 'https://example.com/source',
      category_urls: 'https://example.com/a,https://example.com/b\nhttps://example.com/c',
    }),
    ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
  );
});

test('urlsForSource falls back to source url', () => {
  assert.deepEqual(
    urlsForSource({ source_url: 'https://example.com/source', category_urls: '' }),
    ['https://example.com/source'],
  );
});

test('fetchHtml throws clear error on non-2xx response', async () => {
  await assert.rejects(
    fetchHtml('https://example.com/fail', async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })),
    /source fetch failed: 503 Service Unavailable/,
  );
});

test('collectHttpHtmlCandidates extracts broad notices from all category pages', async () => {
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(url);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => html,
    };
  };

  const candidates = await collectHttpHtmlCandidates({
    id: 'src1',
    source_name: '国能网',
    owner_name: '小杨',
    category_urls: 'https://example.com/a,https://example.com/b',
    keywords: '',
  }, { fetchImpl });

  assert.deepEqual(fetched, ['https://example.com/a', 'https://example.com/b']);
  assert.equal(candidates.length, 4);
  assert.ok(candidates.some((item) => item.title.includes('焦亚硫酸钠')));
  assert.ok(candidates.some((item) => item.title === '第一批物资询价采购公告'));
  assert.ok(candidates.every((item) => item.sourceName === '国能网'));
  assert.ok(candidates.every((item) => item.ownerName === '小杨'));
});

test('collectHttpHtmlCandidates optionally enriches candidates from detail pages', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/list.html')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '<a href="/notice/chem.html">酸、碱、氨水药品采购公开招标项目招标公告</a>',
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => `
        <p>项目编号：CEZB260123456</p>
        <p>招标人：国源电力河曲电厂</p>
        <p>投标截止时间：2026年06月03日 09:00</p>
        <a href="/files/spec.docx">技术规范书.docx</a>
      `,
    };
  };

  const candidates = await collectHttpHtmlCandidates({
    id: 'src-detail',
    source_name: '国能E招',
    owner_name: '小杨',
    source_url: 'https://example.com/list.html',
    keywords: '',
  }, { fetchImpl, enrichDetails: true });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].buyerName, '国源电力河曲电厂');
  assert.equal(candidates[0].deadlineDate, '2026-06-03');
  assert.equal(candidates[0].projectNumber, 'CEZB260123456');
  assert.deepEqual(candidates[0].attachmentUrls, ['https://example.com/files/spec.docx']);
});

test('collectHttpHtmlCandidates continues when one category url fails', async () => {
  const candidates = await collectHttpHtmlCandidates({
    id: 'src-partial',
    source_name: '国能网',
    owner_name: '小杨',
    category_urls: 'https://example.com/ok,https://example.com/fail',
    keywords: '',
  }, {
    fetchImpl: async (url) => {
      if (url.endsWith('/fail')) {
        return {
          ok: false,
          status: 405,
          statusText: 'Not Allowed',
          text: async () => '',
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '<a href="/n.html">缓蚀剂采购公告 截止时间：2099年01月02日</a>',
      };
    },
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, '缓蚀剂采购公告 截止时间：2099年01月02日');
});
