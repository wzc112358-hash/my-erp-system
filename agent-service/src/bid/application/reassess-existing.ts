import { screenedNoticeToInput } from './collection-report.ts';
import { normalizeBidNotice, normalizeBusinessAssessment } from '../domain/notice.ts';
import type { BidBusinessAssessment } from '../domain/tender-screening.ts';
import type { CandidateBundle, TenderCandidate } from '../domain/collection.ts';
import { buildScreenedNotices } from '../domain/tender-screening.ts';
import { assessScreenedNotices, createDefaultBidAssessor } from '../llm/bid-assessor.ts';
import { PocketBaseBidNoticeRepository } from '../infrastructure/pocketbase-repository.ts';
import type { PocketBaseClient, PocketBaseRecord } from '../infrastructure/pocketbase-client.ts';
import { BID_SITES, taskForSite } from '../sites/registry.ts';

type NoticeRecord = PocketBaseRecord & Record<string, unknown>;

const parseArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const hasAssessment = (record: NoticeRecord) => {
  try {
    const parsed = JSON.parse(String(record.assessment || 'null'));
    return Boolean(parsed?.decisionSummary);
  } catch {
    return false;
  }
};

const assessmentFrom = (record: NoticeRecord) => {
  try {
    return normalizeBusinessAssessment(JSON.parse(String(record.assessment || 'null')) as BidBusinessAssessment);
  } catch {
    return undefined;
  }
};

const rawAssessmentFrom = (record: NoticeRecord) => {
  try {
    const parsed = JSON.parse(String(record.assessment || 'null'));
    return parsed && typeof parsed === 'object' ? parsed as BidBusinessAssessment : undefined;
  } catch {
    return undefined;
  }
};

const candidateFrom = (record: NoticeRecord): TenderCandidate => {
  const matchedProducts = parseArray(record.matched_products);
  const requirements = parseArray(record.requirements);
  const missingInfo = parseArray(record.missing_info);
  return {
    title: String(record.title || ''),
    url: String(record.url || ''),
    buyer_name: String(record.buyer_name || ''),
    published_at: String(record.published_at || ''),
    deadline_at: String(record.deadline_at || ''),
    opportunity_status: record.kind === 'attention' ? 'ended' : 'active',
    raw_text: [
      matchedProducts.length ? `已匹配产品：${matchedProducts.join('、')}` : '',
      String(record.evidence || ''),
      requirements.length ? `公告要求与风险：${requirements.join('；')}` : '',
      missingInfo.length ? `原待确认项：${missingInfo.join('；')}` : '',
    ].filter(Boolean).join('\n'),
    attachments: parseArray(record.attachment_urls),
  };
};

const dateTimestamp = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59+08:00` : raw);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const normalizeStoredNoticeKinds = async ({
  client,
  repository,
}: {
  client: PocketBaseClient;
  repository: PocketBaseBidNoticeRepository;
}) => {
  const records = await client.listAll<NoticeRecord>('bid_notices');
  let movedToAttention = 0;
  let normalizedAssessments = 0;
  for (const record of records) {
    const rawAssessment = rawAssessmentFrom(record);
    const assessment = assessmentFrom(record);
    const deadline = dateTimestamp(record.deadline_at);
    const expired = deadline !== null && deadline < Date.now();
    const closedSummary = /已无参与机会|项目已结束|项目已截止|仅保留.{0,12}(?:参考|信息)/
      .test(assessment?.decisionSummary || String(record.judgment || ''));
    const shouldMoveToAttention = record.kind === 'current' && (expired || closedSummary);
    const assessmentChanged = Boolean(assessment)
      && JSON.stringify(rawAssessment) !== JSON.stringify(assessment);
    const judgmentChanged = Boolean(assessment)
      && String(record.judgment || '') !== assessment?.decisionSummary;
    if (!shouldMoveToAttention && !assessmentChanged && !judgmentChanged) continue;

    const attentionSummary = shouldMoveToAttention
      ? expired
        ? '项目已截止，仅保留产品、价格或资格信息作为业务参考。'
        : assessment?.decisionSummary || '项目已无参与机会，仅保留业务参考。'
      : assessment?.decisionSummary || String(record.judgment || '');
    const normalizedAssessment = assessment
      ? shouldMoveToAttention
        ? {
            ...assessment,
            decision: 'likely_cannot_do' as const,
            decisionSummary: attentionSummary,
            nextActions: [],
          }
        : assessment
      : undefined;
    const normalized = normalizeBidNotice({
      sourceKey: String(record.source_key || ''),
      sourceName: String(record.source_name || ''),
      externalId: String(record.external_id || ''),
      kind: shouldMoveToAttention ? 'attention' : record.kind === 'attention' ? 'attention' : 'current',
      title: String(record.title || ''),
      url: String(record.url || ''),
      buyerName: String(record.buyer_name || ''),
      publishedAt: String(record.published_at || ''),
      deadlineAt: String(record.deadline_at || ''),
      matchedProducts: parseArray(record.matched_products),
      judgment: normalizedAssessment?.decisionSummary || attentionSummary,
      requirements: parseArray(record.requirements),
      missingInfo: parseArray(record.missing_info),
      evidence: String(record.evidence || ''),
      detailReadMethod: String(record.detail_read_method || ''),
      attachmentUrls: parseArray(record.attachment_urls),
      assessment: normalizedAssessment,
    });
    await repository.updateNoticeAssessment(record.id, normalized);
    if (shouldMoveToAttention) movedToAttention += 1;
    if (assessmentChanged || judgmentChanged) normalizedAssessments += 1;
  }
  return { movedToAttention, normalizedAssessments };
};

export const reassessStoredBidNotices = async ({
  client,
  env = process.env,
  onlyMissing = true,
  limit = 0,
  onProgress = () => undefined,
}: {
  client: PocketBaseClient;
  env?: Record<string, string | undefined>;
  onlyMissing?: boolean;
  limit?: number;
  onProgress?: (message: string) => void;
}) => {
  const repository = new PocketBaseBidNoticeRepository(client);
  const assessor = createDefaultBidAssessor({ env });
  const siteByKey = new Map(BID_SITES.map((site) => [site.sourceKey, site]));
  const allRecords = await client.listAll<NoticeRecord>('bid_notices', { sort: 'source_key,first_seen_at' });
  const eligible = allRecords.filter((record) => siteByKey.has(String(record.source_key || '')))
    .filter((record) => !onlyMissing || !hasAssessment(record));
  const records = limit > 0 ? eligible.slice(0, limit) : eligible;
  let updated = 0;
  let failed = 0;

  for (const site of BID_SITES) {
    const siteRecords = records.filter((record) => record.source_key === site.sourceKey);
    if (!siteRecords.length) continue;
    onProgress(`${site.sourceName}：开始补充 ${siteRecords.length} 条研判`);
    for (let offset = 0; offset < siteRecords.length; offset += 5) {
      const batchRecords = siteRecords.slice(offset, offset + 5);
      const candidates = batchRecords.map(candidateFrom);
      const bundle: CandidateBundle = { source_name: site.sourceName, candidates };
      const cards = buildScreenedNotices({ bundle, task: taskForSite(site) });
      const assessedCards = await assessScreenedNotices({
        task: taskForSite(site),
        bundle,
        cards,
        assessor,
        mode: 'detail',
      });

      for (const [index, card] of assessedCards.entries()) {
        const record = batchRecords[index];
        if (!record) continue;
        try {
          const deadline = dateTimestamp(record.deadline_at);
          const kind = record.kind === 'attention' || (deadline !== null && deadline < Date.now())
            ? 'attention'
            : 'current';
          const input = screenedNoticeToInput(site.sourceKey, card, kind);
          const normalized = normalizeBidNotice({
            ...input,
            externalId: String(record.external_id || ''),
            detailReadMethod: String(record.detail_read_method || input.detailReadMethod || ''),
            attachmentUrls: parseArray(record.attachment_urls),
            evidence: String(record.evidence || input.evidence || ''),
          });
          await repository.updateNoticeAssessment(record.id, normalized);
          updated += 1;
        } catch {
          failed += 1;
        }
      }
      onProgress(`${site.sourceName}：完成 ${Math.min(offset + batchRecords.length, siteRecords.length)}/${siteRecords.length}`);
    }
    onProgress(`${site.sourceName}：研判已更新 ${updated} 条`);
  }

  const normalization = await normalizeStoredNoticeKinds({ client, repository });
  return {
    total: allRecords.length,
    selected: records.length,
    updated,
    failed,
    skipped: allRecords.length - records.length,
    ...normalization,
  };
};
