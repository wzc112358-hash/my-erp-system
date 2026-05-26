export {
  canonicalizeUrl,
  decodeHtml,
  evidenceAround,
  extractBuyer,
  extractDeadlineDate,
  hashParts,
  normalizeText,
} from './domain/text.js';

export {
  buildProductVocabulary,
  CHAT_HISTORY_TERMS,
  CURATED_PRODUCT_TERMS,
  ERP_HISTORY_TERMS,
  GENERAL_CHEMICAL_TERMS,
  NEGATIVE_TERMS,
  findNegativeTerms,
  findTermMatches,
} from './domain/product-intelligence.js';

export {
  CLASSIFICATION_VERSION,
  classifyChemicalRelevance,
  classifyOpportunity,
} from './domain/relevance.js';

export {
  dedupeCandidates,
  extractCandidatesFromHtml,
  normalizeCandidate,
  processCandidatesWithEnhancement,
  processCandidates,
} from './domain/candidate.js';

export {
  buildGroupSummary,
} from './domain/summary.js';
