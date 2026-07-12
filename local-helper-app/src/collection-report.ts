import type { OpportunityCard } from './product-knowledge.ts';
import type { HelperTask } from './task-store.ts';

export type CollectionReportStatus =
  | 'pending'
  | 'needs_human'
  | 'no_matches'
  | 'has_matches'
  | 'failed';

export type CollectionReportItem = {
  id: string;
  title: string;
  sourceName: string;
  buyerName: string;
  url: string;
  publishedAt: string;
  deadlineAt: string;
  matchedProducts: string[];
  judgment: string;
  requirements: string[];
  missingInfo: string[];
  evidence: string;
};

export type CollectionReport = {
  taskId: string;
  sourceName: string;
  ownerName: string;
  generatedAt: string;
  status: CollectionReportStatus;
  rawCount: number;
  expiredCount: number;
  selectedCount: number;
  items: CollectionReportItem[];
  summary: string;
};

const actionLabel = (card: OpportunityCard) => ({
  send_to_group: '建议发群确认',
  deep_read_document: '建议继续查看详情或附件',
  ask_boss: '建议人工判断后询问负责人',
  track_deadline: '建议跟踪截止时间',
  ignore: '无需发送',
}[card.recommendedAction] || '建议人工确认');

const unique = (values: string[] = []) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const conciseHumanReason = (value = '') => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  const afterMarker = normalized.includes('需要人工处理：')
    ? normalized.split('需要人工处理：').slice(1).join('需要人工处理：')
    : normalized;
  const detected = afterMarker.includes('检测到') ? afterMarker.slice(afterMarker.indexOf('检测到')) : afterMarker;
  return detected
    .split(/当前地址：|结果摘要：|页面观察：|发现入口：/)[0]
    .trim()
    .slice(0, 220);
};

const deadlineTimestamp = (value = '') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[年/.]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-').map((part) => part.padStart(2, '0'));
    const timestamp = Date.parse(`${year}-${month}-${day}T23:59:59+08:00`);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const isoLike = normalized.replace(' ', 'T');
  const timestamp = Date.parse(hasTimezone ? isoLike : `${isoLike}+08:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const isExpired = (card: OpportunityCard, now: number) => {
  const deadline = deadlineTimestamp(card.deadlineAt);
  return deadline !== null && deadline < now;
};

const isNonActionableStage = (card: OpportunityCard) => (
  /(?:评标|招标|中标候选|中标|成交|采购|入围)结果(?:公告|公示|通知)?|结果公示|候选人公示|废(?:旧|物|料).{0,8}(?:销售|处置)/.test(card.title)
);

const selectedCards = (task: Pick<HelperTask, 'lastOpportunityCards'>, now: number) => (
  (task.lastOpportunityCards || []).filter((card) => (
    card.recommendedAction !== 'ignore' && !isExpired(card, now) && !isNonActionableStage(card)
  ))
);

const itemFromCard = (card: OpportunityCard): CollectionReportItem => ({
  id: card.id,
  title: card.title,
  sourceName: card.sourceName,
  buyerName: card.buyerName,
  url: card.url,
  publishedAt: card.publishedAt,
  deadlineAt: card.deadlineAt,
  matchedProducts: unique(card.matchedTerms || []),
  judgment: actionLabel(card),
  requirements: unique([...(card.hardRequirements || []), ...(card.riskFlags || [])]),
  missingInfo: unique(card.missingInfo || []),
  evidence: String(card.evidenceText || '').trim(),
});

const summaryFor = ({
  task,
  status,
  items,
}: {
  task: Pick<HelperTask, 'sourceName' | 'lastLog' | 'lastObservation'>;
  status: CollectionReportStatus;
  items: CollectionReportItem[];
}) => {
  const heading = `【${task.sourceName || '招投标站点'}巡检】`;
  if (status === 'needs_human') {
    const reason = conciseHumanReason(
      task.lastLog || task.lastObservation || '需要员工完成登录、人机验证或进入正确的公告列表。',
    );
    return `${heading}\n需要人工继续：${reason}`;
  }
  if (status === 'failed') return `${heading}\n采集失败，请人工检查站点或网络。`;
  if (status === 'pending') return `${heading}\n尚未完成采集。`;
  if (!items.length) return `${heading}\n今日已巡检，未筛选出与公司产品相关的招标、询价或采购信息。`;
  return [
    heading,
    `筛选出 ${items.length} 条建议关注的信息：`,
    ...items.map((item, index) => [
      `${index + 1}. ${item.title}`,
      item.matchedProducts.length ? `产品：${item.matchedProducts.join('、')}` : '',
      item.deadlineAt ? `截止：${item.deadlineAt}` : '截止：待确认',
      `判断：${item.judgment}`,
      item.requirements.length ? `要求/风险：${item.requirements.slice(0, 3).join('；')}` : '',
      item.missingInfo.length ? `需确认：${item.missingInfo.slice(0, 3).join('；')}` : '',
      item.url ? `链接：${item.url}` : '',
    ].filter(Boolean).join('\n')),
  ].join('\n\n');
};

export const buildCollectionReport = (
  task: HelperTask,
  generatedAt = new Date().toISOString(),
): CollectionReport => {
  const generatedTimestamp = Date.parse(generatedAt);
  const now = Number.isFinite(generatedTimestamp) ? generatedTimestamp : Date.now();
  const nonIgnoredCards = (task.lastOpportunityCards || [])
    .filter((card) => card.recommendedAction !== 'ignore');
  const items = selectedCards(task, now).map(itemFromCard);
  const expiredCount = nonIgnoredCards.filter((card) => isExpired(card, now)).length;
  const status: CollectionReportStatus = task.status === 'waiting_agent'
    ? 'needs_human'
    : task.status === 'failed'
      ? 'failed'
      : items.length
        ? 'has_matches'
        : task.status === 'completed'
          ? 'no_matches'
          : 'pending';
  return {
    taskId: task.id,
    sourceName: task.sourceName,
    ownerName: task.ownerName || '',
    generatedAt,
    status,
    rawCount: task.lastCandidateBundle?.candidates?.length || 0,
    expiredCount,
    selectedCount: items.length,
    items,
    summary: summaryFor({ task, status, items }),
  };
};
