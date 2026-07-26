import type { BidNoticeInput } from '../domain/notice.ts';
import type { CandidateBundle, TenderCandidate } from '../domain/collection.ts';
import { buildScreenedNotices } from '../domain/tender-screening.ts';
import { assessScreenedNotices, type BidAssessor } from '../llm/bid-assessor.ts';
import { definitionFor, taskForSite } from '../sites/registry.ts';
import { screenedNoticeToInput } from './collection-report.ts';

type LocalHelperReportItem = Record<string, unknown>;

type LocalHelperReport = Record<string, unknown> & {
  sourceName?: unknown;
  items?: unknown;
  intelligenceItems?: unknown;
};

const textArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const reportItems = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is LocalHelperReportItem => Boolean(item) && typeof item === 'object')
  : [];

const candidateFrom = (item: LocalHelperReportItem, kind: 'current' | 'attention'): TenderCandidate => ({
  title: String(item.title || '').trim(),
  url: String(item.url || '').trim(),
  buyer_name: String(item.buyerName || '').trim(),
  published_at: String(item.publishedAt || '').trim(),
  deadline_at: String(item.deadlineAt || '').trim(),
  opportunity_status: kind === 'attention' ? 'ended' : 'active',
  raw_text: [
    String(item.rawText || '').trim(),
    String(item.evidence || '').trim(),
    textArray(item.matchedProducts).length ? `本地命中产品：${textArray(item.matchedProducts).join('、')}` : '',
  ].filter(Boolean).join('\n').slice(0, 30_000),
  attachments: textArray(item.attachmentUrls).slice(0, 10),
});

const deadlineTimestamp = (value: string) => {
  if (!value) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59+08:00` : value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const assessLocalHelperReport = async ({
  report,
  assessor,
  now = Date.now(),
}: {
  report: LocalHelperReport;
  assessor: BidAssessor;
  now?: number;
}): Promise<{
  sourceKey: string;
  sourceName: string;
  notices: BidNoticeInput[];
  assessedCount: number;
  ignoredCount: number;
}> => {
  const sourceName = String(report.sourceName || '').trim();
  const site = definitionFor(sourceName);
  const entries = [
    ...reportItems(report.items).map((item) => ({ item, kind: 'current' as const })),
    ...reportItems(report.intelligenceItems).map((item) => ({ item, kind: 'attention' as const })),
  ].filter(({ item }) => item.title && item.url).slice(0, 100);
  if (!entries.length) {
    return { sourceKey: site.sourceKey, sourceName: site.sourceName, notices: [], assessedCount: 0, ignoredCount: 0 };
  }

  const task = taskForSite(site);
  const bundle: CandidateBundle = {
    source_name: site.sourceName,
    candidates: entries.map(({ item, kind }) => candidateFrom(item, kind)),
  };
  const assessed = await assessScreenedNotices({
    task,
    bundle,
    cards: buildScreenedNotices({ task, bundle }),
    assessor,
    mode: 'detail',
  });
  const notices: BidNoticeInput[] = [];
  for (const [index, card] of assessed.entries()) {
    const entry = entries[index];
    if (!entry) continue;
    const relevant = ['known_product', 'potential_product'].includes(card.businessRelevance || '')
      || card.recommendedAction !== 'ignore';
    if (!relevant) continue;
    const deadline = deadlineTimestamp(card.deadlineAt);
    const inactive = entry.kind === 'attention'
      || card.sourceOpportunityStatus === 'ended'
      || card.recommendedAction === 'ignore'
      || (deadline !== null && deadline < now);
    const input = screenedNoticeToInput(site.sourceKey, card, inactive ? 'attention' : 'current');
    notices.push({
      ...input,
      sourceName: site.sourceName,
      detailReadMethod: String(entry.item.detailReadMethod || input.detailReadMethod || ''),
      attachmentUrls: textArray(entry.item.attachmentUrls).slice(0, 10),
    });
  }
  return {
    sourceKey: site.sourceKey,
    sourceName: site.sourceName,
    notices,
    assessedCount: assessed.length,
    ignoredCount: assessed.length - notices.length,
  };
};
