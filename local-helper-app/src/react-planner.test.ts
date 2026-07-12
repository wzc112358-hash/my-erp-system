import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultReActPlanner,
  createDeterministicReActPlanner,
  createOpenAIReActPlanner,
} from './react-planner.ts';

const baseState = {
  task: {
    id: 'task-1',
    sourceName: '能源一号',
    entryUrl: 'https://example.com/list',
    searchTerms: '阻聚剂',
  },
  iteration: 1,
  maxIterations: 6,
  tools: [],
  discoveredLinks: [],
  openedUrls: [],
  candidateCount: 0,
  documentCount: 0,
  hasDocumentSignals: false,
  warnings: [],
};

test('deterministic ReAct planner searches, reads documents, then finishes', async () => {
  const planner = createDeterministicReActPlanner();

  const search = await planner.chooseAction(baseState);
  const readDocuments = await planner.chooseAction({
    ...baseState,
    iteration: 3,
    candidateCount: 1,
    hasDocumentSignals: true,
  });
  const finish = await planner.chooseAction({
    ...baseState,
    iteration: 4,
    candidateCount: 1,
    hasDocumentSignals: true,
    documentCount: 1,
  });

  assert.equal(search.type, 'search');
  assert.equal(readDocuments.type, 'read_documents');
  assert.equal(finish.type, 'finish');
});

test('deterministic ReAct planner requests a URL when search has no links and no entry URL', async () => {
  const planner = createDeterministicReActPlanner();
  const action = await planner.chooseAction({
    ...baseState,
    task: {
      ...baseState.task,
      entryUrl: '',
    },
    iteration: 2,
    warnings: ['未配置 FIRECRAWL_API_KEY/HCZ_FIRECRAWL_API_KEY，已跳过 Firecrawl 搜索。'],
  });

  assert.equal(action.type, 'request_human');
  assert.match(action.reason, /入口 URL|补充网址/);
});

test('OpenAI ReAct planner parses a constrained JSON action', async () => {
  const planner = createOpenAIReActPlanner({
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'sk-test',
      model: 'demo',
    },
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            type: 'open_url',
            reason: '打开公开公告入口。',
            url: 'https://example.com/detail/1',
          }),
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  const action = await planner.chooseAction({
    ...baseState,
    discoveredLinks: [{
      title: '阻聚剂采购公告',
      url: 'https://example.com/detail/1',
      source: 'mock',
      score: 80,
    }],
  });

  assert.equal(action.type, 'open_url');
  assert.equal(action.type === 'open_url' ? action.url : '', 'https://example.com/detail/1');
});

test('default ReAct planner falls back to deterministic planner without a key', async () => {
  const planner = createDefaultReActPlanner({ config: { enabled: true } });
  const action = await planner.chooseAction(baseState);

  assert.equal(planner.name, 'deterministic-react-planner');
  assert.equal(action.type, 'search');
});
