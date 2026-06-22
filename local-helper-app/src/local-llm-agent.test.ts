import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultLLMAgent,
  testOpenAICompatibleLLMConfig,
} from './local-llm-agent.ts';

test('default LLM agent uses deterministic fallback when disabled', async () => {
  const agent = createDefaultLLMAgent({
    env: {},
    config: {
      enabled: false,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'sk-local',
      model: 'demo-model',
    },
  });

  const summary = await agent.summarize({
    task: { id: 't1', sourceName: '中化', entryUrl: 'https://example.com' },
    discoveredLinks: [],
    candidateBundle: null,
    fallbackSummary: 'fallback summary',
  });

  assert.equal(agent.name, 'deterministic-summary');
  assert.equal(summary, 'fallback summary');
});

test('default LLM agent can use saved OpenAI-compatible config', async () => {
  const calls: Array<{ authorization: string; body: any }> = [];
  const agent = createDefaultLLMAgent({
    env: {},
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1/',
      apiKey: 'sk-local',
      model: 'demo-model',
    },
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        authorization: String((init?.headers as Record<string, string>).Authorization || ''),
        body: JSON.parse(String(init?.body || '{}')),
      });
      return new Response(JSON.stringify({
        choices: [{ message: { content: '模型摘要' } }],
      }), { status: 200 });
    }) as typeof fetch,
  });

  const summary = await agent.summarize({
    task: { id: 't1', sourceName: '中化', entryUrl: 'https://example.com', searchTerms: '阻聚剂' },
    discoveredLinks: [],
    candidateBundle: {
      source_name: '中化',
      candidates: [{
        title: '阻聚剂采购询源公告',
        url: 'https://example.com/notice/1',
        published_at: '',
        deadline_at: '',
        buyer_name: '',
        raw_text: '阻聚剂采购询源公告',
        attachments: [],
      }],
    },
    fallbackSummary: 'fallback summary',
  });

  assert.equal(summary, '模型摘要');
  assert.equal(calls[0].authorization, 'Bearer sk-local');
  assert.equal(calls[0].body.model, 'demo-model');
});

test('LLM connection test validates required config and calls chat completions', async () => {
  const missing = await testOpenAICompatibleLLMConfig({ env: {}, config: { enabled: true } });
  assert.equal(missing.ok, false);
  assert.match(missing.message, /接口地址|API Key|模型名/);

  const ok = await testOpenAICompatibleLLMConfig({
    env: {},
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'sk-local',
      model: 'demo-model',
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ message: { content: '连接正常' } }],
    }), { status: 200 })) as typeof fetch,
  });

  assert.equal(ok.ok, true);
  assert.equal(ok.model, 'demo-model');
  assert.match(ok.message, /连接正常/);
});
