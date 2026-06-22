import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOpportunityFeedback,
  buildOpportunityCards,
  loadProductTerms,
  matchProductTerms,
  summarizeOpportunityCards,
} from './product-knowledge.ts';

test('product knowledge loads seeded ERP and chat terms', () => {
  const terms = loadProductTerms();

  assert.ok(terms.some((term) => term.term === '白油' && term.sources?.includes('erp_history')));
  assert.ok(terms.some((term) => term.term === '焦亚硫酸钠' && term.sources?.includes('chat_history')));
});

test('product matcher identifies strong ERP products and aliases', () => {
  const result = matchProductTerms('中石油食品级白油、凡士林脂和 TCP-2 采购询价公告');

  assert.deepEqual(result.matchedTerms.slice(0, 3), ['白油', '凡士林脂', 'TCP2']);
  assert.ok(result.matchedSources.includes('erp_history'));
  assert.ok(result.score >= 90);
  assert.match(result.evidenceText, /白油|凡士林|TCP/);
});

test('product matcher identifies chat-history bidding clues', () => {
  const result = matchProductTerms('能源一号抗静电剂、焦亚硫酸钠年度框架采购公告');

  assert.ok(result.matchedTerms.includes('抗静电剂'));
  assert.ok(result.matchedTerms.includes('焦亚硫酸钠'));
  assert.ok(result.matchedSources.includes('chat_history'));
  assert.ok(result.score >= 70);
});

test('product matcher keeps broad or service words from creating false positives', () => {
  const office = matchProductTerms('2026 年办公用品和物业保洁服务采购公告');
  const broad = matchProductTerms('某化工园区系统运维服务招标公告');

  assert.equal(office.score, 0);
  assert.deepEqual(office.negativeTerms, ['办公用品', '物业']);
  assert.equal(broad.score, 0);
});

test('opportunity cards carry product evidence and group-ready summary', () => {
  const cards = buildOpportunityCards({
    bundle: {
      source_name: '能源一号',
      candidates: [{
        title: '阻聚剂采购询源公告',
        url: 'https://example.com/notice/1',
        published_at: '2026-06-20',
        deadline_at: '2026-06-25',
        buyer_name: '中化',
        raw_text: '阻聚剂采购询源公告，需确认具体装置、用途、是否接受代理商，报价截止 2026-06-25。',
        attachments: [],
      }],
    },
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].matchedTerms[0], '阻聚剂');
  assert.ok(cards[0].relevanceScore >= 80);
  assert.equal(cards[0].bidability, 'needs_manual_check');
  assert.match(cards[0].wechatSummary, /需确认|阻聚剂|链接/);
  assert.match(summarizeOpportunityCards(cards), /商机卡片/);
});

test('opportunity feedback updates card status and prepares ERP review draft', () => {
  const [card] = buildOpportunityCards({
    bundle: {
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
  });

  const valuable = applyOpportunityFeedback(card, {
    status: 'valuable',
    note: '老板之前关注过',
    updatedAt: '2026-06-22T10:00:00.000Z',
  });
  const irrelevant = applyOpportunityFeedback(card, {
    status: 'irrelevant',
    updatedAt: '2026-06-22T11:00:00.000Z',
  });

  assert.equal(valuable.feedbackStatus, 'valuable');
  assert.equal(valuable.recommendedAction, 'send_to_group');
  assert.equal(valuable.erpReviewDraft?.decision, 'follow');
  assert.match(valuable.erpReviewDraft?.comment || '', /老板之前关注过/);
  assert.equal(irrelevant.feedbackStatus, 'irrelevant');
  assert.equal(irrelevant.relevanceScore, 0);
  assert.equal(irrelevant.recommendedAction, 'ignore');
  assert.equal(irrelevant.erpReviewDraft?.decision, 'irrelevant');
});
