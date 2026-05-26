const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

export const summarizeDocumentsForPackage = (documents = []) => documents
  .map((doc) => {
    const title = compact(doc.title || '补充资料');
    const summary = compact(doc.parse_summary || doc.summary || doc.evidence_text || '');
    return summary ? `${title}：${summary}` : title;
  })
  .filter(Boolean)
  .join('\n');

export const recommendNextAction = (opportunity = {}) => {
  if (opportunity.status === 'needs_documents') return '需先补齐标书/附件，再提交王总判断';
  if (compact(opportunity.hard_requirements) || compact(opportunity.risk_flags)) {
    return '建议王总判断是否推进报价，并同步核对硬性条件';
  }
  return '信息较完整，可进入王总确认';
};

const summarizeReviews = (reviews = []) => reviews
  .map((review) => {
    const role = review.review_type === 'boss' ? '王总' : '员工';
    const comment = compact(review.comment || '');
    return `${role} ${review.decision || ''}${comment ? `：${comment}` : ''}`;
  })
  .filter(Boolean)
  .join('\n');

export const buildConfirmationPackage = ({
  opportunity = {},
  documents = [],
  reviews = [],
} = {}) => {
  const documentSummary = summarizeDocumentsForPackage(documents);
  const reviewSummary = summarizeReviews(reviews);
  const nextAction = recommendNextAction(opportunity);
  const lines = [
    `商机：${compact(opportunity.title) || '-'}`,
    `来源：${compact(opportunity.source_name) || '-'} / ${compact(opportunity.owner_name) || '-'}`,
    `采购单位：${compact(opportunity.buyer_name) || '-'}`,
    `截止日期：${compact(opportunity.deadline_date) || '-'}`,
    `产品关键词：${compact(opportunity.product_keywords) || '-'}`,
    `Agent证据：${compact(opportunity.evidence_text || opportunity.agent_summary) || '-'}`,
    `硬性条件：${compact(opportunity.hard_requirements) || '-'}`,
    `风险点：${compact(opportunity.risk_flags) || '-'}`,
    `员工自评：${compact(opportunity.employee_assessment) || '-'}`,
    `补充资料：${documentSummary || '-'}`,
    `历史判断：${reviewSummary || '-'}`,
    `建议动作：${nextAction}`,
  ];

  return {
    title: opportunity.title || '',
    buyer: opportunity.buyer_name || '',
    deadline: opportunity.deadline_date || '',
    product_keywords: opportunity.product_keywords || '',
    document_summary: documentSummary,
    review_summary: reviewSummary,
    recommended_action: nextAction,
    package_text: lines.join('\n'),
  };
};
