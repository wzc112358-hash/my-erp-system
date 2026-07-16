import assert from 'node:assert/strict';
import test from 'node:test';

import {
  recognizeDocumentWithOCR,
  type LocalOCRConfig,
} from './ocr.ts';

test('Baidu OCR exchanges credentials for a token and returns recognized document text', async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: String(init?.body || '') });
    if (url.includes('/oauth/2.0/token')) {
      return new Response(JSON.stringify({ access_token: 'baidu-token', expires_in: 2_592_000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      words_result: [{ words: '山东裕龙石化有限公司' }, { words: '阻聚剂采购招标公告' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const config: LocalOCRConfig = {
    enabled: true,
    provider: 'baidu',
    baiduApiKey: 'api-secret',
    baiduSecretKey: 'key-secret',
  };

  const result = await recognizeDocumentWithOCR({
    buffer: Buffer.from('%PDF-1.7 scanned document'),
    fileName: 'notice.pdf',
    contentType: 'application/pdf',
    config,
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert.equal(result.provider, 'baidu');
  assert.match(result.text, /阻聚剂采购招标公告/);
  assert.equal(requests.length, 2);
  assert.match(requests[1]?.body || '', /pdf_file=/);
  assert.doesNotMatch(requests[1]?.body || '', /api-secret|key-secret/);
});

test('Paddle OCR command adapter reads the generated recognition JSON', async () => {
  const config: LocalOCRConfig = {
    enabled: true,
    provider: 'paddle',
    paddleCommand: '/opt/paddle/bin/paddleocr',
    paddleConfigPath: '/opt/paddle/ocr_lite.yaml',
    paddleDevice: 'gpu:0',
  };
  const result = await recognizeDocumentWithOCR({
    buffer: Buffer.from('fake image'),
    fileName: 'notice.png',
    contentType: 'image/png',
    config,
    runPaddle: async ({ command, args }) => {
      assert.equal(command, config.paddleCommand);
      assert.ok(args.includes('--paddlex_config'));
      return ['裕龙石化招标公告', '采购产品：二甲基硅油'];
    },
  });

  assert.equal(result.provider, 'paddle');
  assert.match(result.text, /二甲基硅油/);
});
