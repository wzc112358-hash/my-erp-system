import {
  canonicalizeUrl,
  decodeHtml,
  extractBuyer,
  extractDeadlineDate,
  hashParts,
  normalizeText,
} from './text.js';
import { buildProductVocabulary, findTermMatches } from './product-intelligence.js';
import { classifyChemicalRelevance } from './relevance.js';

const resolveUrl = (href, baseUrl) => {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
};

const GENERIC_NAV_TITLES = new Set([
  '招标公告',
  '资格预审公告',
  '非招标公告',
  '采购公告',
  '询价公告',
  '询比公告',
  '竞价公告',
  '变更公告',
  '中标公告',
  '成交公告',
  '终止公告',
  '澄清公告',
  '结果公告',
  '招标计划',
  '招标文件公示',
  '公告信息',
  '公告公示',
  '竞价旧版',
]);

const shouldSkipNoticeLink = (title, href, hasProductSignal) => {
  const compactTitle = title.replace(/[()\s（）]/g, '');
  const normalizedHref = normalizeText(decodeHtml(href));
  if (/\{\{|\}\}/.test(normalizedHref)) return true;
  if (/^(javascript:|#|void\(0\))/i.test(normalizedHref)) return true;
  if (GENERIC_NAV_TITLES.has(compactTitle)) return true;
  if (/^(更多|查看更多|more)$/i.test(compactTitle)) return true;
  if (title.length < 8 && !hasProductSignal) return true;
  return false;
};

const uniqueTerms = (terms) => terms.filter((term, index) => (
  index === terms.findIndex((item) => item.toLowerCase() === term.toLowerCase()) &&
  !terms.slice(0, index).some((existing) => existing.includes(term))
));

export const normalizeCandidate = (raw, options = {}) => {
  const title = normalizeText(raw.title);
  const content = normalizeText(raw.content || raw.rawText);
  const url = canonicalizeUrl(raw.url);
  const allText = `${title} ${content}`;
  const sourceName = normalizeText(raw.sourceName);
  const vocabulary = options.vocabulary || buildProductVocabulary(raw.sourceKeywords || options.sourceKeywords || '');
  const matched = findTermMatches(allText, vocabulary);
  const productKeywords = raw.productKeywords?.length
    ? raw.productKeywords
    : uniqueTerms(matched.matchedTerms.map((item) => item.term));

  return {
    sourceName,
    sourceId: raw.sourceId,
    ownerName: normalizeText(raw.ownerName),
    title,
    url,
    publishDate: raw.publishDate,
    deadlineDate: raw.deadlineDate || extractDeadlineDate(allText),
    buyerName: raw.buyerName || extractBuyer(allText),
    projectNumber: raw.projectNumber,
    productKeywords,
    sourceKeywords: raw.sourceKeywords || options.sourceKeywords || '',
    attachmentUrls: raw.attachmentUrls || [],
    rawText: content,
    fingerprint: hashParts([sourceName, url || title]),
  };
};

export const dedupeCandidates = (candidates) => {
  const seen = new Set();
  const output = [];

  for (const candidate of candidates) {
    const titleKey = `${candidate.sourceName}|${candidate.title}`;
    const urlKey = candidate.url ? `${candidate.sourceName}|${candidate.url}` : '';
    if (seen.has(candidate.fingerprint) || seen.has(titleKey) || (urlKey && seen.has(urlKey))) {
      continue;
    }
    seen.add(candidate.fingerprint);
    seen.add(titleKey);
    if (urlKey) seen.add(urlKey);
    output.push(candidate);
  }

  return output;
};

export const extractCandidatesFromHtml = (source, html) => {
  const candidates = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const vocabulary = buildProductVocabulary(source.keywords || '');
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const [, href, rawTitle] = match;
    const title = normalizeText(decodeHtml(rawTitle.replace(/<[^>]*>/g, ' ')));
    if (!title || title.length < 4) continue;
    const isNotice = /招标|采购|询价|询比|竞价|谈判|公告|询源|采办/.test(title);
    if (!isNotice) continue;
    const hasProductSignal = findTermMatches(title, vocabulary).matchedTerms.length > 0;
    if (shouldSkipNoticeLink(title, href, hasProductSignal)) continue;

    const url = resolveUrl(decodeHtml(href), source.source_url || '');
    candidates.push({
      sourceId: source.id,
      sourceName: source.source_name,
      ownerName: source.owner_name,
      title,
      url,
      content: title,
      sourceKeywords: source.keywords || '',
      deadlineDate: extractDeadlineDate(title),
    });
  }

  return candidates;
};

export const processCandidates = (rawCandidates, options = {}) => {
  const normalized = rawCandidates.map((candidate) => normalizeCandidate(candidate, options));
  return dedupeCandidates(normalized).map((candidate) => ({
    ...candidate,
    classification: classifyChemicalRelevance(candidate, options),
  }));
};

export const processCandidatesWithEnhancement = async (rawCandidates, options = {}) => {
  const normalized = rawCandidates.map((candidate) => normalizeCandidate(candidate, options));
  const deduped = dedupeCandidates(normalized);
  const classifierEnhancer = options.classifierEnhancer;
  const output = [];

  for (const candidate of deduped) {
    const ruleClassification = classifyChemicalRelevance(candidate, options);
    const enhanced = classifierEnhancer
      ? await classifierEnhancer(candidate, ruleClassification)
      : null;
    output.push({
      ...candidate,
      classification: enhanced || ruleClassification,
    });
  }

  return output;
};
