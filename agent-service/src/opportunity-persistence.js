const urgencyFor = (deadlineDate) => {
  if (!deadlineDate) return 'unknown';
  const days = Math.ceil((new Date(`${deadlineDate}T23:59:59+08:00`).getTime() - Date.now()) / 86400000);
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'soon';
  return 'normal';
};

export const buildOpportunityPayload = (source, run, item) => {
  const classification = item.classification;
  return {
    source: source.id,
    monitor_run: run.id,
    source_name: item.sourceName,
    owner_name: item.ownerName,
    title: item.title,
    url: item.url,
    fingerprint: item.fingerprint,
    publish_date: item.publishDate || '',
    deadline_date: item.deadlineDate || '',
    buyer_name: item.buyerName || '',
    product_keywords: classification.productKeywords.join(','),
    relevance: classification.relevance,
    relevance_score: classification.relevanceScore,
    matched_terms: classification.matchedTerms.join(','),
    matched_sources: classification.matchedSources.join(','),
    evidence_text: classification.evidenceText,
    negative_terms: classification.negativeTerms.join(','),
    classification_version: classification.classificationVersion,
    needs_human_check: classification.needsHumanCheck,
    status: 'pending_review',
    urgency: urgencyFor(item.deadlineDate),
    agent_summary: classification.summary,
    hard_requirements: classification.hardRequirements.join(','),
    risk_flags: classification.riskFlags.join(','),
    attachment_urls: item.attachmentUrls.join('\n'),
    raw_text: item.rawText,
  };
};

export const shouldPersistOpportunity = (item) => (
  ['likely_related', 'needs_manual_review'].includes(item.classification?.relevance)
);
