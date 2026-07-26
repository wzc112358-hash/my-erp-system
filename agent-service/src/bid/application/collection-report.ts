import type { CollectionDiscoveryStats } from '../domain/discovery.ts';
import type { ScreenedNotice } from '../domain/tender-screening.ts';
import type { BidNoticeInput } from '../domain/notice.ts';

export type BidCollectionReport = {
  sourceKey: string;
  sourceName: string;
  generatedAt: string;
  rawCount: number;
  eligibleCount: number;
  currentItems: BidNoticeInput[];
  attentionItems: BidNoticeInput[];
  llmIgnoredCount: number;
  summary: string;
  discoveryStats?: CollectionDiscoveryStats;
};

const deadlineTimestamp = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T23:59:59+08:00` : normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const isResultNotice = (title: string) => /(?:评标|招标|中标候选|中标|成交|采购|入围)结果|结果公示|候选人公示/.test(title);
const isNonGoodsNotice = (title: string) => (
  /(?:服务|工程|施工|维修|维保|设计|监理|咨询|劳务|租赁|培训|外委加工|委托加工|系统集成|EPC|总承包|(?:装卸|评价|制备)(?:系统|装置|设备))/.test(title)
  || /(?:设备|仪器|机组)(?:采购|招标)/.test(title)
  || /(?:改造|大修|治理).*(?:招标|采购)/.test(title)
  || /有限公司.*包装材料.*采购/.test(title)
  || /(?:五金|印刷品|阀门|备件|电加热器)/.test(title)
  || /(?:销售|出售|处置|回收)(?:招标|采购|公告)/.test(title)
);

const readMethod = (card: ScreenedNotice) => {
  const ocr = card.documentSummaries?.find((item) => item.ocrProvider)?.ocrProvider;
  if (ocr === 'baidu') return '百度 OCR';
  if (card.deepReadAt) return 'PDF/网页正文';
  if (card.documentSummaries?.length) return '未读取到有效正文';
  return '公告列表/公开接口';
};

export const screenedNoticeToInput = (
  sourceKey: string,
  card: ScreenedNotice,
  kind: 'current' | 'attention',
): BidNoticeInput => {
  const attentionSummary = card.sourceOpportunityStatus === 'ended'
    ? '项目已结束，仅保留产品、价格或资格信息作为业务参考。'
    : '项目已截止或当前有效性待确认，仅保留产品、价格或资格信息作为业务参考。';
  const assessment = kind === 'attention'
    ? { ...card.businessAssessment, decision: 'likely_cannot_do' as const, decisionSummary: attentionSummary, nextActions: [] }
    : card.businessAssessment;
  return {
    sourceKey,
    sourceName: card.sourceName,
    kind,
    title: card.title,
    url: card.url,
    buyerName: card.buyerName,
    publishedAt: card.publishedAt,
    deadlineAt: card.deadlineAt,
    matchedProducts: [...new Set(card.matchedTerms || [])],
    judgment: assessment.decisionSummary,
    requirements: [...new Set([...(card.hardRequirements || []), ...(card.riskFlags || [])])],
    missingInfo: [...new Set(card.missingInfo || [])],
    evidence: String(card.evidenceText || '').trim(),
    detailReadMethod: readMethod(card),
    attachmentUrls: (card.documentSummaries || []).map((item) => item.url || '').filter(Boolean),
    assessment,
  };
};

export const buildBidCollectionReport = ({
  sourceKey,
  sourceName,
  cards,
  generatedAt = new Date().toISOString(),
  discoveryStats,
}: {
  sourceKey: string;
  sourceName: string;
  cards: ScreenedNotice[];
  generatedAt?: string;
  discoveryStats?: CollectionDiscoveryStats;
}): BidCollectionReport => {
  const now = Date.parse(generatedAt);
  const currentItems: BidNoticeInput[] = [];
  const attentionItems: BidNoticeInput[] = [];
  let llmIgnoredCount = 0;
  for (const card of cards) {
    if (isResultNotice(card.title) || isNonGoodsNotice(card.title)) {
      llmIgnoredCount += 1;
      continue;
    }
    const relevant = ['known_product', 'potential_product'].includes(card.businessRelevance || '')
      || card.recommendedAction !== 'ignore';
    if (!relevant) {
      llmIgnoredCount += 1;
      continue;
    }
    const deadline = deadlineTimestamp(card.deadlineAt);
    const inactive = card.sourceOpportunityStatus === 'ended'
      || (deadline !== null && deadline < now)
      || card.recommendedAction === 'ignore';
    (inactive ? attentionItems : currentItems).push(screenedNoticeToInput(sourceKey, card, inactive ? 'attention' : 'current'));
  }
  const rawCount = discoveryStats?.rawCount ?? cards.length;
  const eligibleCount = discoveryStats?.eligibleCount ?? cards.length;
  return {
    sourceKey,
    sourceName,
    generatedAt,
    rawCount,
    eligibleCount,
    currentItems,
    attentionItems,
    llmIgnoredCount,
    discoveryStats,
    summary: `${sourceName}：接口读取 ${rawCount} 条，有效候选 ${eligibleCount} 条，当前商机 ${currentItems.length} 条，可关注信息 ${attentionItems.length} 条。`,
  };
};
