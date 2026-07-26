import assert from 'node:assert/strict';
import test from 'node:test';

import { buildScreenedNotices } from '../domain/tender-screening.ts';
import { mergeAssessmentIntoCard } from './bid-assessor.ts';

const baseCard = () => buildScreenedNotices({
  task: { sourceName: '测试站点' },
  bundle: {
    source_name: '测试站点',
    candidates: [{
      title: '二甲基硅油采购公告',
      url: 'https://example.com/1',
      buyer_name: '测试采购方',
      published_at: '2026-07-26',
      deadline_at: '2026-08-01',
      raw_text: '采购二甲基硅油 7.5 吨，350cst，25kg/桶，分批到货，接受代理商投标。',
      attachments: [],
    }],
  },
})[0];

test('merges a business decision card instead of a generic follow-up label', () => {
  const merged = mergeAssessmentIntoCard(baseCard(), {
    relevanceScore: 96,
    bidability: 'likely_can_do',
    recommendedAction: 'prioritize',
    businessAssessment: {
      decision: 'likely_can_do',
      decisionSummary: '公告接受代理商，产品和公开技术条件匹配，可进入厂家确认和报价。',
      productSummary: '二甲基硅油 350cst',
      quantity: '7.5 吨',
      specifications: ['350cst', '25kg/桶'],
      deliveryTerms: ['分批到货'],
      commercialTerms: [],
      qualificationChecks: [{
        requirement: '贸易商/代理商资格',
        status: 'met',
        basis: '公告明确接受代理商投标',
      }],
      historicalReferences: [],
      nextActions: ['向厂家确认 350cst 指标和 25kg 桶包装'],
    },
  });

  assert.equal(merged.businessAssessment.decision, 'likely_can_do');
  assert.equal(merged.businessAssessment.quantity, '7.5 吨');
  assert.match(merged.businessAssessment.decisionSummary, /可进入/);
  assert.deepEqual(merged.businessAssessment.nextActions, ['向厂家确认 350cst 指标和 25kg 桶包装']);
});

test('does not mark an unknown qualification as satisfied', () => {
  const merged = mergeAssessmentIntoCard(baseCard(), {
    bidability: 'needs_manual_check',
    businessAssessment: {
      decision: 'needs_manual_check',
      decisionSummary: '需要确认公司侧业绩材料。',
      productSummary: '二甲基硅油 350cst',
      quantity: '数量未指明',
      specifications: ['350cst'],
      deliveryTerms: [],
      commercialTerms: [],
      qualificationChecks: [{
        requirement: '同类供货业绩',
        status: 'unconfirmed',
        basis: '公告要求同类业绩，输入未提供公司侧证明',
      }],
      historicalReferences: [],
      nextActions: ['核对可用同类合同和中标记录'],
    },
  });

  assert.equal(merged.businessAssessment.qualificationChecks[0].status, 'unconfirmed');
  assert.equal(merged.businessAssessment.quantity, '');
});

test('downgrades an inferred blocker to manual confirmation', () => {
  const merged = mergeAssessmentIntoCard(baseCard(), {
    bidability: 'likely_cannot_do',
    businessAssessment: {
      decision: 'likely_cannot_do',
      decisionSummary: '行业通常倾向制造商，公司可能无法参与。',
      productSummary: '二甲基硅油 350cst',
      quantity: '7.5 吨',
      specifications: ['350cst'],
      deliveryTerms: [],
      commercialTerms: [],
      qualificationChecks: [{
        requirement: '生产商限定',
        status: 'not_met',
        basis: '行业惯例通常要求制造商',
      }],
      historicalReferences: [],
      nextActions: ['向招标方确认是否接受代理商'],
    },
  });

  assert.equal(merged.bidability, 'needs_manual_check');
  assert.equal(merged.businessAssessment.decision, 'needs_manual_check');
  assert.equal(merged.businessAssessment.qualificationChecks[0].status, 'unconfirmed');
  assert.doesNotMatch(merged.businessAssessment.decisionSummary, /无法参与/);
});
