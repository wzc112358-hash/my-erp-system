import type { TenderCandidate } from '../domain/collection.ts';

export type DocumentEvidence = {
  title: string;
  url: string;
  text: string;
  readMethod?: '网页正文' | 'PDF/附件文本' | '百度 OCR';
  warning?: string;
};

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 24_000;
const BAIDU_TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const BAIDU_OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic';
let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

const compact = (value = '') => value
  .replace(/\u0000/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, MAX_TEXT_LENGTH);

const htmlText = (value = '') => compact(value
  .replace(/<(?:script|style|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript)>/gi, ' ')
  .replace(/<\/(?:p|div|li|tr|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>'));

const pdfText = (buffer: Buffer) => {
  const raw = buffer.toString('latin1');
  return compact([
    ...raw.matchAll(/\((?:\\.|[^\\)]){2,}\)\s*Tj/g),
    ...raw.matchAll(/\[((?:\s*\((?:\\.|[^\\)])*\)\s*)+)\]\s*TJ/g),
  ].flatMap((match) => [...match[0].matchAll(/\((?:\\.|[^\\)])*\)/g)])
    .map((match) => match[0].slice(1, -1)
      .replace(/\\([nrtbf()\\])/g, (_all, code: string) => ({ n: '\n', r: '\r', t: '\t' }[code] || code))
      .replace(/\\([0-7]{1,3})/g, (_all, code: string) => String.fromCharCode(parseInt(code, 8))))
    .join(' '));
};

export const hasUsableText = (value = '') => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const chineseCount = (normalized.match(/[\u3400-\u9fff]/g) || []).length;
  return chineseCount >= 8 || normalized.length >= 160;
};

const baiduCredentials = (env: Record<string, string | undefined>) => ({
  apiKey: String(env.BAIDU_OCR_API_KEY || '').trim(),
  secretKey: String(env.BAIDU_OCR_SECRET_KEY || '').trim(),
});

const baiduToken = async (env: Record<string, string | undefined>, fetchImpl: typeof fetch) => {
  const { apiKey, secretKey } = baiduCredentials(env);
  if (!apiKey || !secretKey) throw new Error('云端百度 OCR 未配置');
  const key = `${apiKey}\u0000${secretKey}`;
  if (tokenCache?.key === key && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const url = new URL(BAIDU_TOKEN_URL);
  url.searchParams.set('grant_type', 'client_credentials');
  url.searchParams.set('client_id', apiKey);
  url.searchParams.set('client_secret', secretKey);
  const response = await fetchImpl(url, { method: 'POST' });
  const body = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || `百度 OCR 鉴权失败 (${response.status})`);
  tokenCache = {
    key,
    token: body.access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in || 2_592_000)) * 1_000,
  };
  return body.access_token;
};

const baiduOcr = async ({
  buffer,
  isPdf,
  env,
  fetchImpl,
}: {
  buffer: Buffer;
  isPdf: boolean;
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
}) => {
  const token = await baiduToken(env, fetchImpl);
  const encoded = buffer.toString('base64');
  const lines: string[] = [];
  const pageCount = isPdf ? Math.max(1, Math.min(6, Number(env.BAIDU_OCR_PDF_PAGES || 3))) : 1;
  for (let page = 1; page <= pageCount; page += 1) {
    const form = new URLSearchParams();
    form.set(isPdf ? 'pdf_file' : 'image', encoded);
    if (isPdf) form.set('pdf_file_num', String(page));
    form.set('detect_direction', 'true');
    const response = await fetchImpl(`${BAIDU_OCR_URL}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const body = await response.json() as { words_result?: Array<{ words?: string }>; error_msg?: string };
    if (!response.ok || body.error_msg) throw new Error(body.error_msg || `百度 OCR 识别失败 (${response.status})`);
    lines.push(...(body.words_result || []).map((item) => item.words || ''));
  }
  return compact(lines.join('\n'));
};

const readAttachment = async ({
  url,
  env,
  fetchImpl,
}: {
  url: string;
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
}): Promise<DocumentEvidence> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0' },
    });
    if (!response.ok) return { title: '公告附件', url, text: '', warning: `附件读取失败：HTTP ${response.status}` };
    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer()).subarray(0, MAX_DOCUMENT_BYTES);
    const marker = `${contentType} ${url}`.toLowerCase();
    const isPdf = /application\/pdf|\.pdf(?:$|[?#])/.test(marker);
    const isImage = /image\/|\.(?:png|jpe?g|bmp|tiff?)(?:$|[?#])/.test(marker);
    const extracted = isPdf ? pdfText(buffer) : /html|xml/.test(marker) ? htmlText(buffer.toString('utf8')) : compact(buffer.toString('utf8'));
    if (hasUsableText(extracted)) return { title: '公告附件', url, text: extracted, readMethod: 'PDF/附件文本' };
    if (!(isPdf || isImage)) return { title: '公告附件', url, text: '', warning: '附件未提取到可用正文' };
    if (!baiduCredentials(env).apiKey) return { title: '公告附件', url, text: '', warning: '扫描文档需要配置云端百度 OCR' };
    const text = await baiduOcr({ buffer, isPdf, env, fetchImpl });
    return hasUsableText(text)
      ? { title: '公告附件', url, text, readMethod: '百度 OCR' }
      : { title: '公告附件', url, text: '', warning: '百度 OCR 未识别到可用正文' };
  } catch (error) {
    return { title: '公告附件', url, text: '', warning: `附件读取失败：${error instanceof Error ? error.message : String(error)}` };
  } finally {
    clearTimeout(timer);
  }
};

export const readCandidateDocuments = async ({
  candidate,
  env = process.env,
  fetchImpl = fetch,
  maxDocuments = 2,
}: {
  candidate: TenderCandidate;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  maxDocuments?: number;
}): Promise<DocumentEvidence[]> => {
  const inline = candidate.raw_text.includes('【公告网页正文】')
    ? candidate.raw_text.split('【公告网页正文】').slice(1).join('【公告网页正文】').trim()
    : '';
  const evidence: DocumentEvidence[] = hasUsableText(inline)
    ? [{ title: '公告网页正文', url: candidate.url, text: inline, readMethod: '网页正文' }]
    : [];
  for (const url of [...new Set(candidate.attachments)].slice(0, maxDocuments)) {
    evidence.push(await readAttachment({ url, env, fetchImpl }));
  }
  return evidence;
};
