import assert from 'node:assert/strict';
import test from 'node:test';

import { extractCandidatesWithLLM } from './candidate-extractor.ts';

const task = {
  id: 'task-yulong',
  sourceName: '裕龙招投标网',
  entryUrl: 'https://example.com/list',
  searchTerms: '硅油',
};
const observation = {
  title: '裕龙采购列表',
  url: 'https://example.com/list',
  visibleText: '裕龙石化二甲基硅油采购招标公告 2026-07-14',
  links: [{ text: '详情', href: 'https://example.com/detail/1' }],
  networkResponses: [],
};

test('LLM page extraction is optional when no model key is configured', async () => {
  assert.equal(await extractCandidatesWithLLM({ task, observation, config: null, env: {} }), null);
});

test('LLM page extraction validates candidates and observed URLs', async () => {
  const result = await extractCandidatesWithLLM({
    task,
    observation,
    env: {},
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'secret',
      model: 'test-model',
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        candidates: [
          {
            title: '裕龙石化二甲基硅油采购招标公告',
            url: 'https://example.com/detail/1',
            published_at: '2026-07-14',
            deadline_at: '',
            buyer_name: '裕龙石化',
            raw_text: '二甲基硅油采购',
            attachments: [],
          },
          {
            title: '裕龙石化硅油采购中标结果公告',
            url: 'https://hallucinated.example/result',
          },
        ],
      }) } }],
    }), { status: 200 })) as typeof fetch,
  });
  assert.equal(result?.candidates.length, 1);
  assert.equal(result?.candidates[0]?.url, 'https://example.com/detail/1');
});
