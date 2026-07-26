import type { TenderCandidate } from '../domain/collection.ts';
import { hasBaiduOcrCredentials, recognizeWithBaiduOcr } from './baidu-ocr.ts';

export type DocumentEvidence = {
  title: string;
  url: string;
  text: string;
  readMethod?: '网页正文' | 'PDF/附件文本' | '百度 OCR';
  ocrRequestCount?: number;
  ocrPageCount?: number;
  ocrDurationMs?: number;
  ocrCacheHit?: boolean;
  warning?: string;
};

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 24_000;

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
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_DOCUMENT_BYTES) {
      return { title: '公告附件', url, text: '', warning: '附件超过 8MB 安全读取上限，未发送到 OCR' };
    }
    const marker = `${contentType} ${url}`.toLowerCase();
    const isPdf = /application\/pdf|\.pdf(?:$|[?#])/.test(marker);
    const isImage = /image\/|\.(?:png|jpe?g|bmp|tiff?)(?:$|[?#])/.test(marker);
    const extracted = isPdf
      ? pdfText(buffer)
      : isImage
        ? ''
        : /html|xml/.test(marker)
          ? htmlText(buffer.toString('utf8'))
          : compact(buffer.toString('utf8'));
    if (hasUsableText(extracted)) return { title: '公告附件', url, text: extracted, readMethod: 'PDF/附件文本' };
    if (!(isPdf || isImage)) return { title: '公告附件', url, text: '', warning: '附件未提取到可用正文' };
    if (!hasBaiduOcrCredentials(env)) return { title: '公告附件', url, text: '', warning: '扫描文档需要配置云端百度 OCR' };
    const ocr = await recognizeWithBaiduOcr({ buffer, env, fetchImpl });
    return hasUsableText(ocr.text)
      ? {
        title: '公告附件',
        url,
        text: ocr.text,
        readMethod: '百度 OCR',
        ocrRequestCount: ocr.requestCount,
        ocrPageCount: ocr.pageCount,
        ocrDurationMs: ocr.durationMs,
        ocrCacheHit: ocr.cacheHit,
      }
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
