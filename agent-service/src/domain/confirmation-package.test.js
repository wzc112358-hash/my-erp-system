import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConfirmationPackage,
  recommendNextAction,
  summarizeDocumentsForPackage,
} from './confirmation-package.js';

const opportunity = {
  title: '裕龙石化缓蚀阻垢剂采购公告',
  source_name: '裕龙招投标网',
  owner_name: '小白',
  buyer_name: '裕龙石化有限公司',
  deadline_date: '2026-06-05',
  product_keywords: '缓蚀阻垢剂,阻垢剂',
  evidence_text: '命中缓蚀阻垢剂，需第三方检测报告。',
  hard_requirements: '第三方检测,业绩要求',
  risk_flags: '需第三方检测,需核对历史业绩',
  employee_assessment: '产品可关注，需采购确认价格。',
  agent_summary: '疑似产品：缓蚀阻垢剂；硬性条件：第三方检测、业绩要求',
};

test('summarizeDocumentsForPackage keeps compact document evidence', () => {
  const summary = summarizeDocumentsForPackage([
    { title: '公告正文', parse_summary: '已解析公告正文', evidence_text: '接受代理商投标' },
    { title: '技术规范', summary: '需要第三方检测报告' },
  ]);

  assert.match(summary, /公告正文：已解析公告正文/);
  assert.match(summary, /技术规范：需要第三方检测报告/);
});

test('recommendNextAction detects document and hard-requirement followups', () => {
  assert.equal(recommendNextAction({ ...opportunity, status: 'needs_documents' }), '需先补齐标书/附件，再提交王总判断');
  assert.equal(recommendNextAction(opportunity), '建议王总判断是否推进报价，并同步核对硬性条件');
  assert.equal(recommendNextAction({ ...opportunity, hard_requirements: '', risk_flags: '' }), '信息较完整，可进入王总确认');
});

test('buildConfirmationPackage includes decision-ready fields', () => {
  const pkg = buildConfirmationPackage({
    opportunity,
    documents: [{ title: '公告正文', parse_summary: '已解析公告正文', evidence_text: '接受代理商投标' }],
    reviews: [{ review_type: 'employee', decision: 'follow', comment: '员工认为可关注' }],
  });

  assert.equal(pkg.title, '裕龙石化缓蚀阻垢剂采购公告');
  assert.equal(pkg.buyer, '裕龙石化有限公司');
  assert.equal(pkg.deadline, '2026-06-05');
  assert.equal(pkg.product_keywords, '缓蚀阻垢剂,阻垢剂');
  assert.match(pkg.package_text, /裕龙石化缓蚀阻垢剂采购公告/);
  assert.match(pkg.package_text, /员工认为可关注/);
  assert.match(pkg.package_text, /建议王总判断/);
});
