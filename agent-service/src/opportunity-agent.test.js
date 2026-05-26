import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroupSummary,
  classifyOpportunity,
  dedupeCandidates,
  extractCandidatesFromHtml,
  buildProductVocabulary,
  normalizeCandidate,
  processCandidatesWithEnhancement,
} from './opportunity-agent.js';

test('normalizeCandidate extracts dates, keywords, buyer, and stable fingerprint', () => {
  const candidate = normalizeCandidate({
    sourceName: '裕龙石化招投标网',
    ownerName: '小白',
    title: '裕龙石化 缓蚀阻垢剂 招标公告',
    url: 'https://example.com/tender/123?from=list',
    content: '采购单位：裕龙石化。投标截止日期：2026-06-02。要求代理商可以投标，需第三方检测报告。',
  });

  assert.equal(candidate.sourceName, '裕龙石化招投标网');
  assert.equal(candidate.ownerName, '小白');
  assert.equal(candidate.buyerName, '裕龙石化');
  assert.equal(candidate.deadlineDate, '2026-06-02');
  assert.deepEqual(candidate.productKeywords, ['缓蚀阻垢剂']);
  assert.equal(candidate.fingerprint.length, 64);
});

test('classifyOpportunity flags relevant chemical opportunities and hard requirements', () => {
  const candidate = normalizeCandidate({
    sourceName: '云梦泽询价网',
    ownerName: '小白',
    title: '聚丙烯酰胺采购询价',
    content: '本项目允许代理商投标，需第三方检测，要求中石油8位码，危险品证件齐全。',
  });

  const result = classifyOpportunity(candidate);

  assert.equal(result.relevance, 'likely_related');
  assert.equal(result.requiresAgencyAllowedCheck, false);
  assert.equal(result.requiresThirdPartyTest, true);
  assert.equal(result.requiresEightDigitCode, true);
  assert.equal(result.requiresHazmatLicense, true);
  assert.match(result.summary, /聚丙烯酰胺/);
});

test('classifyOpportunity retains real group-chat chemical tender examples', () => {
  const retainedTitles = [
    '炼油四部用塑料用抗静电剂（2026-2027）框架采购询比采购公告',
    '宁夏电力英力特化工2026年焦亚硫酸钠物资询价采购',
    '焦化公司棋盘井洗煤厂2026年起泡剂、捕收剂采购公开招标项目招标公告',
    '2026年华鹤公司中修氨生产部二氧化碳气体脱硫、脱氢催化剂采购',
    '【询比采购】 紫外线吸收剂 CS82 99% 25kg/桶 采购公告',
    '【询比采购】 DMPP硝化抑制剂（1型）采购公告',
    '【阻聚剂】 采购询源公告',
    '【询比采购】 表面活性剂ST-80采购公告',
    '采购1吨苯基三甲氧基硅烷、1.05吨六甲基二硅氧烷采购公告',
  ];

  for (const title of retainedTitles) {
    const candidate = normalizeCandidate({
      sourceName: '历史群聊样本',
      ownerName: '小杨',
      title,
    });
    const result = classifyOpportunity(candidate);

    assert.notEqual(result.relevance, 'irrelevant', title);
    assert.ok(result.relevanceScore >= 0.45, title);
    assert.ok(result.matchedTerms.length > 0, title);
    assert.ok(result.evidenceText.length > 0, title);
    assert.equal(result.classificationVersion, 'chemical-relevance-v1');
  }
});

test('classifyOpportunity marks ERP history products with matched source', () => {
  const erpHistoryTitles = [
    '白油采购询价公告',
    '凡士林脂采购公告',
    '引发剂年度框架采购公告',
  ];

  for (const title of erpHistoryTitles) {
    const candidate = normalizeCandidate({
      sourceName: 'ERP历史产品样本',
      ownerName: '小白',
      title,
    });
    const result = classifyOpportunity(candidate);

    assert.equal(result.relevance, 'likely_related', title);
    assert.ok(result.matchedSources.includes('erp_history'), title);
  }
});

test('classifyOpportunity de-prioritizes non-chemical notices with negative terms', () => {
  const negativeTitles = [
    '办公用品采购公告',
    '物业保洁服务招标公告',
    '办公楼土建维修工程招标公告',
    '信息化系统运维服务采购公告',
  ];

  for (const title of negativeTitles) {
    const candidate = normalizeCandidate({
      sourceName: '负向样本',
      ownerName: '小陈',
      title,
    });
    const result = classifyOpportunity(candidate);

    assert.equal(result.relevance, 'irrelevant', title);
    assert.ok(result.relevanceScore <= 0.25, title);
    assert.ok(result.negativeTerms.length > 0, title);
  }
});

test('classifyOpportunity does not retain broad tender notices without product signal', () => {
  const candidate = normalizeCandidate({
    sourceName: '国能E招',
    ownerName: '小杨',
    title: '国家能源集团2026年第一批带式输送机集中采购公开招标项目招标公告',
  });
  const result = classifyOpportunity(candidate);

  assert.equal(result.relevance, 'irrelevant');
  assert.equal(result.relevanceScore, 0.2);
  assert.equal(result.needsHumanCheck, false);
});

test('classifyOpportunity keeps chemical reagent notices from public portals for manual review', () => {
  const candidate = normalizeCandidate({
    sourceName: '国能E招',
    ownerName: '小杨',
    title: '国源电力河曲电厂酸、碱、氨水药品采购公开招标项目招标公告',
  });
  const result = classifyOpportunity(candidate);

  assert.notEqual(result.relevance, 'irrelevant');
  assert.ok(result.matchedTerms.includes('氨水'));
  assert.ok(result.matchedTerms.includes('药品'));
  assert.ok(result.needsHumanCheck);
});

test('classifyOpportunity de-prioritizes service notices that mention chemical company names', () => {
  const candidate = normalizeCandidate({
    sourceName: '国能E招',
    ownerName: '小杨',
    title: '宁夏煤业烯烃一分公司电气设备试验服务公开招标项目招标公告',
  });
  const result = classifyOpportunity(candidate);

  assert.equal(result.relevance, 'irrelevant');
  assert.ok(result.negativeTerms.includes('试验服务'));
});

test('buildProductVocabulary merges source keywords with seeded product intelligence', () => {
  const vocabulary = buildProductVocabulary('缓蚀阻垢剂,白油');

  assert.ok(vocabulary.some((item) => item.term === '白油' && item.source === 'erp_history'));
  assert.ok(vocabulary.some((item) => item.term === '抗静电剂' && item.source === 'chat_history'));
  assert.ok(vocabulary.some((item) => item.term === '缓蚀阻垢剂' && item.source === 'source_config'));
});

test('dedupeCandidates keeps one notice for repeated url or title', () => {
  const first = normalizeCandidate({
    sourceName: '裕龙石化招投标网',
    ownerName: '小白',
    title: '缓蚀剂采购公告',
    url: 'https://example.com/a',
  });
  const sameUrl = normalizeCandidate({
    sourceName: '裕龙石化招投标网',
    ownerName: '小白',
    title: '缓蚀剂采购公告-详情',
    url: 'https://example.com/a',
  });
  const sameTitle = normalizeCandidate({
    sourceName: '裕龙石化招投标网',
    ownerName: '小白',
    title: '缓蚀剂采购公告',
    url: 'https://example.com/b',
  });

  assert.equal(dedupeCandidates([first, sameUrl, sameTitle]).length, 1);
});

test('buildGroupSummary reports owner counts and urgent items', () => {
  const items = [
    normalizeCandidate({
      sourceName: '裕龙石化招投标网',
      ownerName: '小白',
      title: '缓蚀剂采购公告',
      content: '投标截止日期：2099-01-02',
    }),
    normalizeCandidate({
      sourceName: '中化招投标网',
      ownerName: '小杨',
      title: '无关办公用品采购',
    }),
  ].map((candidate) => ({
    ...candidate,
    classification: classifyOpportunity(candidate),
  }));

  const summary = buildGroupSummary(items, new Date('2099-01-01T08:00:00+08:00'));

  assert.match(summary, /小白/);
  assert.match(summary, /1 条疑似相关/);
  assert.match(summary, /1 条需 3 日内确认/);
  assert.match(summary, /正式处理请进入 ERP 商机池/);
});

test('buildGroupSummary reports no related items when new notices are irrelevant', () => {
  const items = [
    normalizeCandidate({
      sourceName: '中化招标网',
      ownerName: '小杨',
      title: '办公用品采购公告',
    }),
  ].map((candidate) => ({
    ...candidate,
    classification: classifyOpportunity(candidate),
  }));

  const summary = buildGroupSummary(items, new Date('2026-05-23T09:00:00+08:00'));

  assert.match(summary, /暂无新增疑似相关商机/);
  assert.doesNotMatch(summary, /小杨：0 条疑似相关/);
});

test('extractCandidatesFromHtml finds likely bid notice links from a public page', () => {
  const candidates = extractCandidatesFromHtml(
    {
      id: 'src1',
      source_name: '裕龙招投标网',
      owner_name: '小白',
      source_url: 'https://example.com/notices/index.html',
      keywords: '阻聚剂,缓蚀剂',
    },
    `
      <a href="/notices/1001.html">【询比采购】 阻聚剂采购询源公告 截止时间：2026年05月07日15时00分</a>
      <a href="/news/1.html">公司新闻</a>
    `,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, '【询比采购】 阻聚剂采购询源公告 截止时间：2026年05月07日15时00分');
  assert.equal(candidates[0].url, 'https://example.com/notices/1001.html');
  assert.equal(candidates[0].deadlineDate, '2026-05-07');
});

test('extractCandidatesFromHtml collects broad tender notices without known product keywords', () => {
  const candidates = extractCandidatesFromHtml(
    {
      id: 'src2',
      source_name: '国能E购',
      owner_name: '小杨',
      source_url: 'https://example.com/list.html',
      keywords: '',
    },
    `
      <a href="/notice/2001.html">宁夏公司2026年第一批物资询价采购公告</a>
      <a href="/news/1.html">公司新闻</a>
    `,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, '宁夏公司2026年第一批物资询价采购公告');
});

test('extractCandidatesFromHtml skips navigation and template links from public portals', () => {
  const candidates = extractCandidatesFromHtml(
    {
      id: 'src3',
      source_name: '国能E招',
      owner_name: '小杨',
      source_url: 'https://example.com/bidweb/001/001002/moreinfo.html',
      keywords: '',
    },
    `
      <a href="/bidweb/001/001002/moreinfo.html">招标公告</a>
      <a href="/bidweb/001/001003/moreinfo.html">资格预审公告</a>
      <a href="{{ biddingLocalhost }}/old">竞价（旧版）</a>
      <a href="javascript:void(0)">采购公告</a>
      <a href="/notice/3001.html">国源电力河曲电厂酸、碱、氨水药品采购公开招标项目招标公告</a>
    `,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, '国源电力河曲电厂酸、碱、氨水药品采购公开招标项目招标公告');
  assert.equal(candidates[0].url, 'https://example.com/notice/3001.html');
});

test('processCandidatesWithEnhancement merges LLM classification when available', async () => {
  const rawCandidates = [{
    sourceName: '裕龙招投标网',
    ownerName: '小白',
    title: '缓蚀阻垢剂采购公告',
    url: 'https://example.com/notice/1',
    content: '采购单位：裕龙石化。需第三方检测报告。',
  }];

  const processed = await processCandidatesWithEnhancement(rawCandidates, {
    classifierEnhancer: async (candidate, ruleClassification) => ({
      ...ruleClassification,
      relevance: 'likely_related',
      relevanceScore: 0.93,
      confidence: 0.9,
      matchedSources: [...ruleClassification.matchedSources, 'llm'],
      summary: 'LLM 判断为相关化工助剂商机。',
      classificationVersion: `${ruleClassification.classificationVersion}+llm`,
    }),
  });

  assert.equal(processed.length, 1);
  assert.equal(processed[0].classification.relevance, 'likely_related');
  assert.equal(processed[0].classification.relevanceScore, 0.93);
  assert.ok(processed[0].classification.matchedSources.includes('llm'));
});

test('processCandidatesWithEnhancement keeps rule classification when enhancer returns null', async () => {
  const rawCandidates = [{
    sourceName: '负向样本',
    ownerName: '小陈',
    title: '办公用品采购公告',
  }];

  const processed = await processCandidatesWithEnhancement(rawCandidates, {
    classifierEnhancer: async () => null,
  });

  assert.equal(processed[0].classification.relevance, 'irrelevant');
  assert.equal(processed[0].classification.classificationVersion, 'chemical-relevance-v1');
});
