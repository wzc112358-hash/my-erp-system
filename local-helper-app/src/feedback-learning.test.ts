import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFeedbackLearningToOpportunityCards,
  applyFeedbackLearningToTerms,
  createEmptyFeedbackLearning,
  learnFromOpportunityFeedback,
  summarizeFeedbackLearning,
} from './feedback-learning.ts';
import {
  matchProductTerms,
  type OpportunityCard,
} from './product-knowledge.ts';

const baseCard = (overrides: Partial<OpportunityCard> = {}): OpportunityCard => ({
  id: 'card-1',
  title: '阻聚剂采购询源公告',
  sourceName: '能源一号',
  url: 'https://example.com/detail/1',
  buyerName: '中化',
  publishedAt: '2026-06-20',
  deadlineAt: '2026-06-25',
  matchedTerms: ['阻聚剂'],
  matchedSources: ['erp_history'],
  relevanceScore: 84,
  bidability: 'needs_manual_check',
  hardRequirements: [],
  riskFlags: [],
  missingInfo: [],
  recommendedAction: 'deep_read_document',
  evidenceText: '阻聚剂采购询源公告',
  wechatSummary: '【待确认】能源一号 - 阻聚剂采购询源公告',
  confidence: 0.84,
  ...overrides,
});

test('feedback learning records term deltas and notice history', () => {
  const state = learnFromOpportunityFeedback(createEmptyFeedbackLearning(), baseCard(), {
    status: 'sent_to_group',
    note: '已发群问老板',
    updatedAt: '2026-06-22T10:00:00.000Z',
    source: 'employee',
  });
  const summary = summarizeFeedbackLearning(state);

  assert.equal(state.terms['阻聚剂'].weightDelta, 20);
  assert.equal(state.terms['阻聚剂'].positiveCount, 1);
  assert.equal(summary.termCount, 1);
  assert.equal(summary.noticeCount, 1);
  assert.equal(summary.positiveCount, 1);
  assert.match(summary.recent[0].note, /已发群/);
});

test('feedback learning lowers repeated irrelevant product terms', () => {
  const state = learnFromOpportunityFeedback(createEmptyFeedbackLearning(), baseCard({
    title: '宽泛化工服务采购公告',
    url: 'https://example.com/detail/2',
    matchedTerms: ['宽泛化工'],
    relevanceScore: 50,
  }), {
    status: 'irrelevant',
    updatedAt: '2026-06-22T11:00:00.000Z',
    source: 'employee',
  });
  const terms = applyFeedbackLearningToTerms([{
    term: '宽泛化工',
    sources: ['curated'],
    weight: 50,
  }], state);
  const result = matchProductTerms('宽泛化工服务采购公告', terms);

  assert.equal(terms[0].weight, -10);
  assert.equal(result.score, 0);
  assert.deepEqual(result.negativeTerms, ['宽泛化工']);
});

test('feedback learning reapplies exact notice feedback to future cards', () => {
  const state = learnFromOpportunityFeedback(createEmptyFeedbackLearning(), baseCard(), {
    status: 'irrelevant',
    note: '只是装置服务，不是产品',
    updatedAt: '2026-06-22T12:00:00.000Z',
    source: 'employee',
  });
  const [learnedCard] = applyFeedbackLearningToOpportunityCards([baseCard({
    relevanceScore: 84,
    recommendedAction: 'deep_read_document',
  })], state);

  assert.equal(learnedCard.feedbackSource, 'system');
  assert.equal(learnedCard.feedbackStatus, 'irrelevant');
  assert.equal(learnedCard.relevanceScore, 0);
  assert.equal(learnedCard.recommendedAction, 'ignore');
  assert.match(learnedCard.feedbackNote || '', /过往员工反馈/);
});
