import assert from 'node:assert/strict';
import test from 'node:test';

import {
  callOpenAICompatibleChatCompletion,
  resolveLLMSettings,
  testOpenAICompatibleLLMConfig,
} from './client.ts';

test('LLM settings prefer saved configuration and keep the key local', () => {
  const settings = resolveLLMSettings({
    env: { HCZ_LOCAL_AGENT_LLM_API_KEY: 'env-key' },
    config: {
      enabled: true,
      baseUrl: 'https://api.deepseek.com/',
      apiKey: 'saved-key',
      model: 'deepseek-v4-pro',
    },
  });
  assert.equal(settings.baseUrl, 'https://api.deepseek.com');
  assert.equal(settings.apiKey, 'saved-key');
  assert.equal(settings.model, 'deepseek-v4-pro');
});

test('OpenAI-compatible client calls chat completions with JSON mode', async () => {
  let requestBody: any = null;
  const result = await callOpenAICompatibleChatCompletion({
    env: {},
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'secret',
      model: 'test-model',
    },
    responseFormatJson: true,
    messages: [{ role: 'user', content: 'extract' }],
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    }) as typeof fetch,
  });
  assert.equal(result.content, '{"ok":true}');
  assert.deepEqual(requestBody.response_format, { type: 'json_object' });
});

test('LLM connection test validates required configuration', async () => {
  const missing = await testOpenAICompatibleLLMConfig({ env: {}, config: { enabled: true } });
  assert.equal(missing.ok, false);
  assert.match(missing.message, /接口地址|API Key|模型名/);
});
