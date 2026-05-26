const RELEVANCE_VALUES = new Set(['likely_related', 'needs_manual_review', 'irrelevant']);

const normalizeServiceUrl = (value = '') => String(value || '').replace(/\/+$/, '');

const asArray = (value) => {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,，、\n]+/).map((item) => item.trim()).filter(Boolean);
  return [];
};

const clamp01 = (value, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
};

export const buildLlmClassifierPayload = (candidate, ruleClassification) => ({
  task: 'classify_bid_opportunity',
  language: 'zh-CN',
  allowed_relevance: ['likely_related', 'needs_manual_review', 'irrelevant'],
  candidate: {
    source_name: candidate.sourceName || '',
    owner_name: candidate.ownerName || '',
    title: candidate.title || '',
    url: candidate.url || '',
    buyer_name: candidate.buyerName || '',
    deadline_date: candidate.deadlineDate || '',
    raw_text: candidate.rawText || '',
  },
  rule_classification: {
    relevance: ruleClassification.relevance,
    relevance_score: ruleClassification.relevanceScore,
    confidence: ruleClassification.confidence,
    matched_terms: ruleClassification.matchedTerms || [],
    matched_sources: ruleClassification.matchedSources || [],
    evidence_text: ruleClassification.evidenceText || '',
    negative_terms: ruleClassification.negativeTerms || [],
    product_keywords: ruleClassification.productKeywords || [],
    hard_requirements: ruleClassification.hardRequirements || [],
    risk_flags: ruleClassification.riskFlags || [],
    summary: ruleClassification.summary || '',
  },
  instructions: [
    '判断公告采购对象是否属于化工品、化工助剂、油田助剂、水处理药剂或公司历史常做产品。',
    '只返回 JSON，不要返回自然语言段落。',
    '不要自动决定是否投标，只判断相关性、疑似产品和硬性条件。',
  ],
});

export const normalizeLlmClassification = (response, fallbackClassification) => {
  const relevance = String(response?.relevance || '');
  if (!RELEVANCE_VALUES.has(relevance)) {
    throw new Error(`invalid LLM relevance: ${relevance}`);
  }
  const relevanceScore = clamp01(response.relevance_score ?? response.relevanceScore, fallbackClassification.relevanceScore);
  const confidence = clamp01(response.confidence, fallbackClassification.confidence);
  const productKeywords = asArray(response.product_keywords ?? response.productKeywords);
  const hardRequirements = asArray(response.hard_requirements ?? response.hardRequirements);
  const riskFlags = asArray(response.risk_flags ?? response.riskFlags);
  const evidenceText = String(response.evidence_text ?? response.evidenceText ?? fallbackClassification.evidenceText ?? '');
  const summary = String(response.summary || fallbackClassification.summary || 'LLM 已完成相关性复核');

  return {
    ...fallbackClassification,
    relevance,
    confidence,
    relevanceScore,
    matchedTerms: productKeywords.length ? productKeywords : fallbackClassification.matchedTerms,
    matchedSources: [...new Set([...(fallbackClassification.matchedSources || []), 'llm'])],
    evidenceText,
    needsHumanCheck: Boolean(response.needs_human_check ?? response.needsHumanCheck ?? relevance === 'needs_manual_review'),
    productKeywords: productKeywords.length ? productKeywords : fallbackClassification.productKeywords,
    hardRequirements: hardRequirements.length ? hardRequirements : fallbackClassification.hardRequirements,
    riskFlags: riskFlags.length ? riskFlags : fallbackClassification.riskFlags,
    summary,
    classificationVersion: `${fallbackClassification.classificationVersion}+llm`,
  };
};

export const classifyWithLlm = async (candidate, ruleClassification, {
  llmClassifierUrl = process.env.LLM_CLASSIFIER_URL || '',
  fetchImpl = fetch,
} = {}) => {
  const baseUrl = normalizeServiceUrl(llmClassifierUrl);
  if (!baseUrl) return null;
  try {
    const response = await fetchImpl(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildLlmClassifierPayload(candidate, ruleClassification)),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM classifier ${response.status} ${response.statusText}: ${text}`);
    }
    const body = await response.json();
    return normalizeLlmClassification(body, ruleClassification);
  } catch {
    return null;
  }
};
