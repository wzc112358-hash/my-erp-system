import assert from 'node:assert/strict';
import test from 'node:test';

import { readCandidateDocuments } from './document-reader.ts';

test('routes a valid image attachment through Baidu OCR and preserves recognition metadata', async () => {
  let ocrCalls = 0;
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'https://files.test/scanned.bmp') {
      return new Response(Buffer.concat([Buffer.from('BM'), Buffer.alloc(128)]), {
        status: 200,
        headers: { 'content-type': 'image/bmp' },
      });
    }
    if (url.includes('/oauth/2.0/token')) {
      return new Response(JSON.stringify({ access_token: 'reader-token', expires_in: 3_600 }));
    }
    ocrCalls += 1;
    return new Response(JSON.stringify({
      log_id: 'reader-log',
      words_result: [{ words: '扫描文件采购阻聚剂三十吨，截止时间待确认' }],
    }));
  };

  const documents = await readCandidateDocuments({
    candidate: {
      title: '扫描公告',
      url: 'https://notice.test/1',
      published_at: '2026-07-26',
      deadline_at: '',
      buyer_name: '测试采购方',
      raw_text: '扫描附件公告',
      attachments: ['https://files.test/scanned.bmp'],
    },
    env: {
      BAIDU_OCR_API_KEY: 'reader-api',
      BAIDU_OCR_SECRET_KEY: 'reader-secret',
      BAIDU_OCR_PDF_PAGES: '6',
    },
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert.equal(ocrCalls, 1);
  assert.equal(documents[0]?.readMethod, '百度 OCR');
  assert.equal(documents[0]?.ocrPageCount, 1);
  assert.match(documents[0]?.text || '', /阻聚剂三十吨/);
});
