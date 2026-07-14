import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessScreenedNotices,
  createDefaultBidAssessor,
  createOpenAIBidAssessor,
  mergeAssessmentIntoCard,
} from './bid-assessor.ts';
import { buildScreenedNotices } from '../domain/tender-screening.ts';

const bundle = {
  source_name: '能源一号',
  candidates: [{
    title: '阻聚剂采购询源公告',
    url: 'https://example.com/notice/1',
    published_at: '2026-06-20',
    deadline_at: '2026-06-25',
    buyer_name: '中化',
    raw_text: '阻聚剂采购询源公告，需要确认丙烯醛装置还是丙烯酸装置，报价截止 2026-06-25。',
    attachments: [],
  }],
};
const task = {
  id: 'task-1',
  sourceName: '能源一号',
  entryUrl: 'https://example.com',
  searchTerms: '阻聚剂',
};

test('mergeAssessmentIntoCard validates enum values and keeps rule evidence', () => {
  const [baseCard] = buildScreenedNotices({ bundle, task });
  const merged = mergeAssessmentIntoCard(baseCard, {
    relevanceScore: 91,
    bidability: 'needs_manual_check',
    recommendedAction: 'deep_read_document',
    hardRequirements: ['报价截止 2026-06-25'],
    riskFlags: ['需确认具体装置'],
    missingInfo: ['是否接受代理商待确认'],
    evidenceText: '需要确认丙烯醛装置还是丙烯酸装置',
    wechatSummary: '【待确认】阻聚剂采购询源公告',
    confidence: 0.78,
  });

  assert.equal(merged.relevanceScore, 91);
  assert.equal(merged.recommendedAction, 'deep_read_document');
  assert.match(merged.evidenceText, /丙烯醛|丙烯酸/);
  assert.ok(merged.hardRequirements.includes('报价截止 2026-06-25'));
});

test('default bid assessor stays deterministic without LLM key', async () => {
  const [baseCard] = buildScreenedNotices({ bundle, task });
  const assessor = createDefaultBidAssessor({ env: {}, config: null });
  const [assessed] = await assessScreenedNotices({
    task,
    bundle,
    cards: [baseCard],
    assessor,
  });

  assert.equal(assessor.name, 'deterministic-bid-assessor');
  assert.equal(assessed.wechatSummary, baseCard.wechatSummary);
});

test('assessScreenedNotices skips LLM for zero-score irrelevant cards', async () => {
  const irrelevantBundle = {
    source_name: '国能E购',
    candidates: [{
      title: '办公桌椅采购询价公告',
      url: 'https://example.com/notice/2',
      published_at: '2026-06-20',
      deadline_at: '',
      buyer_name: '综合部',
      raw_text: '办公桌椅采购询价公告',
      attachments: [],
    }],
  };
  const [baseCard] = buildScreenedNotices({
    bundle: irrelevantBundle,
    task: { sourceName: '国能E购' },
  });
  let calls = 0;
  const [assessed] = await assessScreenedNotices({
    task: { id: 'task-2', sourceName: '国能E购', entryUrl: 'https://example.com' },
    bundle: irrelevantBundle,
    cards: [baseCard],
    assessor: {
      name: 'counting-assessor',
      async assess({ baseCard: card }) {
        calls += 1;
        return { ...card, relevanceScore: 99 };
      },
    },
  });

  assert.equal(baseCard.relevanceScore, 0);
  assert.equal(assessed.relevanceScore, 0);
  assert.equal(calls, 0);
});

test('OpenAI bid assessor batch-checks zero-score notices and can retain a new chemical product', async () => {
  const batchBundle = {
    source_name: '易派克',
    candidates: [
      {
        title: '炼化公司新型硼系清净剂X99公开招标公告',
        url: 'https://example.com/chemical',
        published_at: '2026-07-11',
        deadline_at: '',
        buyer_name: '炼化公司',
        raw_text: '新型硼系清净剂X99采购，供应商资格见附件。',
        attachments: [],
      },
      {
        title: '办公桌椅采购询价公告',
        url: 'https://example.com/office',
        published_at: '2026-07-11',
        deadline_at: '',
        buyer_name: '综合部',
        raw_text: '办公桌椅采购询价公告',
        attachments: [],
      },
    ],
  };
  const batchTask = { id: 'batch-1', sourceName: '易派克', entryUrl: 'https://example.com' };
  const cards = buildScreenedNotices({ bundle: batchBundle, task: batchTask });
  let calls = 0;
  const assessor = createOpenAIBidAssessor({
    env: {},
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'sk-local',
      model: 'demo-model',
    },
    fetchImpl: (async (_url, init) => {
      calls += 1;
      if (calls === 1) {
        assert.match(String(init?.body || ''), /只挑出“当前仍可参与的化工产品采购”/);
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                matches: [{
                  index: 0,
                  matchedTerms: ['硼系清净剂X99'],
                  reason: '采购对象是新型化工清净剂。',
                  confidence: 0.9,
                }],
              }),
            },
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      assert.match(String(init?.body || ''), /必须对每个 index 返回一条判断/);
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              items: [
                {
                  index: 0,
                  relevanceScore: 86,
                  matchedTerms: ['硼系清净剂X99'],
                  bidability: 'needs_manual_check',
                  hardRequirements: [],
                  riskFlags: [],
                  missingInfo: ['是否接受代理商待确认'],
                  recommendedAction: 'deep_read_document',
                  evidenceText: '标题明确为化工清净剂采购。',
                  wechatSummary: '',
                  confidence: 0.88,
                },
              ],
            }),
          },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch,
  });

  const assessed = await assessScreenedNotices({ task: batchTask, bundle: batchBundle, cards, assessor });
  assert.equal(calls, 2);
  assert.equal(assessed[0].recommendedAction, 'deep_read_document');
  assert.ok(assessed[0].matchedTerms.includes('硼系清净剂X99'));
  assert.equal(assessed[1].recommendedAction, 'ignore');
});

test('OpenAI bid assessor merges structured JSON and falls back on invalid JSON', async () => {
  const [baseCard] = buildScreenedNotices({ bundle, task });
  const okAssessor = createOpenAIBidAssessor({
    env: {},
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'sk-local',
      model: 'demo-model',
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            relevanceScore: 93,
            bidability: 'needs_manual_check',
            hardRequirements: ['报价截止 2026-06-25'],
            riskFlags: ['装置用途待确认'],
            missingInfo: ['是否接受代理商投标待确认'],
            recommendedAction: 'deep_read_document',
            evidenceText: '需要确认丙烯醛装置还是丙烯酸装置',
            wechatSummary: '【待确认】能源一号 - 阻聚剂采购询源公告',
            confidence: 0.82,
          }),
        },
      }],
    }), { status: 200 })) as typeof fetch,
  });
  const invalidAssessor = createOpenAIBidAssessor({
    env: {},
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'sk-local',
      model: 'demo-model',
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'not json' } }],
    }), { status: 200 })) as typeof fetch,
  });

  const ok = await okAssessor.assess({ task, candidate: bundle.candidates[0], baseCard });
  const fallback = await invalidAssessor.assess({ task, candidate: bundle.candidates[0], baseCard });

  assert.equal(ok.relevanceScore, 93);
  assert.match(ok.wechatSummary, /阻聚剂/);
  assert.equal(fallback.wechatSummary, baseCard.wechatSummary);
});

test('OpenAI bid assessor retries without response_format when provider rejects JSON mode', async () => {
  const [baseCard] = buildScreenedNotices({ bundle, task });
  let callCount = 0;
  const assessor = createOpenAIBidAssessor({
    env: {},
    config: {
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      apiKey: 'sk-local',
      model: 'demo-model',
    },
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.response_format) {
        return new Response(JSON.stringify({
          error: { message: 'response_format json_object unsupported' },
        }), { status: 400 });
      }
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              relevanceScore: 88,
              bidability: 'needs_manual_check',
              hardRequirements: ['需确认是否接受代理商'],
              riskFlags: [],
              missingInfo: ['历史中标价格待确认'],
              recommendedAction: 'ask_boss',
              evidenceText: '阻聚剂采购询源公告',
              wechatSummary: '【待确认】阻聚剂采购询源公告',
              confidence: 0.7,
            }),
          },
        }],
      }), { status: 200 });
    }) as typeof fetch,
  });

  const assessed = await assessor.assess({ task, candidate: bundle.candidates[0], baseCard });

  assert.equal(callCount, 2);
  assert.equal(assessed.relevanceScore, 88);
  assert.equal(assessed.recommendedAction, 'ask_boss');
});
