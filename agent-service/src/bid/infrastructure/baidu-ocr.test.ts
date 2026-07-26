import assert from 'node:assert/strict';
import test from 'node:test';

import { recognizeWithBaiduOcr, testBaiduOcrConnection } from './baidu-ocr.ts';

const envFor = (suffix: string) => ({
  BAIDU_OCR_API_KEY: `api-${suffix}`,
  BAIDU_OCR_SECRET_KEY: `secret-${suffix}`,
  BAIDU_OCR_PDF_PAGES: '6',
});

test('discovers and recognizes all reported PDF pages within the configured limit', async () => {
  const requestedPages: string[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/oauth/2.0/token')) {
      return new Response(JSON.stringify({ access_token: 'pages-token', expires_in: 3_600 }));
    }
    const form = new URLSearchParams(String(init?.body || ''));
    const page = form.get('pdf_file_num') || '';
    requestedPages.push(page);
    return new Response(JSON.stringify({
      log_id: `page-${page}`,
      pdf_file_size: 3,
      words_result: [{ words: `第${page}页采购信息` }],
    }));
  };

  const result = await recognizeWithBaiduOcr({
    buffer: Buffer.from('%PDF-1.7 multi-page-fixture'),
    env: envFor('pages'),
    fetchImpl: fetchImpl as typeof fetch,
    sleepImpl: async () => undefined,
  });

  assert.deepEqual(requestedPages, ['1', '2', '3']);
  assert.equal(result.requestCount, 3);
  assert.equal(result.pageCount, 3);
  assert.match(result.text, /第3页采购信息/);
});

test('retries one Baidu QPS rejection', async () => {
  let recognitionCalls = 0;
  const fetchImpl = async (input: string | URL | Request) => {
    if (String(input).includes('/oauth/2.0/token')) {
      return new Response(JSON.stringify({ access_token: 'qps-token', expires_in: 3_600 }));
    }
    recognitionCalls += 1;
    return recognitionCalls === 1
      ? new Response(JSON.stringify({ error_code: 18, error_msg: 'Open api qps request limit reached' }))
      : new Response(JSON.stringify({ log_id: 'retry-ok', words_result: [{ words: '重试识别成功' }] }));
  };

  const result = await recognizeWithBaiduOcr({
    buffer: Buffer.from('%PDF-1.7 qps-fixture'),
    env: envFor('qps'),
    fetchImpl: fetchImpl as typeof fetch,
    sleepImpl: async () => undefined,
  });

  assert.equal(recognitionCalls, 2);
  assert.equal(result.requestCount, 2);
  assert.match(result.text, /重试识别成功/);
});

test('rejects a fake PDF before uploading document bytes', async () => {
  let requests = 0;
  await assert.rejects(() => recognizeWithBaiduOcr({
    buffer: Buffer.from('{"url":"https://example.test/actual.pdf"}'),
    env: envFor('invalid'),
    fetchImpl: (async () => {
      requests += 1;
      throw new Error('should not fetch');
    }) as typeof fetch,
  }), /不是有效的 PDF 或图片/);
  assert.equal(requests, 0);
});

test('deduplicates identical document recognition by content hash', async () => {
  let recognitionCalls = 0;
  const fetchImpl = async (input: string | URL | Request) => {
    if (String(input).includes('/oauth/2.0/token')) {
      return new Response(JSON.stringify({ access_token: 'cache-token', expires_in: 3_600 }));
    }
    recognitionCalls += 1;
    return new Response(JSON.stringify({ log_id: 'cache-call', words_result: [{ words: '缓存识别文本' }] }));
  };
  const input = {
    buffer: Buffer.from('%PDF-1.7 duplicate-fixture'),
    env: envFor('cache'),
    fetchImpl: fetchImpl as typeof fetch,
    sleepImpl: async () => undefined,
  };

  const [first, second] = await Promise.all([
    recognizeWithBaiduOcr(input),
    recognizeWithBaiduOcr(input),
  ]);

  assert.equal(recognitionCalls, 1);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.requestCount, 0);
});

test('connection test performs a real recognition request, not only token exchange', async () => {
  const requests: string[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    requests.push(String(input));
    return String(input).includes('/oauth/2.0/token')
      ? new Response(JSON.stringify({ access_token: 'probe-token', expires_in: 3_600 }))
      : new Response(JSON.stringify({ log_id: 'probe-log', words_result: [] }));
  };

  const result = await testBaiduOcrConnection({ env: envFor('probe'), fetchImpl: fetchImpl as typeof fetch });

  assert.equal(result.ok, true);
  assert.equal(result.actualRecognition, true);
  assert.equal(requests.length, 2);
});
