import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

import type { BrowserObservation } from './types.ts';
import {
  recognizeDocumentWithOCR,
  type LocalOCRConfig,
  type OCRResult,
} from './ocr.ts';

export type DocumentLink = {
  title: string;
  url: string;
};

export type DocumentReadResult = {
  title: string;
  url?: string;
  filePath?: string;
  contentType?: string;
  text: string;
  ocrProvider?: OCRResult['provider'];
  warning?: string;
};

type FetchLike = typeof fetch;
type OCRRecognizer = typeof recognizeDocumentWithOCR;

const DOCUMENT_FILE_LINK_PATTERN = /\.(?:pdf|doc|docx|txt|xml)(?:[?#].*)?$/i;
const DOCUMENT_HTML_LINK_PATTERN = /\.html?(?:[?#].*)?$/i;
const DOCUMENT_TEXT_PATTERN = /附件|下载|标书|采购文件|招标文件|询价文件|技术文件|规格书/i;
const NAV_DOCUMENT_TEXT_PATTERN = /^(招标公告|资格预审公告|非招标公告|变更公告|候选人公示|中标公告|终止公告|招标计划|招标文件公示|公告信息|新闻动态|更多)$/i;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_TEXT = 24_000;

export const hasUsableDocumentText = (value = '') => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (/^%PDF-|\/FlateDecode|\b\d+\s+\d+\s+obj\b|endstream\b/.test(compact.slice(0, 4000))) return false;
  const cjk = (compact.match(/[\u3400-\u9fff]/g) || []).length;
  return cjk >= 8 || compact.length >= 160;
};

const uniqueBy = <T>(items: T[], keyFor: (item: T) => string) => (
  items.filter((item, index, all) => index === all.findIndex((other) => keyFor(other) === keyFor(item)))
);

const trimText = (value = '', limit = MAX_DOCUMENT_TEXT) => {
  const compact = value.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return compact.length > limit ? `${compact.slice(0, limit)}\n...[truncated]` : compact;
};

const normalizeUrl = (href = '', baseUrl = '') => {
  try {
    return new URL(href, baseUrl || undefined).toString();
  } catch {
    return href;
  }
};

const contentTypeForFile = (fileName = '') => {
  const extension = path.extname(fileName.split(/[?#]/)[0] || '').toLowerCase();
  return ({
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
  } as Record<string, string>)[extension] || '';
};

export const extractDocumentLinks = (observation: BrowserObservation): DocumentLink[] => uniqueBy(
  (observation.links || [])
    .filter((link) => {
      const label = (link.title || link.text || '').replace(/\s+/g, ' ').trim();
      const looksLikeDocumentText = DOCUMENT_TEXT_PATTERN.test(label) && !NAV_DOCUMENT_TEXT_PATTERN.test(label);
      return DOCUMENT_FILE_LINK_PATTERN.test(link.href) ||
        (DOCUMENT_HTML_LINK_PATTERN.test(link.href) && looksLikeDocumentText) ||
        looksLikeDocumentText;
    })
    .map((link) => ({
      title: (link.title || link.text || link.href || '附件').replace(/\s+/g, ' ').trim(),
      url: normalizeUrl(link.href, observation.url),
    }))
    .filter((link) => link.url),
  (link) => link.url,
);

const decodeEntities = (value = '') => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'");

const xmlToText = (value = '') => trimText(
  decodeEntities(value
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')),
);

const readUInt16 = (buffer: Buffer, offset: number) => buffer.readUInt16LE(offset);
const readUInt32 = (buffer: Buffer, offset: number) => buffer.readUInt32LE(offset);

const entriesFromZip = (buffer: Buffer) => {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (readUInt32(buffer, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return [];
  const totalEntries = readUInt16(buffer, eocd + 10);
  let centralOffset = readUInt32(buffer, eocd + 16);
  const entries: Array<{ name: string; data: Buffer }> = [];
  for (let index = 0; index < totalEntries; index += 1) {
    if (readUInt32(buffer, centralOffset) !== 0x02014b50) break;
    const compression = readUInt16(buffer, centralOffset + 10);
    const compressedSize = readUInt32(buffer, centralOffset + 20);
    const fileNameLength = readUInt16(buffer, centralOffset + 28);
    const extraLength = readUInt16(buffer, centralOffset + 30);
    const commentLength = readUInt16(buffer, centralOffset + 32);
    const localOffset = readUInt32(buffer, centralOffset + 42);
    const name = buffer.slice(centralOffset + 46, centralOffset + 46 + fileNameLength).toString('utf8');
    const localNameLength = readUInt16(buffer, localOffset + 26);
    const localExtraLength = readUInt16(buffer, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    const data = compression === 8
      ? zlib.inflateRawSync(compressed)
      : compression === 0
        ? compressed
        : Buffer.alloc(0);
    entries.push({ name, data });
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
};

const docxText = (buffer: Buffer) => {
  const entries = entriesFromZip(buffer);
  const document = entries.find((entry) => entry.name === 'word/document.xml');
  const headers = entries.filter((entry) => /^word\/(?:header|footer)\d+\.xml$/.test(entry.name));
  return trimText([document, ...headers]
    .filter(Boolean)
    .map((entry) => xmlToText(entry?.data.toString('utf8') || ''))
    .join('\n'));
};

const PDF_ESCAPE_MAP: Record<string, string> = {
    n: '\n',
    r: '\r',
    t: '\t',
    b: '\b',
    f: '\f',
    '(': '(',
    ')': ')',
    '\\': '\\',
};

const decodePdfString = (value = '') => value
  .replace(/\\([nrtbf()\\])/g, (_match, code: string) => PDF_ESCAPE_MAP[code] || code)
  .replace(/\\([0-7]{1,3})/g, (_match, code) => String.fromCharCode(parseInt(code, 8)));

const cjkCount = (value = '') => (value.match(/[\u4e00-\u9fa5]/g) || []).length;

const repairUtf8ReadAsLatin1 = (value = '') => {
  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  return cjkCount(repaired) > cjkCount(value) ? repaired : value;
};

const pdfText = (buffer: Buffer) => {
  const raw = buffer.toString('latin1');
  const textObjects = [
    ...[...raw.matchAll(/\((?:\\.|[^\\)]){2,}\)\s*Tj/g)].map((match) => match[0]),
    ...[...raw.matchAll(/\[((?:\s*\((?:\\.|[^\\)])*\)\s*)+)\]\s*TJ/g)].map((match) => match[0]),
  ];
  const extracted = textObjects
    .flatMap((item) => [...item.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((match) => match[0].slice(1, -1)))
    .map(decodePdfString)
    .join(' ');
  if (extracted.trim()) return trimText(repairUtf8ReadAsLatin1(extracted));
  return '';
};

const binaryWordText = (buffer: Buffer) => trimText(
  [
    ...buffer.toString('utf16le').matchAll(/[\u4e00-\u9fa5A-Za-z0-9，。；：、（）()\-_\s]{4,}/g),
    ...buffer.toString('latin1').matchAll(/[ -~]{8,}/g),
  ].map((match) => match[0]).join('\n'),
);

export const extractTextFromDocumentBuffer = ({
  buffer,
  fileName = '',
  contentType = '',
}: {
  buffer: Buffer;
  fileName?: string;
  contentType?: string;
}) => {
  const marker = `${fileName} ${contentType}`.toLowerCase();
  if (/image\/(?:png|jpe?g|bmp|tiff?)|\.(?:png|jpe?g|bmp|tiff?)\b/.test(marker)) return '';
  if (/\.docx\b|wordprocessingml|officedocument\.wordprocessingml/.test(marker)) return docxText(buffer);
  if (/\.pdf\b|application\/pdf/.test(marker)) return pdfText(buffer);
  if (/\.doc\b|msword/.test(marker)) return binaryWordText(buffer);
  if (/html|xml/.test(marker)) return xmlToText(buffer.toString('utf8'));
  return trimText(buffer.toString('utf8'));
};

const readLocalDocument = async ({
  filePath,
  fetchImpl,
  ocrConfig,
  ocrRecognizer,
}: {
  filePath: string;
  fetchImpl: FetchLike;
  ocrConfig?: LocalOCRConfig | null;
  ocrRecognizer: OCRRecognizer;
}): Promise<DocumentReadResult> => {
  const buffer = await fs.readFile(filePath);
  const contentType = contentTypeForFile(filePath);
  const extracted = extractTextFromDocumentBuffer({ buffer, fileName: filePath, contentType });
  const supportsOCR = /application\/pdf|image\//i.test(contentType);
  let ocr: OCRResult | null = null;
  let warning = '';
  if (supportsOCR && !hasUsableDocumentText(extracted) && ocrConfig?.enabled !== false && ocrConfig?.provider !== 'disabled') {
    try {
      ocr = await ocrRecognizer({
        buffer,
        fileName: filePath,
        contentType,
        pageCount: 1,
        config: ocrConfig,
        fetchImpl,
      });
    } catch (error) {
      warning = `OCR 识别失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return {
    title: path.basename(filePath),
    filePath,
    contentType,
    text: ocr?.text || extracted,
    ocrProvider: ocr?.provider,
    warning: warning || (!ocr && supportsOCR && !hasUsableDocumentText(extracted) ? '文档没有可用文本，需要启用 OCR。' : undefined),
  };
};

const isSiteShellHtml = (urlValue: string, contentType: string, buffer: Buffer) => {
  if (!/text\/html|application\/xhtml/i.test(contentType)) return false;
  let rootPath = false;
  try {
    const url = new URL(urlValue);
    rootPath = (url.pathname === '/' || url.pathname === '') && !url.search;
  } catch {
    // Invalid URLs are handled by the response content checks below.
  }
  const sample = buffer.subarray(0, 48_000).toString('utf8');
  const visibleText = sample
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const emptyAppShell = /<div[^>]+id=["']app["']/i.test(sample) && visibleText.length < 120;
  return rootPath || /doesn['’]t work properly without JavaScript/i.test(sample) || emptyAppShell;
};

const fetchDocument = async ({
  link,
  fetchImpl,
  ocrConfig,
  ocrRecognizer,
  pageCount = 1,
}: {
  link: DocumentLink;
  fetchImpl: FetchLike;
  ocrConfig?: LocalOCRConfig | null;
  ocrRecognizer: OCRRecognizer;
  pageCount?: number;
}): Promise<DocumentReadResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(link.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'HCZ-Local-Bidding-Agent/1.0',
      },
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      return {
        title: link.title,
        url: link.url,
        contentType,
        text: '',
        warning: `附件读取失败：${response.status}`,
      };
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer).subarray(0, MAX_DOCUMENT_BYTES);
    if (isSiteShellHtml(link.url, contentType, buffer)) {
      return {
        title: link.title,
        url: link.url,
        contentType,
        text: '',
        warning: '该链接返回的是站点页面，不是可识别的公告文档。',
      };
    }
    const extracted = extractTextFromDocumentBuffer({ buffer, fileName: link.url, contentType });
    let ocr: OCRResult | null = null;
    let warning = '';
    const supportsOCR = /application\/pdf|image\//i.test(contentType) || /\.(?:pdf|png|jpe?g|bmp|tiff?)(?:[?#].*)?$/i.test(link.url);
    if (supportsOCR && !hasUsableDocumentText(extracted) && ocrConfig?.enabled !== false && ocrConfig?.provider !== 'disabled') {
      try {
        ocr = await ocrRecognizer({
          buffer,
          fileName: link.url,
          contentType,
          pageCount,
          config: ocrConfig,
          fetchImpl,
        });
      } catch (error) {
        warning = `OCR 识别失败：${error instanceof Error ? error.message : String(error)}`;
      }
    }
    return {
      title: link.title,
      url: link.url,
      contentType,
      text: ocr?.text || extracted,
      ocrProvider: ocr?.provider,
      warning: warning || undefined,
    };
  } catch (error) {
    return {
      title: link.title,
      url: link.url,
      text: '',
      warning: `附件读取失败：${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
};

export const readDocumentsFromObservation = async ({
  observation,
  fetchImpl = fetch,
  maxDocuments = 3,
  ocrConfig = null,
  ocrRecognizer = recognizeDocumentWithOCR,
}: {
  observation: BrowserObservation;
  fetchImpl?: FetchLike;
  maxDocuments?: number;
  ocrConfig?: LocalOCRConfig | null;
  ocrRecognizer?: OCRRecognizer;
}): Promise<DocumentReadResult[]> => {
  const browserDocument = observation.document;
  const browserResults: DocumentReadResult[] = browserDocument?.text
    ? [{
      title: browserDocument.title || observation.title || '公告正文',
      url: browserDocument.pdfUrl,
      contentType: browserDocument.pdfUrl ? 'application/pdf' : undefined,
      text: trimText(browserDocument.text),
    }]
    : [];
  const localFiles = uniqueBy(observation.downloadedFiles || [], (item) => item)
    .slice(0, Math.max(0, maxDocuments - browserResults.length));
  const localResults = await Promise.all(localFiles.map((filePath) => readLocalDocument({
    filePath,
    fetchImpl,
    ocrConfig,
    ocrRecognizer,
  })
    .catch((error) => ({
      title: path.basename(filePath),
      filePath,
      text: '',
      warning: `本地附件读取失败：${error instanceof Error ? error.message : String(error)}`,
    }))));
  const remaining = Math.max(0, maxDocuments - browserResults.length - localResults.length);
  const browserLinks: DocumentLink[] = [
    ...(!browserResults.length && browserDocument?.pdfUrl
      ? [{ title: browserDocument.title || '公告 PDF', url: browserDocument.pdfUrl }]
      : []),
    ...(browserDocument?.attachmentUrls || []).map((url, index) => ({
      title: `公告附件 ${index + 1}`,
      url,
    })),
  ];
  const links = uniqueBy([...browserLinks, ...extractDocumentLinks(observation)], (link) => link.url)
    .slice(0, remaining);
  const remoteResults = await Promise.all(links.map((link) => fetchDocument({
    link,
    fetchImpl,
    ocrConfig,
    ocrRecognizer,
    pageCount: browserDocument?.pageCount || 1,
  })));
  return [...browserResults, ...localResults, ...remoteResults];
};

export const formatDocumentEvidence = (documents: DocumentReadResult[]) => documents
  .map((document, index) => [
    `附件 ${index + 1}：${document.title}`,
    document.url ? `链接：${document.url}` : '',
    document.filePath ? `本地文件：${document.filePath}` : '',
    document.warning ? `提示：${document.warning}` : '',
    document.ocrProvider ? `识别方式：${document.ocrProvider === 'baidu' ? '百度 OCR' : 'PaddleOCR'}` : '',
    document.text ? `文本：${trimText(document.text, 6000)}` : '',
  ].filter(Boolean).join('\n'))
  .join('\n\n');
