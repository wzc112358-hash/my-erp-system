import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import {
  extractDocumentLinks,
  extractTextFromDocumentBuffer,
  formatDocumentEvidence,
  readDocumentsFromObservation,
} from './document-reader.ts';

const u16 = (value: number) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
};

const u32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
};

const makeDocx = (xml: string) => {
  const name = Buffer.from('word/document.xml');
  const data = Buffer.from(xml);
  const compressed = zlib.deflateRawSync(data);
  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(8),
    u16(0),
    u16(0),
    u32(0),
    u32(compressed.length),
    u32(data.length),
    u16(name.length),
    u16(0),
    name,
    compressed,
  ]);
  const central = Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(8),
    u16(0),
    u16(0),
    u32(0),
    u32(compressed.length),
    u32(data.length),
    u16(name.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    name,
  ]);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);
  return Buffer.concat([local, central, eocd]);
};

test('document reader extracts attachment links from page observation', () => {
  const links = extractDocumentLinks({
    title: '公告详情',
    url: 'https://example.com/detail',
    visibleText: '附件下载',
    links: [
      { text: '下载采购文件', href: '/files/tender.docx' },
      { text: '返回首页', href: '/' },
    ],
  });

  assert.deepEqual(links, [{
    title: '下载采购文件',
    url: 'https://example.com/files/tender.docx',
  }]);
});

test('document reader ignores notice column navigation links', () => {
  const links = extractDocumentLinks({
    title: '国能E招',
    url: 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html',
    visibleText: '公告信息 招标公告 招标文件公示',
    links: [
      { text: '招标公告', href: '/bidweb/001/001002/moreinfo.html' },
      { text: '资格预审公告', href: '/bidweb/001/001001/moreinfo.html' },
      { text: '招标文件公示', href: '/bidweb/001/001006/moreinfo.html' },
      { text: '下载采购文件', href: '/files/tender.docx' },
    ],
  });

  assert.deepEqual(links, [{
    title: '下载采购文件',
    url: 'https://www.chnenergybidding.com.cn/files/tender.docx',
  }]);
});

test('document reader extracts text from simple PDF and DOCX buffers', () => {
  const pdf = Buffer.from('%PDF-1.4\nBT\n(阻聚剂技术规格 20 吨) Tj\nET', 'utf8');
  const docx = makeDocx('<w:document><w:body><w:p><w:r><w:t>代理商投标需授权</w:t></w:r></w:p></w:body></w:document>');

  assert.match(extractTextFromDocumentBuffer({ buffer: pdf, fileName: 'a.pdf' }), /阻聚剂技术规格/);
  assert.match(extractTextFromDocumentBuffer({ buffer: docx, fileName: 'a.docx' }), /代理商投标需授权/);
});

test('document reader fetches public attachments and formats evidence', async () => {
  const documents = await readDocumentsFromObservation({
    observation: {
      title: '公告详情',
      url: 'https://example.com/detail',
      visibleText: '附件下载',
      links: [{ text: '询价文件', href: 'https://example.com/tender.txt' }],
    },
    fetchImpl: (async () => new Response('第三方检测报告和供货业绩要求', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })) as typeof fetch,
  });

  assert.equal(documents.length, 1);
  assert.match(documents[0].text, /第三方检测报告/);
  assert.match(formatDocumentEvidence(documents), /询价文件/);
});
