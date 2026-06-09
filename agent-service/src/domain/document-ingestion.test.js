import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDocumentCandidate,
  extractDocumentInsight,
  normalizeDocumentText,
} from './document-ingestion.js';

const pastedText = `
  裕龙石化缓蚀阻垢剂采购公告
  采购单位：裕龙石化有限公司
  投标截止日期：2026-06-05
  本项目接受代理商投标，需提供第三方检测报告和近三年业绩。
`;

test('normalizeDocumentText removes repeated whitespace from pasted tender text', () => {
  assert.equal(normalizeDocumentText('  缓蚀剂   采购\n\n公告  '), '缓蚀剂 采购 公告');
});

test('buildDocumentCandidate creates a candidate shape from manual document text', () => {
  const candidate = buildDocumentCandidate({
    title: '人工复制公告',
    text: pastedText,
    sourceName: '人工补资料',
    ownerName: '小白',
    url: 'https://example.com/manual',
  });

  assert.equal(candidate.title, '人工复制公告');
  assert.equal(candidate.sourceName, '人工补资料');
  assert.equal(candidate.ownerName, '小白');
  assert.equal(candidate.deadlineDate, '2026-06-05');
  assert.equal(candidate.buyerName, '裕龙石化有限公司');
  assert.match(candidate.content, /第三方检测报告/);
});

test('extractDocumentInsight classifies manual document text with evidence', () => {
  const insight = extractDocumentInsight({
    title: '人工复制公告',
    text: pastedText,
    sourceName: '人工补资料',
    ownerName: '小白',
  });

  assert.equal(insight.extractionStatus, 'parsed');
  assert.equal(insight.candidate.deadlineDate, '2026-06-05');
  assert.equal(insight.classification.relevance, 'likely_related');
  assert.ok(insight.classification.productKeywords.includes('缓蚀阻垢剂'));
  assert.ok(insight.classification.hardRequirements.includes('第三方检测'));
  assert.ok(insight.classification.hardRequirements.includes('业绩要求'));
  assert.match(insight.summary, /缓蚀阻垢剂/);
});

test('extractDocumentInsight reports empty manual text clearly', () => {
  const insight = extractDocumentInsight({
    title: '空文档',
    text: '   ',
  });

  assert.equal(insight.extractionStatus, 'empty');
  assert.equal(insight.classification, null);
  assert.match(insight.summary, /没有可解析文本/);
});
