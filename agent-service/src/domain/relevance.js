import { evidenceAround, normalizeText } from './text.js';
import {
  buildProductVocabulary,
  findNegativeTerms,
  findTermMatches,
} from './product-intelligence.js';

export const CLASSIFICATION_VERSION = 'chemical-relevance-v1';

const includesAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const extractHardRequirements = (text) => {
  const normalized = normalizeText(text);
  const hardRequirements = [];
  const riskFlags = [];
  const producerOnly = /生产商|制造商|厂家/.test(normalized) && !/代理商可以|接受代理|允许代理/.test(normalized);
  const allowsAgency = /代理商可以|接受代理|允许代理/.test(normalized);

  if (producerOnly) {
    hardRequirements.push('疑似要求生产商投标');
    riskFlags.push('需确认是否允许代理商投标');
  }
  if (allowsAgency) {
    hardRequirements.push('允许代理商投标');
  }
  if (/第三方检测|检测报告/.test(normalized)) {
    hardRequirements.push('第三方检测');
    riskFlags.push('需第三方检测');
  }
  if (/8位码|八位码|中石油.*码|中石化.*码/.test(normalized)) {
    hardRequirements.push('中石油/中石化8位码');
    riskFlags.push('需8位码');
  }
  if (/危险品|危化品|危品/.test(normalized)) {
    hardRequirements.push('危化品资质');
    riskFlags.push('需核对危化品资质');
  }
  if (/业绩/.test(normalized)) {
    hardRequirements.push('业绩要求');
    riskFlags.push('需核对历史业绩');
  }

  return {
    hardRequirements,
    riskFlags,
    producerOnly,
    allowsAgency,
  };
};

const scoreForMatches = (matchedTerms) => {
  if (matchedTerms.length === 0) return 0;
  const strongest = Math.max(...matchedTerms.map((item) => item.weight));
  const sourceCount = new Set(matchedTerms.map((item) => item.source)).size;
  const bonus = Math.min(0.12, (matchedTerms.length - 1) * 0.04 + (sourceCount - 1) * 0.03);
  return Math.min(0.98, strongest + bonus);
};

export const classifyChemicalRelevance = (candidate, options = {}) => {
  const vocabulary = options.vocabulary || buildProductVocabulary(options.sourceKeywords || candidate.sourceKeywords || '');
  const title = normalizeText(candidate.title);
  const rawText = normalizeText(candidate.rawText || candidate.content || '');
  const allText = `${title} ${rawText}`;
  const { matchedTerms, matchedSources } = findTermMatches(allText, vocabulary);
  const negativeTerms = findNegativeTerms(allText);
  const hard = extractHardRequirements(allText);
  const relevanceScore = Number(scoreForMatches(matchedTerms).toFixed(2));
  const strongHistoryMatch = matchedSources.includes('erp_history') ||
    matchedSources.includes('chat_history') ||
    matchedSources.includes('curated') ||
    matchedSources.includes('source_config');
  const hasChemicalShape = matchedSources.includes('general_chemical');
  const hasOnlyNegativeSignal = matchedTerms.length === 0 && negativeTerms.length > 0;
  const hasNoProductSignal = matchedTerms.length === 0 && negativeTerms.length === 0;
  const hasOnlyWeakGeneralSignal = matchedTerms.length > 0 &&
    matchedSources.every((source) => source === 'general_chemical') &&
    !strongHistoryMatch;
  const weakGeneralServiceNotice = hasOnlyWeakGeneralSignal && negativeTerms.length > 0;

  let relevance = 'needs_manual_review';
  let needsHumanCheck = false;

  if (hasOnlyNegativeSignal || hasNoProductSignal || weakGeneralServiceNotice) {
    relevance = 'irrelevant';
  } else if (strongHistoryMatch || relevanceScore >= 0.74) {
    relevance = 'likely_related';
  } else if (hasChemicalShape || matchedTerms.length > 0) {
    relevance = 'needs_manual_review';
    needsHumanCheck = true;
  } else {
    relevance = 'needs_manual_review';
    needsHumanCheck = true;
  }

  if (negativeTerms.length > 0 && matchedTerms.length > 0 && relevance === 'likely_related') {
    relevance = 'needs_manual_review';
    needsHumanCheck = true;
  }

  const matchedTermNames = matchedTerms.map((item) => item.term);
  const evidenceTerm = matchedTermNames[0] || negativeTerms[0] || title;
  const productKeywords = matchedTermNames.filter((term, index) => (
    index === matchedTermNames.findIndex((item) => item.toLowerCase() === term.toLowerCase())
  ));
  const summaryParts = [];
  if (relevance === 'irrelevant' && productKeywords.length === 0) {
    summaryParts.push('未命中化工品/历史产品关键词');
  } else if (relevance === 'irrelevant' && productKeywords.length > 0) {
    summaryParts.push(`弱化工词命中但采购对象疑似非化工品：${productKeywords.slice(0, 6).join('、')}`);
  } else if (productKeywords.length) {
    summaryParts.push(`疑似产品：${productKeywords.slice(0, 6).join('、')}`);
  }
  if (candidate.deadlineDate) summaryParts.push(`截止：${candidate.deadlineDate}`);
  if (hard.hardRequirements.length) summaryParts.push(`硬性条件：${hard.hardRequirements.join('、')}`);
  if (negativeTerms.length && relevance !== 'irrelevant') summaryParts.push(`需人工复核：命中负向词 ${negativeTerms.join('、')}`);

  return {
    relevance,
    confidence: relevance === 'likely_related' ? Math.max(0.78, relevanceScore) : relevance === 'irrelevant' ? 0.7 : Math.max(0.45, relevanceScore),
    relevanceScore: (hasOnlyNegativeSignal || hasNoProductSignal || weakGeneralServiceNotice) ? 0.2 : relevanceScore,
    matchedTerms: productKeywords,
    matchedSources,
    evidenceText: evidenceAround(allText, evidenceTerm),
    negativeTerms,
    needsHumanCheck: needsHumanCheck || relevance === 'needs_manual_review',
    productKeywords,
    hardRequirements: hard.hardRequirements,
    riskFlags: hard.riskFlags,
    requiresAgencyAllowedCheck: hard.producerOnly && !hard.allowsAgency,
    requiresThirdPartyTest: hard.hardRequirements.includes('第三方检测'),
    requiresEightDigitCode: hard.hardRequirements.includes('中石油/中石化8位码'),
    requiresHazmatLicense: hard.hardRequirements.includes('危化品资质'),
    requiresPerformanceProof: hard.hardRequirements.includes('业绩要求'),
    summary: summaryParts.join('；') || '需人工判断是否为化工品商机',
    classificationVersion: CLASSIFICATION_VERSION,
  };
};

export const classifyOpportunity = classifyChemicalRelevance;
