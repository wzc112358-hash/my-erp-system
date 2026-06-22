import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDailyPriorityBoard,
  buildDailyPriorityReport,
  scorePriorityOpportunity,
} from './priority-board.ts';
import type { OpportunityCard } from './product-knowledge.ts';

const card = (overrides: Partial<OpportunityCard> = {}): OpportunityCard => ({
  id: overrides.id || `card-${overrides.recommendedAction || 'x'}`,
  title: overrides.title || '阻聚剂采购询源公告',
  sourceName: overrides.sourceName || '能源一号',
  url: overrides.url || 'https://example.com/notice/1',
  buyerName: overrides.buyerName || '中化',
  publishedAt: overrides.publishedAt || '2026-06-22',
  deadlineAt: overrides.deadlineAt || '2026-06-24',
  matchedTerms: overrides.matchedTerms || ['阻聚剂'],
  matchedSources: overrides.matchedSources || ['erp_history'],
  relevanceScore: overrides.relevanceScore ?? 84,
  bidability: overrides.bidability || 'needs_manual_check',
  hardRequirements: overrides.hardRequirements || [],
  riskFlags: overrides.riskFlags || [],
  missingInfo: overrides.missingInfo || [],
  recommendedAction: overrides.recommendedAction || 'deep_read_document',
  evidenceText: overrides.evidenceText || '阻聚剂采购询源公告',
  wechatSummary: overrides.wechatSummary || '【待确认】能源一号 - 阻聚剂采购询源公告',
  confidence: overrides.confidence ?? 0.84,
  feedbackStatus: overrides.feedbackStatus,
  feedbackSource: overrides.feedbackSource,
});

test('priority score promotes group-ready and urgent opportunities', () => {
  const scored = scorePriorityOpportunity(card({
    recommendedAction: 'send_to_group',
    relevanceScore: 88,
    deadlineAt: '2026-06-23',
  }), { now: new Date('2026-06-22T08:00:00+08:00') });

  assert.equal(scored.priorityLevel, 'high');
  assert.equal(scored.priorityScore, 100);
  assert.ok(scored.reasons.includes('建议发群'));
  assert.ok(scored.reasons.includes('截止很近'));
});

test('priority board sorts actionable cards and filters ignored cards', () => {
  const board = buildDailyPriorityBoard([{
    id: 'task-1',
    sourceName: '能源一号',
    searchTerms: '阻聚剂',
    updatedAt: '2026-06-22T09:00:00+08:00',
    lastOpportunityCards: [
      card({ id: 'low', title: '办公用品采购公告', recommendedAction: 'ignore', relevanceScore: 0, matchedTerms: [] }),
      card({ id: 'focus', title: '阻聚剂年度采购公告', recommendedAction: 'send_to_group', relevanceScore: 90 }),
      card({ id: 'pending', title: '缓蚀剂采购公告', recommendedAction: 'deep_read_document', relevanceScore: 70, matchedTerms: ['缓蚀剂'] }),
    ],
  }], { now: new Date('2026-06-22T12:00:00+08:00') });

  assert.equal(board.totalCards, 3);
  assert.equal(board.actionableCount, 2);
  assert.equal(board.items[0].card.title, '阻聚剂年度采购公告');
  assert.equal(board.items[1].card.title, '缓蚀剂采购公告');
});

test('priority report is copy-ready for daily work', () => {
  const text = buildDailyPriorityReport([{
    id: 'task-1',
    sourceName: '能源一号',
    searchTerms: '阻聚剂',
    updatedAt: '2026-06-22T09:00:00+08:00',
    lastOpportunityCards: [
      card({ title: '阻聚剂年度采购公告', recommendedAction: 'send_to_group', relevanceScore: 90 }),
    ],
  }], { now: new Date('2026-06-22T12:00:00+08:00') });

  assert.match(text, /今日招投标重点清单/);
  assert.match(text, /建议优先处理 1 条/);
  assert.match(text, /复制群消息/);
  assert.match(text, /阻聚剂年度采购公告/);
});
