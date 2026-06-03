import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectUrlWithCollector,
  normalizeCollectorBundle,
} from './collector-client.js';

test('normalizeCollectorBundle maps collector candidates to agent raw candidates', () => {
  const rawCandidates = normalizeCollectorBundle({
    source_id: 'source1',
    source_name: '国能网',
    owner_name: '小杨',
    candidates: [
      {
        title: '平庄煤业二水氯化钙公开招标项目招标公告',
        url: 'https://example.com/notice/1',
        published_at: '2026-05-26',
        deadline_at: '2026-06-02',
        buyer_name: '平庄煤业',
        raw_text: '二水氯化钙采购',
        attachments: ['https://example.com/a.docx'],
      },
    ],
  });

  assert.deepEqual(rawCandidates, [
    {
      sourceId: 'source1',
      sourceName: '国能网',
      ownerName: '小杨',
      title: '平庄煤业二水氯化钙公开招标项目招标公告',
      url: 'https://example.com/notice/1',
      publishDate: '2026-05-26',
      deadlineDate: '2026-06-02',
      buyerName: '平庄煤业',
      content: '二水氯化钙采购',
      attachmentUrls: ['https://example.com/a.docx'],
    },
  ]);
});

test('collectUrlWithCollector posts to collector-service and returns normalized candidates', async () => {
  const requests = [];
  const candidates = await collectUrlWithCollector({
    collectorUrl: 'https://collector.example.com/',
    url: 'https://example.com/list.html',
    sourceName: '国能网',
    ownerName: '小杨',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          source_id: '',
          source_name: '国能网',
          owner_name: '小杨',
          status: 'success',
          candidates: [
            {
              title: '榆林化工偏铝酸钠采购公开招标项目招标公告',
              url: 'https://example.com/notice/2',
              raw_text: '偏铝酸钠采购',
            },
          ],
        }),
      };
    },
  });

  assert.equal(requests[0].url, 'https://collector.example.com/collect/url');
  assert.match(requests[0].options.body, /国能网/);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, '榆林化工偏铝酸钠采购公开招标项目招标公告');
  assert.equal(candidates[0].sourceName, '国能网');
});

test('collectUrlWithCollector throws clear collector errors', async () => {
  await assert.rejects(
    () => collectUrlWithCollector({
      collectorUrl: 'https://collector.example.com',
      url: 'https://example.com/list.html',
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => '{"error":"down"}',
      }),
    }),
    /collector-service 503 Service Unavailable/,
  );
});
