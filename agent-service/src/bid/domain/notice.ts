import { createHash } from 'node:crypto';

import type { BidBusinessAssessment, QualificationCheck } from './tender-screening.ts';

export type BidNoticeKind = 'current' | 'attention';

export type BidNoticeInput = {
  sourceKey: string;
  sourceName: string;
  externalId?: string;
  kind: BidNoticeKind;
  title: string;
  url: string;
  buyerName?: string;
  publishedAt?: string;
  deadlineAt?: string;
  matchedProducts?: string[];
  judgment?: string;
  requirements?: string[];
  missingInfo?: string[];
  evidence?: string;
  detailReadMethod?: string;
  attachmentUrls?: string[];
  assessment?: BidBusinessAssessment;
};

export type NormalizedBidNotice = BidNoticeInput & {
  canonicalUrl: string;
  fingerprint: string;
  contentHash: string;
};

const normalizeSpace = (value = '') => String(value || '')
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .trim();

const volatileQueryKey = /^(?:utm_.+|spm|from|keyword|search|inpvalue|callback|timestamp|_t|t|token|sign|signature|expires?)$/i;
const identityQueryKey = /^(?:id|uuid|noticeid|tradeid|projectid|businessannouncementid|articleid)$/i;

export const canonicalizeNoticeUrl = (value = '') => {
  const input = normalizeSpace(value);
  if (!input) return '';
  try {
    const url = new URL(input);
    url.hostname = url.hostname.toLowerCase();
    url.hash = url.hash && /(?:uuid|id|detail|notice|bulletin)/i.test(url.hash) ? url.hash : '';
    for (const key of [...url.searchParams.keys()]) {
      if (volatileQueryKey.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return url.toString();
  } catch {
    return input.replace(/#$/, '').replace(/\/$/, '');
  }
};

const externalIdFromUrl = (value = '') => {
  try {
    const url = new URL(value);
    for (const [key, item] of url.searchParams.entries()) {
      if (identityQueryKey.test(key) && normalizeSpace(item)) return normalizeSpace(item).toLowerCase();
    }
    const combined = `${url.pathname}${url.hash}`;
    const uuid = combined.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0];
    if (uuid) return uuid.toLowerCase();
    const lastPathPart = url.pathname.split('/').filter(Boolean).at(-1)?.replace(/\.(?:html?|pdf)$/i, '');
    return lastPathPart && /[a-z0-9_-]{8,}/i.test(lastPathPart) ? lastPathPart.toLowerCase() : '';
  } catch {
    return '';
  }
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const sortedUnique = (items: string[] = []) => [...new Set(items.map(normalizeSpace).filter(Boolean))].sort();

const normalizeQualificationChecks = (items: QualificationCheck[] = []) => items
  .map((item) => {
    const requirement = normalizeSpace(item.requirement);
    const basis = normalizeSpace(item.basis);
    let status = item.status;
    const explicitManufacturerConflict = /制造商|生产商|原厂/.test(requirement)
      && /公告.{0,20}(?:必须|要求|仅限|只接受).{0,12}(?:制造商|生产商|原厂)|投标人.{0,12}(?:须|应)为.{0,8}(?:制造商|生产商|原厂)/.test(basis);
    if (status === 'not_met' && !explicitManufacturerConflict && (
      /通常|惯例|倾向|暗示|可能|推测|未提供|未披露|未指明/.test(basis)
      || /我司|公司.{0,8}(?:无|没有|不具备|非)|超出能力|无法满足/.test(basis)
    )) status = 'unconfirmed';
    if (status === 'met' && (!basis || /未提供|未披露|未指明|待确认|可能/.test(basis))) {
      status = 'unconfirmed';
    }
    return { requirement, status, basis };
  })
  .filter((item) => item.requirement)
  .slice(0, 8);

const normalizeQuantity = (value: string | undefined) => {
  const text = normalizeSpace(value);
  const hasMeasuredQuantity = /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万]+)\s*(?:万?吨|千克|公斤|kg|桶|袋|箱|批|套)/i
    .test(text);
  return hasMeasuredQuantity ? text.slice(0, 200) : '';
};

export const normalizeBusinessAssessment = (
  assessment: BidBusinessAssessment | undefined,
): BidBusinessAssessment | undefined => {
  if (!assessment) return undefined;
  const qualificationChecks = normalizeQualificationChecks(assessment.qualificationChecks);
  const proposedDecision = ['likely_can_do', 'needs_manual_check', 'likely_cannot_do'].includes(assessment.decision)
    ? assessment.decision
    : 'needs_manual_check';
  const originalSummary = normalizeSpace(assessment.decisionSummary);
  const closedOpportunity = /已无参与机会|项目已结束|项目已截止|仅保留.{0,12}(?:参考|信息)/.test(originalSummary);
  const hasExplicitBlocker = qualificationChecks.some((item) => item.status === 'not_met');
  const hasUnconfirmed = qualificationChecks.some((item) => item.status === 'unconfirmed');
  const hasConfirmedFit = qualificationChecks.some((item) => item.status === 'met');
  const decision = proposedDecision === 'likely_cannot_do' && !closedOpportunity && !hasExplicitBlocker
    ? 'needs_manual_check'
    : proposedDecision === 'likely_can_do' && (hasUnconfirmed || hasExplicitBlocker || !hasConfirmedFit)
      ? 'needs_manual_check'
      : proposedDecision;
  const decisionSummary = decision === proposedDecision
    ? originalSummary
    : '产品具有业务机会，但技术指标或投标资格缺少公司侧证明，需要逐项确认后再决定。';
  return {
    decision,
    decisionSummary,
    productSummary: normalizeSpace(assessment.productSummary),
    quantity: normalizeQuantity(assessment.quantity),
    specifications: sortedUnique(assessment.specifications).slice(0, 8),
    deliveryTerms: sortedUnique(assessment.deliveryTerms).slice(0, 8),
    commercialTerms: sortedUnique(assessment.commercialTerms).slice(0, 8),
    qualificationChecks,
    historicalReferences: sortedUnique(assessment.historicalReferences).slice(0, 8),
    nextActions: sortedUnique(assessment.nextActions).slice(0, 8),
  };
};

export const normalizeBidNotice = (input: BidNoticeInput): NormalizedBidNotice => {
  const sourceKey = normalizeSpace(input.sourceKey).toLowerCase();
  const sourceName = normalizeSpace(input.sourceName);
  const title = normalizeSpace(input.title);
  const url = normalizeSpace(input.url);
  const canonicalUrl = canonicalizeNoticeUrl(url);
  const externalId = normalizeSpace(input.externalId || externalIdFromUrl(canonicalUrl)).toLowerCase();
  const buyerName = normalizeSpace(input.buyerName);
  const publishedAt = normalizeSpace(input.publishedAt);
  const deadlineAt = normalizeSpace(input.deadlineAt);
  const matchedProducts = sortedUnique(input.matchedProducts);
  const requirements = sortedUnique(input.requirements);
  const missingInfo = sortedUnique(input.missingInfo);
  const attachmentUrls = sortedUnique(input.attachmentUrls).map(canonicalizeNoticeUrl);
  const assessment = normalizeBusinessAssessment(input.assessment);
  const judgment = assessment?.decisionSummary || normalizeSpace(input.judgment);
  const fallbackIdentity = [title.toLowerCase(), buyerName.toLowerCase(), publishedAt.slice(0, 10)].join('|');
  const fingerprint = sha256(`${sourceKey}|${externalId || fallbackIdentity}`);
  const contentHash = sha256(JSON.stringify({
    kind: input.kind,
    title,
    buyerName,
    publishedAt,
    deadlineAt,
    matchedProducts,
    judgment,
    requirements,
    missingInfo,
    evidence: normalizeSpace(input.evidence),
    detailReadMethod: normalizeSpace(input.detailReadMethod),
    attachmentUrls,
    assessment,
  }));

  return {
    ...input,
    sourceKey,
    sourceName,
    externalId,
    title,
    url,
    canonicalUrl,
    buyerName,
    publishedAt,
    deadlineAt,
    matchedProducts,
    judgment,
    requirements,
    missingInfo,
    evidence: normalizeSpace(input.evidence),
    detailReadMethod: normalizeSpace(input.detailReadMethod),
    attachmentUrls,
    assessment,
    fingerprint,
    contentHash,
  };
};
