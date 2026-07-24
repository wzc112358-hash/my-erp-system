import { createHash } from 'node:crypto';

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
  const fallbackIdentity = [title.toLowerCase(), buyerName.toLowerCase(), publishedAt.slice(0, 10)].join('|');
  const fingerprint = sha256(`${sourceKey}|${externalId || fallbackIdentity}`);
  const contentHash = sha256(JSON.stringify({
    kind: input.kind,
    title,
    buyerName,
    publishedAt,
    deadlineAt,
    matchedProducts,
    judgment: normalizeSpace(input.judgment),
    requirements,
    missingInfo,
    evidence: normalizeSpace(input.evidence),
    detailReadMethod: normalizeSpace(input.detailReadMethod),
    attachmentUrls,
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
    judgment: normalizeSpace(input.judgment),
    requirements,
    missingInfo,
    evidence: normalizeSpace(input.evidence),
    detailReadMethod: normalizeSpace(input.detailReadMethod),
    attachmentUrls,
    fingerprint,
    contentHash,
  };
};

