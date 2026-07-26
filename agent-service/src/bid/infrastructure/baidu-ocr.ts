import { createHash } from 'node:crypto';

export type BaiduOcrResult = {
  text: string;
  requestCount: number;
  pageCount: number;
  durationMs: number;
  cacheHit: boolean;
  logIds: string[];
};

type Sleep = (milliseconds: number) => Promise<void>;
type BaiduOcrResponse = {
  words_result?: Array<{ words?: string }>;
  pdf_file_size?: number;
  log_id?: string | number;
  error_code?: string | number;
  error_msg?: string;
};

const BAIDU_TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const BAIDU_OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic';
const MAX_FORM_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 6;
const MIN_REQUEST_INTERVAL_MS = 650;
const QPS_RETRY_DELAY_MS = 1_100;
const CACHE_LIMIT = 50;
const MAX_TEXT_LENGTH = 24_000;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const tokenRequests = new Map<string, Promise<string>>();
const recognitionCache = new Map<string, BaiduOcrResult>();
const recognitionRequests = new Map<string, Promise<BaiduOcrResult>>();
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

const sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fingerprint = (parts: Array<string | Buffer>) => {
  const hash = createHash('sha256');
  parts.forEach((part) => hash.update(part));
  return hash.digest('hex');
};

const compact = (lines: string[]) => lines
  .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .join('\n')
  .slice(0, MAX_TEXT_LENGTH);

const credentials = (env: Record<string, string | undefined>) => ({
  apiKey: String(env.BAIDU_OCR_API_KEY || '').trim(),
  secretKey: String(env.BAIDU_OCR_SECRET_KEY || '').trim(),
});

export const hasBaiduOcrCredentials = (env: Record<string, string | undefined>) => {
  const value = credentials(env);
  return Boolean(value.apiKey && value.secretKey);
};

const inputKind = (buffer: Buffer): 'pdf' | 'image' | null => {
  const prefix = buffer.subarray(0, Math.min(buffer.length, 1_024));
  if (prefix.toString('latin1').includes('%PDF-')) return 'pdf';
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image';
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return 'image';
  if (prefix.length >= 2 && prefix.subarray(0, 2).toString('ascii') === 'BM') return 'image';
  if (prefix.length >= 4 && (
    prefix.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]))
    || prefix.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
  )) return 'image';
  return null;
};

const getToken = async (env: Record<string, string | undefined>, fetchImpl: typeof fetch) => {
  const { apiKey, secretKey } = credentials(env);
  if (!apiKey || !secretKey) throw new Error('云端百度 OCR 未配置');
  const cacheKey = fingerprint([apiKey, '\u0000', secretKey]);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const pending = tokenRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const url = new URL(BAIDU_TOKEN_URL);
    url.searchParams.set('grant_type', 'client_credentials');
    url.searchParams.set('client_id', apiKey);
    url.searchParams.set('client_secret', secretKey);
    const response = await fetchImpl(url, { method: 'POST' });
    const body = await response.json() as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!response.ok || !body.access_token) {
      throw new Error(body.error_description || `百度 OCR 鉴权失败 (${response.status})`);
    }
    tokenCache.set(cacheKey, {
      token: body.access_token,
      expiresAt: Date.now() + Math.max(60, Number(body.expires_in || 2_592_000)) * 1_000,
    });
    return body.access_token;
  })();
  tokenRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    tokenRequests.delete(cacheKey);
  }
};

const scheduleRequest = async <T>({
  operation,
  fetchImpl,
  sleepImpl,
}: {
  operation: () => Promise<T>;
  fetchImpl: typeof fetch;
  sleepImpl: Sleep;
}) => {
  if (fetchImpl !== fetch) return operation();
  const previous = requestQueue;
  let release: () => void = () => {};
  requestQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const remaining = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (remaining > 0) await sleepImpl(remaining);
    return await operation();
  } finally {
    lastRequestAt = Date.now();
    release();
  }
};

const isQpsError = (code: unknown, message: string) => (
  Number(code) === 18 || /qps|rate.?limit|频率|并发/i.test(message)
);

const remember = (key: string, result: BaiduOcrResult) => {
  recognitionCache.delete(key);
  recognitionCache.set(key, result);
  while (recognitionCache.size > CACHE_LIMIT) {
    const oldest = recognitionCache.keys().next().value;
    if (!oldest) break;
    recognitionCache.delete(oldest);
  }
};

export const recognizeWithBaiduOcr = async ({
  buffer,
  env = process.env,
  fetchImpl = fetch,
  sleepImpl = sleep,
  bypassCache = false,
}: {
  buffer: Buffer;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  sleepImpl?: Sleep;
  bypassCache?: boolean;
}): Promise<BaiduOcrResult> => {
  const kind = inputKind(buffer);
  if (!kind) throw new Error('附件内容不是有效的 PDF 或图片，已停止发送到 OCR');
  const { apiKey } = credentials(env);
  const maxPages = Math.max(1, Math.min(MAX_PAGES, Number(env.BAIDU_OCR_PDF_PAGES || MAX_PAGES)));
  const cacheKey = fingerprint([apiKey, kind, String(maxPages), buffer]);
  const startedAt = Date.now();
  const complete = (result: BaiduOcrResult, cacheHit: boolean): BaiduOcrResult => ({
    ...result,
    requestCount: cacheHit ? 0 : result.requestCount,
    durationMs: Date.now() - startedAt,
    cacheHit,
  });
  const cached = bypassCache ? null : recognitionCache.get(cacheKey);
  if (cached) return complete(cached, true);
  const pending = bypassCache ? null : recognitionRequests.get(cacheKey);
  if (pending) return complete(await pending, true);

  const operation = (async () => {
    const token = await getToken(env, fetchImpl);
    const encoded = buffer.toString('base64');
    const isPdf = kind === 'pdf';
    let targetPages = 1;
    const lines: string[] = [];
    const logIds: string[] = [];
    let requestCount = 0;
    let pageCount = 0;

    for (let page = 1; page <= targetPages; page += 1) {
      const form = new URLSearchParams();
      form.set(isPdf ? 'pdf_file' : 'image', encoded);
      if (isPdf) form.set('pdf_file_num', String(page));
      form.set('detect_direction', 'true');
      form.set('paragraph', 'false');
      const formBody = form.toString();
      if (Buffer.byteLength(formBody, 'utf8') > MAX_FORM_BYTES) {
        throw new Error('文档超过百度 OCR 8MB 编码上限');
      }

      let responseBody: BaiduOcrResponse | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        requestCount += 1;
        const response = await scheduleRequest({
          fetchImpl,
          sleepImpl,
          operation: () => fetchImpl(`${BAIDU_OCR_URL}?access_token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody,
          }),
        });
        responseBody = await response.json() as BaiduOcrResponse;
        const errorMessage = String(responseBody.error_msg || '');
        if (response.ok && !errorMessage) break;
        if (attempt === 0 && isQpsError(responseBody.error_code, errorMessage)) {
          await sleepImpl(QPS_RETRY_DELAY_MS);
          continue;
        }
        throw new Error(errorMessage || `百度 OCR 识别失败 (${response.status})`);
      }

      if (!responseBody) continue;
      pageCount += 1;
      if (responseBody.log_id !== undefined) logIds.push(String(responseBody.log_id));
      lines.push(...(responseBody.words_result || []).map((item) => item.words || ''));
      if (isPdf && page === 1 && Number(responseBody.pdf_file_size) > 1) {
        targetPages = Math.min(maxPages, Number(responseBody.pdf_file_size));
      }
    }

    return {
      text: compact(lines),
      requestCount,
      pageCount,
      durationMs: Date.now() - startedAt,
      cacheHit: false,
      logIds,
    };
  })();

  if (!bypassCache) recognitionRequests.set(cacheKey, operation);
  try {
    const result = await operation;
    if (!bypassCache) remember(cacheKey, result);
    return complete(result, false);
  } finally {
    if (!bypassCache) recognitionRequests.delete(cacheKey);
  }
};

const probeBitmap = () => {
  const width = 64;
  const height = 24;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowSize * height, 0xff);
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(header.length + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  for (let y = 5; y < 19; y += 1) {
    for (let x = 8; x < 56; x += 1) {
      if (y === 5 || y === 18 || x === 8 || x === 55) {
        const offset = (height - 1 - y) * rowSize + x * 3;
        pixels.fill(0, offset, offset + 3);
      }
    }
  }
  return Buffer.concat([header, pixels]);
};

export const testBaiduOcrConnection = async ({
  env = process.env,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
} = {}) => {
  if (!hasBaiduOcrCredentials(env)) return { ok: false, actualRecognition: false, message: '云端百度 OCR 未配置' };
  try {
    const result = await recognizeWithBaiduOcr({
      buffer: probeBitmap(),
      env,
      fetchImpl,
      bypassCache: true,
    });
    return {
      ok: true,
      actualRecognition: true,
      requestCount: result.requestCount,
      message: '百度 OCR 真实识别成功',
    };
  } catch (error) {
    return {
      ok: false,
      actualRecognition: false,
      requestCount: 0,
      message: `百度 OCR 连接失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
