import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScreenedNotices,
  loadProductTerms,
  matchProductTerms,
  summarizeScreenedNotices,
} from './tender-screening.ts';

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

test('product matcher recognizes ERP model aliases from contract history', () => {
  const result = matchProductTerms('采购工业白油68号、阻聚剂B596W、抗静电剂X-997和硅油100粘度');

  assert.ok(result.matchedTerms.includes('白油'));
  assert.ok(result.matchedTerms.includes('阻聚剂'));
  assert.ok(result.matchedTerms.includes('抗静电剂'));
  assert.ok(result.matchedTerms.includes('硅油'));
  assert.ok(result.score >= 90);
});

test('screening ignores product aliases inside signed URLs', () => {
  const [urlOnly] = buildScreenedNotices({
    bundle: {
      source_name: '中化',
      candidates: [{
        title: '太原基地废塑料纸（废PE膜）出售竞价公告',
        url: 'https://example.com/notice/waste',
        published_at: '2026-06-26',
        deadline_at: '',
        buyer_name: '风神轮胎',
        raw_text: 'preSupFileId=https://scm.example.com/file/viewV2/59c69471-0471-4eb5-a301-468965a56144.pdf?u=koFMSVi1trW6SgSxOp5TBhtIcC-sh58IOaMTrIIJxPgbjTueGcPw7W8wTmFlVKTf0otKPfDdMPE',
        attachments: ['https://scm.example.com/file/viewV2/a.pdf?u=koFMSVi1trW6SgSxOp5TBhtIcC-sh58IOaMTrIIJxPgbjTueGcPw7W8wTmFlVKTf0otKPfDdMPE'],
      }],
    },
  });
  const [realBht] = buildScreenedNotices({
    bundle: {
      source_name: '中化',
      candidates: [{
        title: 'BHT抗氧剂采购公告',
        url: 'https://example.com/notice/bht',
        published_at: '2026-06-26',
        deadline_at: '',
        buyer_name: '中化',
        raw_text: 'BHT抗氧剂采购，需确认规格和供货要求。',
        attachments: [],
      }],
    },
  });

  assert.equal(urlOnly.relevanceScore, 0);
  assert.deepEqual(urlOnly.matchedTerms, []);
  assert.ok(realBht.relevanceScore >= 70);
  assert.ok(realBht.matchedTerms.includes('BHT'));
});

test('product matcher keeps broad or service words from creating false positives', () => {
  const office = matchProductTerms('2026 年办公用品和物业保洁服务采购公告');
  const broad = matchProductTerms('某化工园区系统运维服务招标公告');
  const disposal = matchProductTerms('太原基地废BHT包装桶出售竞价公告');
  const sale = matchProductTerms('辽宁公司大开厂焦亚硫酸钠竞价销售项目公告');
  const catalystDisposal = matchProductTerms('金能化学2025年10月废催化剂处置公开招标采购公告');

  assert.equal(office.score, 0);
  assert.deepEqual(office.negativeTerms, ['办公用品', '物业']);
  assert.equal(broad.score, 0);
  assert.equal(disposal.score, 0);
  assert.ok(disposal.negativeTerms.includes('废旧物资出售'));
  assert.equal(sale.score, 0);
  assert.ok(sale.negativeTerms.includes('废旧物资出售'));
  assert.equal(catalystDisposal.score, 0);
  assert.ok(catalystDisposal.negativeTerms.includes('废旧物资出售'));
});

test('product matcher rejects catalyst lab equipment while keeping catalyst materials', () => {
  const equipment = matchProductTerms('合成气催化转化重点实验室装备更新氨合成催化剂活性检测实验装置采购公告');
  const regeneration = matchProductTerms('金能化学2025年8月27日电解银催化剂再生公开招标采购公告');
  const companyNameOnly = matchProductTerms('中国石化催化剂有限公司催化剂有限公司2026年硅胶1采购预案资格预审公告');
  const companyMaterial = matchProductTerms('中国石化催化剂有限公司脱硝催化剂采购公告');
  const material = matchProductTerms('脱硝催化剂采购公告，要求确认供货业绩和检测报告');

  assert.equal(equipment.score, 0);
  assert.ok(equipment.negativeTerms.includes('催化剂检测装置'));
  assert.deepEqual(equipment.matchedTerms, []);
  assert.equal(regeneration.score, 0);
  assert.ok(regeneration.negativeTerms.includes('催化剂再生服务'));
  assert.deepEqual(regeneration.matchedTerms, []);
  assert.equal(companyNameOnly.score, 0);
  assert.deepEqual(companyNameOnly.matchedTerms, []);
  assert.ok(companyMaterial.score >= 50);
  assert.ok(companyMaterial.matchedTerms.includes('催化剂'));
  assert.ok(material.score >= 50);
  assert.ok(material.matchedTerms.includes('催化剂'));
});

test('screening treats award results as non-actionable even when product words match', () => {
  const [card] = buildScreenedNotices({
    bundle: {
      source_name: '易派克',
      candidates: [{
        title: '茂名三万吨 PAO 装置齿轮泵评标结果公示',
        url: 'https://example.com/result/1',
        published_at: '2026-07-11',
        deadline_at: '',
        buyer_name: '中石化',
        raw_text: 'PAO 装置齿轮泵评标结果公示。',
        attachments: [],
      }],
    },
  });

  assert.ok(card.matchedTerms.includes('PAO'));
  assert.equal(card.recommendedAction, 'ignore');
});

test('screened notices carry product evidence and group-ready summary', () => {
  const cards = buildScreenedNotices({
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
  assert.match(summarizeScreenedNotices(cards), /筛选结果/);
});
