import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enrichCandidateWithDetail,
  extractAttachmentUrls,
  extractDetailFromHtml,
  extractProjectNumber,
  extractPublishDate,
} from './detail.js';

const detailHtml = `
  <html>
    <body>
      <h1>国源电力河曲电厂酸、碱、氨水药品采购公开招标项目招标公告</h1>
      <p>项目编号：CEZB260123456</p>
      <p>招标人：国源电力河曲电厂</p>
      <p>发布时间：2026-05-25</p>
      <p>投标文件递交截止时间：2026年06月03日 09:00</p>
      <p>采购范围：盐酸、液碱、氨水等药品。</p>
      <a href="/files/spec.docx">技术规范书.docx</a>
      <a href="https://example.com/files/tender.pdf">招标文件.pdf</a>
      <a href="/notice/list.html">返回列表</a>
    </body>
  </html>
`;

test('extractPublishDate parses common Chinese publish date labels', () => {
  assert.equal(extractPublishDate('发布时间：2026-05-25'), '2026-05-25');
  assert.equal(extractPublishDate('发布日期：2026年5月6日'), '2026-05-06');
});

test('extractProjectNumber parses project number labels', () => {
  assert.equal(extractProjectNumber('项目编号：CEZB260123456'), 'CEZB260123456');
  assert.equal(extractProjectNumber('招标编号: 0747-2660SCCZV001'), '0747-2660SCCZV001');
});

test('extractAttachmentUrls returns document links resolved against detail url', () => {
  const attachments = extractAttachmentUrls('https://example.com/notice/detail.html', detailHtml);

  assert.deepEqual(attachments, [
    'https://example.com/files/spec.docx',
    'https://example.com/files/tender.pdf',
  ]);
});

test('extractDetailFromHtml returns normalized detail metadata', () => {
  const detail = extractDetailFromHtml('https://example.com/notice/detail.html', detailHtml);

  assert.equal(detail.publishDate, '2026-05-25');
  assert.equal(detail.deadlineDate, '2026-06-03');
  assert.equal(detail.buyerName, '国源电力河曲电厂');
  assert.equal(detail.projectNumber, 'CEZB260123456');
  assert.equal(detail.attachmentUrls.length, 2);
  assert.match(detail.rawText, /盐酸、液碱、氨水/);
});

test('enrichCandidateWithDetail prefers detail metadata while keeping list title', () => {
  const enriched = enrichCandidateWithDetail(
    {
      title: '列表页标题',
      url: 'https://example.com/notice/detail.html',
      content: '列表页摘要',
      attachmentUrls: ['https://example.com/files/list.pdf'],
    },
    detailHtml,
  );

  assert.equal(enriched.title, '列表页标题');
  assert.equal(enriched.publishDate, '2026-05-25');
  assert.equal(enriched.deadlineDate, '2026-06-03');
  assert.equal(enriched.buyerName, '国源电力河曲电厂');
  assert.equal(enriched.projectNumber, 'CEZB260123456');
  assert.ok(enriched.content.includes('列表页摘要'));
  assert.ok(enriched.content.includes('盐酸、液碱、氨水'));
  assert.deepEqual(enriched.attachmentUrls, [
    'https://example.com/files/list.pdf',
    'https://example.com/files/spec.docx',
    'https://example.com/files/tender.pdf',
  ]);
});
