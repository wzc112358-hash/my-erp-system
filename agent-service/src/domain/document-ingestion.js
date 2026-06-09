import { normalizeCandidate } from './candidate.js';
import { classifyChemicalRelevance } from './relevance.js';
import {
  extractBuyer,
  extractDeadlineDate,
  hashParts,
  normalizeText,
} from './text.js';

export const normalizeDocumentText = (text = '') => normalizeText(text);

const extractBuyerFromLines = (text = '') => {
  const line = String(text)
    .split(/\n+/)
    .map((item) => normalizeText(item))
    .find((item) => /(?:采购单位|招标人|询价单位|采购人)[:：]/.test(item));
  return line ? extractBuyer(line) : extractBuyer(text);
};

export const buildDocumentCandidate = ({
  title = '人工补充资料',
  text = '',
  sourceName = '人工补资料',
  ownerName = '',
  url = '',
  sourceKeywords = '',
} = {}) => {
  const content = normalizeDocumentText(text);
  const candidate = normalizeCandidate({
    sourceName,
    ownerName,
    title: normalizeText(title) || '人工补充资料',
    url,
    content,
    rawText: content,
    sourceKeywords,
    deadlineDate: extractDeadlineDate(content),
    buyerName: extractBuyerFromLines(text),
  }, { sourceKeywords });
  return {
    ...candidate,
    content,
  };
};

export const extractDocumentInsight = (input = {}) => {
  const text = normalizeDocumentText(input.text || input.extractedText || '');
  if (!text) {
    return {
      extractionStatus: 'empty',
      candidate: null,
      classification: null,
      summary: '没有可解析文本，请补充公告正文、标书文字或上传可识别附件。',
      fingerprint: hashParts([input.title || 'empty-document', 'empty']),
    };
  }

  const candidate = buildDocumentCandidate({ ...input, text });
  const classification = classifyChemicalRelevance(candidate, {
    sourceKeywords: input.sourceKeywords || '',
  });

  return {
    extractionStatus: 'parsed',
    candidate,
    classification,
    summary: classification.summary,
    fingerprint: candidate.fingerprint,
    evidenceText: classification.evidenceText,
  };
};
