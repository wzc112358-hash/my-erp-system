import {
  decodeHtml,
  extractBuyer,
  extractDeadlineDate,
  normalizeText,
} from './text.js';

const stripTags = (html = '') => normalizeText(
  decodeHtml(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|table)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')),
);

const htmlToLines = (html = '') => decodeHtml(String(html)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|table)>/gi, '\n')
  .replace(/<[^>]*>/g, ' '))
  .split(/\n+/)
  .map((line) => normalizeText(line))
  .filter(Boolean);

const normalizeDateParts = (year, month, day) => {
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const extractPublishDate = (text = '') => {
  const normalized = normalizeText(text);
  const iso = normalized.match(/(?:发布时间|发布日期|公告日期|发售时间)[:：\s]*(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (iso) return normalizeDateParts(iso[1], iso[2], iso[3]);
  return '';
};

export const extractProjectNumber = (text = '') => {
  const normalized = normalizeText(text);
  const match = normalized.match(/(?:项目编号|招标编号|采购编号|询价单号|项目代码)[:：\s]*([A-Za-z0-9][A-Za-z0-9\-_/（）()]{3,})/);
  return match ? match[1].replace(/[，。,；;]+$/, '') : '';
};

const resolveUrl = (href, baseUrl) => {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
};

const isAttachmentHref = (href = '', title = '') => {
  const normalized = `${href} ${title}`.toLowerCase();
  return /\.(pdf|doc|docx|xls|xlsx|zip|rar|7z)(?:[?#].*)?$/.test(normalized) ||
    /附件|招标文件|采购文件|技术规范|技术要求|标书|询价单/.test(title);
};

export const extractAttachmentUrls = (baseUrl, html = '') => {
  const attachments = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const [, rawHref, rawTitle] = match;
    const href = decodeHtml(rawHref).trim();
    const title = normalizeText(decodeHtml(rawTitle.replace(/<[^>]*>/g, ' ')));
    if (!href || /\{\{|\}\}|^(javascript:|#)/i.test(href)) continue;
    if (!isAttachmentHref(href, title)) continue;
    const url = resolveUrl(href, baseUrl);
    if (!seen.has(url)) {
      seen.add(url);
      attachments.push(url);
    }
  }

  return attachments;
};

export const extractDetailFromHtml = (url, html = '') => {
  const rawText = stripTags(html);
  const lines = htmlToLines(html);
  const lineText = lines.join('\n');
  return {
    rawText,
    publishDate: extractPublishDate(lineText) || extractPublishDate(rawText),
    deadlineDate: extractDeadlineDate(lineText) || extractDeadlineDate(rawText),
    buyerName: extractBuyer(lineText) || extractBuyer(rawText),
    projectNumber: extractProjectNumber(lineText) || extractProjectNumber(rawText),
    attachmentUrls: extractAttachmentUrls(url, html),
  };
};

export const enrichCandidateWithDetail = (candidate, html = '') => {
  const detail = extractDetailFromHtml(candidate.url || '', html);
  const contentParts = [candidate.content, detail.rawText].filter(Boolean);
  const attachmentUrls = [
    ...(candidate.attachmentUrls || []),
    ...detail.attachmentUrls,
  ].filter((url, index, list) => index === list.findIndex((item) => item === url));

  return {
    ...candidate,
    content: contentParts.join('\n'),
    publishDate: candidate.publishDate || detail.publishDate,
    deadlineDate: candidate.deadlineDate || detail.deadlineDate,
    buyerName: candidate.buyerName || detail.buyerName,
    projectNumber: candidate.projectNumber || detail.projectNumber,
    attachmentUrls,
  };
};
