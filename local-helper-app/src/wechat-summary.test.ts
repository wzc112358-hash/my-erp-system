import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDailyWechatDigest,
  buildOpportunityWechatSummary,
  buildTaskWechatReport,
  classifyWechatCards,
} from './wechat-summary.ts';
import type { OpportunityCard } from './product-knowledge.ts';

const card = (overrides: Partial<OpportunityCard> = {}): OpportunityCard => ({
  id: overrides.id || `card-${overrides.recommendedAction || 'x'}`,
  title: overrides.title || '阻聚剂采购询源公告',
  sourceName: overrides.sourceName || '能源一号',
  url: overrides.url || 'https://example.com/notice/1',
  buyerName: overrides.buyerName || '中化',
  publishedAt: overrides.publishedAt || '2026-06-20',
  deadlineAt: overrides.deadlineAt || '2026-06-25',
  matchedTerms: overrides.matchedTerms || ['阻聚剂'],
  matchedSources: overrides.matchedSources || ['erp_history'],
  relevanceScore: overrides.relevanceScore ?? 88,
  bidability: overrides.bidability || 'needs_manual_check',
  hardRequirements: overrides.hardRequirements || ['报价截止 2026-06-25'],
  riskFlags: overrides.riskFlags || ['装置用途待确认'],
  missingInfo: overrides.missingInfo || ['是否接受代理商投标待确认'],
  recommendedAction: overrides.recommendedAction || 'send_to_group',
  evidenceText: overrides.evidenceText || '阻聚剂采购询源公告，需要确认具体装置。',
  wechatSummary: overrides.wechatSummary || '【待确认】能源一号 - 阻聚剂采购询源公告',
  confidence: overrides.confidence ?? 0.8,
  ...overrides,
});

test('wechat summary classifies cards into focus, pending, and low groups', () => {
  const groups = classifyWechatCards([
    card({ recommendedAction: 'send_to_group', relevanceScore: 92 }),
    card({ recommendedAction: 'deep_read_document', relevanceScore: 70 }),
    card({ recommendedAction: 'ignore', relevanceScore: 0 }),
  ]);

  assert.equal(groups.focus.length, 1);
  assert.equal(groups.pending.length, 1);
  assert.equal(groups.low.length, 1);
});

test('wechat summary builds a copy-ready single opportunity message', () => {
  const text = buildOpportunityWechatSummary(card());

  assert.match(text, /【待确认】能源一号/);
  assert.match(text, /产品：阻聚剂/);
  assert.match(text, /需确认：是否接受代理商/);
  assert.match(text, /链接：https:\/\/example.com/);
});

test('wechat summary builds task report grouped for a site', () => {
  const text = buildTaskWechatReport({
    id: 'task-1',
    sourceName: '能源一号',
    searchTerms: '阻聚剂',
    status: 'completed',
    updatedAt: '2026-06-22T08:00:00.000Z',
    lastCandidateBundle: {
      source_name: '能源一号',
      candidates: [{
        title: '阻聚剂采购询源公告',
        url: 'https://example.com/notice/1',
        published_at: '2026-06-20',
        deadline_at: '2026-06-25',
        buyer_name: '中化',
        raw_text: '阻聚剂采购询源公告',
        attachments: [],
      }],
    },
    lastOpportunityCards: [
      card({ recommendedAction: 'send_to_group', relevanceScore: 92 }),
      card({ title: '办公用品采购公告', recommendedAction: 'ignore', relevanceScore: 0, matchedTerms: [] }),
    ],
  }, { now: new Date('2026-06-22T10:00:00+08:00') });

  assert.match(text, /【站点日报】能源一号/);
  assert.match(text, /一、建议重点关注/);
  assert.match(text, /二、待人工确认/);
  assert.match(text, /三、低相关或无新增/);
  assert.match(text, /办公用品采购公告/);
});

test('wechat summary builds daily digest across tasks', () => {
  const text = buildDailyWechatDigest([
    {
      id: 'task-1',
      sourceName: '能源一号',
      status: 'completed',
      updatedAt: '2026-06-22T08:00:00+08:00',
      lastOpportunityCards: [card({ recommendedAction: 'send_to_group', relevanceScore: 92 })],
    },
    {
      id: 'task-2',
      sourceName: '华锦兵器网',
      status: 'completed',
      updatedAt: '2026-06-22T09:00:00+08:00',
      lastOpportunityCards: [],
      lastCandidateBundle: { source_name: '华锦兵器网', candidates: [] },
    },
  ], { now: new Date('2026-06-22T10:00:00+08:00') });

  assert.match(text, /今日招投标信息汇总/);
  assert.match(text, /建议重点关注/);
  assert.match(text, /华锦兵器网：无新增/);
});
