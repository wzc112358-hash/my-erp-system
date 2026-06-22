import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessOpportunityCards,
  createDefaultBidAssessor,
  createOpenAIBidAssessor,
  mergeAssessmentIntoCard,
} from './bid-assessment.ts';
import { buildOpportunityCards } from './product-knowledge.ts';

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
  const [baseCard] = buildOpportunityCards({ bundle, task });
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
  const [baseCard] = buildOpportunityCards({ bundle, task });
  const assessor = createDefaultBidAssessor({ env: {}, config: null });
  const [assessed] = await assessOpportunityCards({
    task,
    bundle,
    cards: [baseCard],
    assessor,
  });

  assert.equal(assessor.name, 'deterministic-bid-assessor');
  assert.equal(assessed.wechatSummary, baseCard.wechatSummary);
});

test('OpenAI bid assessor merges structured JSON and falls back on invalid JSON', async () => {
  const [baseCard] = buildOpportunityCards({ bundle, task });
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
