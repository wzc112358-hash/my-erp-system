import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

test('document reader keeps decrypted PDF.js text exposed by the controlled browser', async () => {
  const documents = await readDocumentsFromObservation({
    observation: {
      title: '公告详情',
      url: 'https://ctbpsp.com/#/bulletinDetail?uuid=1',
      visibleText: '公告详情',
      document: {
        title: '裕龙石化阻聚剂采购招标公告',
        noticeType: '招标公告',
        pdfUrl: 'https://ctbpsp.com/files/1.pdf',
        attachmentUrls: [],
        text: '采购内容：阻聚剂 20 吨；投标截止时间 2026-07-20。',
        pageCount: 3,
      },
    },
  });

  assert.equal(documents.length, 1);
  assert.match(documents[0].text, /阻聚剂 20 吨/);
  assert.equal(documents[0].url, 'https://ctbpsp.com/files/1.pdf');
});

test('document reader falls back to configured OCR when a fetched PDF has no usable text', async () => {
  let ocrCalls = 0;
  const documents = await readDocumentsFromObservation({
    observation: {
      title: '扫描公告',
      url: 'https://ctbpsp.com/#/bulletinDetail?uuid=2',
      visibleText: '公告详情',
      document: {
        title: '扫描公告',
        pdfUrl: 'https://ctbpsp.com/files/scanned.pdf',
        attachmentUrls: [],
        text: '',
        pageCount: 2,
      },
    },
    fetchImpl: (async () => new Response(Buffer.from('%PDF-1.7\nscanned'), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })) as typeof fetch,
    ocrConfig: { enabled: true, provider: 'baidu', baiduApiKey: 'a', baiduSecretKey: 'b' },
    ocrRecognizer: async () => {
      ocrCalls += 1;
      return { provider: 'baidu', text: 'OCR：采购二甲基硅油 5 吨' };
    },
  });

  assert.equal(ocrCalls, 1);
  assert.match(documents[0].text, /二甲基硅油/);
  assert.equal(documents[0].ocrProvider, 'baidu');
});

test('compressed PDF internals are never accepted as readable tender text', async () => {
  let ocrCalls = 0;
  const documents = await readDocumentsFromObservation({
    observation: {
      title: '压缩扫描公告',
      url: 'https://example.com/list',
      visibleText: '公告详情',
      document: {
        title: '压缩扫描公告',
        pdfUrl: 'https://example.com/compressed.pdf',
        attachmentUrls: [],
        text: '',
      },
    },
    fetchImpl: (async () => new Response(Buffer.from(`%PDF-1.7\n1 0 obj\n<</Filter/FlateDecode/Length 9000>>stream\n${'AFCD0123'.repeat(800)}\nendstream`), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })) as typeof fetch,
    ocrConfig: { enabled: true, provider: 'baidu', baiduApiKey: 'a', baiduSecretKey: 'b' },
    ocrRecognizer: async () => {
      ocrCalls += 1;
      return { provider: 'baidu', text: '采购芥酸酰胺 10 吨，报价截止 2026 年 7 月 18 日。' };
    },
  });

  assert.equal(ocrCalls, 1);
  assert.match(documents[0]?.text || '', /芥酸酰胺/);
  assert.doesNotMatch(documents[0]?.text || '', /FlateDecode/);
});

test('document reader rejects a site homepage that was misreported as a PDF', async () => {
  let ocrCalls = 0;
  const documents = await readDocumentsFromObservation({
    observation: {
      title: '裕龙石化磷酸三甲酯招标公告',
      url: 'https://ctbpsp.com/#/bulletinDetail?uuid=bad-pdf',
      visibleText: '公告详情',
      document: {
        title: '裕龙石化磷酸三甲酯招标公告',
        pdfUrl: 'https://ctbpsp.com/',
        attachmentUrls: [],
        text: '',
      },
    },
    fetchImpl: (async () => new Response(`<!doctype html><style>${'.box{color:red}'.repeat(200)}</style>`, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })) as typeof fetch,
    ocrConfig: { enabled: true, provider: 'baidu', baiduApiKey: 'a', baiduSecretKey: 'b' },
    ocrRecognizer: async () => {
      ocrCalls += 1;
      return { provider: 'baidu', text: '不应调用' };
    },
  });

  assert.equal(ocrCalls, 0);
  assert.equal(documents[0]?.text, '');
  assert.match(documents[0]?.warning || '', /不是可识别的公告文档/);
});

test('document reader sends a captured detail screenshot to configured OCR', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hcz-detail-shot-'));
  const screenshot = path.join(root, 'detail.png');
  await fs.writeFile(screenshot, Buffer.from('fake-png'));
  let ocrCalls = 0;
  try {
    const documents = await readDocumentsFromObservation({
      observation: {
        title: '裕龙石化硫酸镁溶液招标公告',
        url: 'https://ctbpsp.com/#/bulletinDetail?uuid=shot',
        visibleText: '公告详情',
        downloadedFiles: [screenshot],
      },
      ocrConfig: { enabled: true, provider: 'baidu', baiduApiKey: 'a', baiduSecretKey: 'b' },
      ocrRecognizer: async ({ fileName }) => {
        ocrCalls += 1;
        assert.equal(fileName, screenshot);
        return { provider: 'baidu', text: '投标截止时间：2026年7月25日；硫酸镁溶液100吨。' };
      },
    });

    assert.equal(ocrCalls, 1);
    assert.equal(documents[0]?.ocrProvider, 'baidu');
    assert.match(documents[0]?.text || '', /截止时间/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
