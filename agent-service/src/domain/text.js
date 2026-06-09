import crypto from 'node:crypto';

export const normalizeText = (value = '') => String(value).replace(/\s+/g, ' ').trim();

export const decodeHtml = (value = '') => String(value)
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'");

export const canonicalizeUrl = (url = '') => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return String(url).split('#')[0].split('?')[0];
  }
};

export const extractDeadlineDate = (text = '') => {
  const normalized = normalizeText(text);
  const match = normalized.match(/(?:截止|截⽌|开标|投标截止|报名截止|报价截止)(?:日期|时间)?[:：]?\s*(20\d{2})[./\-年](\d{1,2})[./\-月⽉](\d{1,2})/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

export const extractBuyer = (text = '') => {
  const match = String(text).match(/(?:采购单位|招标人|询价单位|采购人)[:：]\s*([^。；;\n]+)/);
  return match ? normalizeText(match[1]).slice(0, 80) : undefined;
};

export const hashParts = (parts) => crypto
  .createHash('sha256')
  .update(parts.filter(Boolean).join('|'))
  .digest('hex');

export const evidenceAround = (text = '', term = '', radius = 42) => {
  const normalized = normalizeText(text);
  if (!normalized) return '';
  if (!term) return normalized.slice(0, radius * 2);
  const index = normalized.indexOf(term);
  if (index < 0) return normalized.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(normalized.length, index + term.length + radius);
  return normalized.slice(start, end);
};
