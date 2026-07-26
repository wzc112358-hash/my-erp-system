import assert from 'node:assert/strict';
import test from 'node:test';

import { enforcePromotedProductEvidence, type ScreenedNotice } from './tender-screening.ts';
import type { TenderCandidate } from './collection.ts';

const ignoredCard = (): ScreenedNotice => ({
  id: '1',
  title: '锅炉辅机大修招标公告',
  sourceName: '测试站点',
  url: 'https://example.com/1',
  buyerName: '',
  publishedAt: '2026-07-24',
  deadlineAt: '',
  matchedTerms: [],
  matchedSources: [],
  relevanceScore: 0,
  businessRelevance: 'irrelevant',
  bidability: 'likely_cannot_do',
  hardRequirements: [],
  riskFlags: [],
  missingInfo: ['未命中公司重点产品词'],
  recommendedAction: 'ignore',
  evidenceText: '',
  wechatSummary: '',
  confidence: 0.7,
  businessAssessment: {
    decision: 'likely_cannot_do',
    decisionSummary: '当前不建议参与',
    productSummary: '待确认',
    quantity: '',
    specifications: [],
    deliveryTerms: [],
    commercialTerms: [],
    qualificationChecks: [],
    historicalReferences: [],
    nextActions: [],
  },
});

const candidate = (overrides: Partial<TenderCandidate> = {}): TenderCandidate => ({
  title: '锅炉辅机大修招标公告',
  url: 'https://example.com/1',
  published_at: '2026-07-24',
  deadline_at: '',
  buyer_name: '',
  raw_text: '锅炉辅机大修招标公告 来自站内产品检索',
  attachments: [],
  search_query: '催化剂',
  ...overrides,
});

test('rejects an LLM product promotion that only came from the search query', () => {
  const baseCard = ignoredCard();
  const result = enforcePromotedProductEvidence({
    candidate: candidate(),
    baseCard,
    assessedCard: {
      ...baseCard,
      matchedTerms: ['催化剂'],
      businessRelevance: 'known_product',
      recommendedAction: 'deep_read',
      relevanceScore: 80,
    },
  });
  assert.equal(result.recommendedAction, 'ignore');
  assert.deepEqual(result.matchedTerms, []);
});

test('keeps an LLM-discovered chemical when the product is present in source text', () => {
  const baseCard = ignoredCard();
  const result = enforcePromotedProductEvidence({
    candidate: candidate({ title: '丙酮年度框架采购公告', raw_text: '采购丙酮，年度框架' }),
    baseCard,
    assessedCard: {
      ...baseCard,
      title: '丙酮年度框架采购公告',
      matchedTerms: ['丙酮'],
      businessRelevance: 'potential_product',
      recommendedAction: 'deep_read',
      relevanceScore: 78,
    },
  });
  assert.equal(result.recommendedAction, 'deep_read');
  assert.deepEqual(result.matchedTerms, ['丙酮']);
});

test('removes an unsupported extra product from an otherwise relevant notice', () => {
  const baseCard = {
    ...ignoredCard(),
    title: '液体聚羧酸分散剂 PCE 采购',
    matchedTerms: ['分散剂'],
    businessRelevance: 'known_product' as const,
    recommendedAction: 'deep_read' as const,
    relevanceScore: 80,
  };
  const result = enforcePromotedProductEvidence({
    candidate: candidate({ title: baseCard.title, raw_text: '采购液体聚羧酸分散剂 PCE' }),
    baseCard,
    assessedCard: { ...baseCard, matchedTerms: ['分散剂', '四氯乙烯'] },
  });
  assert.deepEqual(result.matchedTerms, ['分散剂']);
});
