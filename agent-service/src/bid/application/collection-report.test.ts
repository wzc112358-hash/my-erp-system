import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBidCollectionReport } from './collection-report.ts';
import type { ScreenedNotice } from '../domain/tender-screening.ts';

const card = (overrides: Partial<ScreenedNotice> = {}): ScreenedNotice => ({
  id: 'notice-1',
  title: '阻聚剂采购公告',
  sourceName: '测试站点',
  url: 'https://example.com/notices/1',
  buyerName: '测试采购方',
  publishedAt: '2026-07-24',
  deadlineAt: '2026-07-30',
  matchedTerms: ['阻聚剂'],
  matchedSources: ['erp_history'],
  relevanceScore: 90,
  businessRelevance: 'known_product',
  sourceOpportunityStatus: 'active',
  bidability: 'needs_manual_check',
  hardRequirements: [],
  riskFlags: [],
  missingInfo: [],
  recommendedAction: 'prioritize',
  evidenceText: '采购阻聚剂',
  wechatSummary: '',
  confidence: 0.9,
  businessAssessment: {
    decision: 'needs_manual_check',
    decisionSummary: '产品匹配，但代理商资格需要确认。',
    productSummary: '阻聚剂',
    quantity: '20 吨',
    specifications: ['工业级'],
    deliveryTerms: [],
    commercialTerms: [],
    qualificationChecks: [{ requirement: '贸易商/代理商资格', status: 'unconfirmed', basis: '公告未写明' }],
    historicalReferences: [],
    nextActions: ['确认是否接受代理商投标'],
  },
  ...overrides,
});

test('separates current opportunities from expired attention information', () => {
  const report = buildBidCollectionReport({
    sourceKey: 'test',
    sourceName: '测试站点',
    generatedAt: '2026-07-24T00:00:00.000Z',
    cards: [
      card(),
      card({ id: 'notice-2', title: '抗氧剂采购公告', matchedTerms: ['抗氧剂'], deadlineAt: '2026-07-20' }),
    ],
  });
  assert.equal(report.currentItems.length, 1);
  assert.equal(report.attentionItems.length, 1);
  assert.equal(report.attentionItems[0].kind, 'attention');
  assert.equal(report.currentItems[0].judgment, '产品匹配，但代理商资格需要确认。');
  assert.equal(report.currentItems[0].assessment?.quantity, '20 吨');
});

test('keeps an LLM-discovered new chemical as a current opportunity', () => {
  const report = buildBidCollectionReport({
    sourceKey: 'test',
    sourceName: '测试站点',
    generatedAt: '2026-07-24T00:00:00.000Z',
    cards: [card({
      title: '新型聚合助剂采购公告',
      matchedTerms: ['新型聚合助剂'],
      businessRelevance: 'potential_product',
      recommendedAction: 'deep_read',
    })],
  });
  assert.equal(report.currentItems.length, 1);
  assert.deepEqual(report.currentItems[0].matchedProducts, ['新型聚合助剂']);
});

test('never publishes result notices as an opportunity', () => {
  const report = buildBidCollectionReport({
    sourceKey: 'test',
    sourceName: '测试站点',
    cards: [card({ title: '阻聚剂采购中标候选人公示' })],
  });
  assert.equal(report.currentItems.length, 0);
  assert.equal(report.attentionItems.length, 0);
  assert.equal(report.llmIgnoredCount, 1);
});

test('deterministic fallback excludes services that only mention a chemical product', () => {
  const report = buildBidCollectionReport({
    sourceKey: 'test',
    sourceName: '测试站点',
    cards: [
      card({ title: '催化剂器外硫化加工服务框架协议招标公告' }),
      card({ id: 'notice-2', title: '东方石化废催化剂危险废物委托处置服务' }),
      card({ id: 'notice-3', title: '中海沥青催化剂装卸服务询价公告' }),
      card({ id: 'notice-4', title: '催化剂制备EPC总承包公开招标项目招标公告' }),
      card({ id: 'notice-5', title: '聚乙烯装置催化剂装卸系统物资招标公告' }),
      card({ id: 'notice-6', title: '催化剂外委加工框架采购项目公开招标公告' }),
      card({ id: 'notice-7', title: '电科院2026年化学仪器设备采购招标公告' }),
      card({ id: 'notice-8', title: '锅炉辅机及公用系统大修公开招标项目招标公告' }),
      card({ id: 'notice-9', title: '催化剂有限公司生产包装材料陶瓷纤维制品采购招标公告' }),
      card({ id: 'notice-10', title: '分散剂检修用阀门采购公告' }),
      card({ id: 'notice-11', title: '含汞废催化剂销售招标公告' }),
    ],
  });
  assert.equal(report.currentItems.length, 0);
  assert.equal(report.llmIgnoredCount, 11);
});
