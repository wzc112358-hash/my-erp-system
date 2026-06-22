import type { OpportunityCard, OpportunityFeedbackStatus, OpportunityRecommendedAction } from './product-knowledge.ts';
import type { HelperTask } from './task-store.ts';

export type PriorityTaskLike = Pick<HelperTask,
  'id' |
  'sourceName' |
  'searchTerms' |
  'updatedAt' |
  'lastOpportunityCards'
>;

export type PriorityLevel = 'high' | 'medium' | 'low';

export type PriorityOpportunity = {
  taskId: string;
  cardIndex: number;
  sourceName: string;
  searchTerms: string;
  updatedAt: string;
  card: OpportunityCard;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  reasons: string[];
  nextStep: string;
};

export type DailyPriorityBoard = {
  date: string;
  totalTasks: number;
  totalCards: number;
  actionableCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  items: PriorityOpportunity[];
};

export type PriorityBoardOptions = {
  now?: Date;
  limit?: number;
  includeLow?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const compact = (value = '') => value.replace(/\s+/g, ' ').trim();

const dateLabel = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const sameLocalDate = (value = '', date = new Date()) => {
  if (!value) return true;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  return dateLabel(parsed) === dateLabel(date);
};

const daysUntil = (value = '', now = new Date()) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - now.getTime()) / 86400000);
};

const actionWeight = (action: OpportunityRecommendedAction | string = '') => ({
  send_to_group: 18,
  deep_read_document: 8,
  ask_boss: 10,
  track_deadline: 6,
  ignore: -80,
}[action] ?? 0);

const feedbackWeight = (status?: OpportunityFeedbackStatus) => ({
  valuable: 14,
  sent_to_group: 12,
  followed_up: 8,
  ask_boss: 6,
  irrelevant: -100,
}[status || ''] ?? 0);

const actionText = (action: OpportunityRecommendedAction | string = '') => ({
  send_to_group: '复制群消息，发给老板确认',
  deep_read_document: '先点“查清楚”，补附件和详情后再判断',
  ask_boss: '人工快速看一眼，再问老板是否跟进',
  track_deadline: '确认截止时间，避免错过报价',
  ignore: '暂不处理',
}[action] || '人工判断');

const levelForScore = (score: number): PriorityLevel => {
  if (score >= 88) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
};

const deadlineReason = (card: OpportunityCard, now: Date) => {
  const days = daysUntil(card.deadlineAt, now);
  if (days === null) return { score: 0, reason: '' };
  if (days < 0) return { score: -35, reason: '已过截止时间' };
  if (days <= 1) return { score: 14, reason: '截止很近' };
  if (days <= 3) return { score: 8, reason: '三天内截止' };
  return { score: 0, reason: '' };
};

export const scorePriorityOpportunity = (
  card: OpportunityCard,
  { now = new Date() }: { now?: Date } = {},
) => {
  const deadline = deadlineReason(card, now);
  const learnedPositive = (card.matchedSources || []).some((source) => source === 'feedback_positive');
  const learnedNegative = (card.matchedSources || []).some((source) => source === 'feedback_negative');
  const score = clamp(
    Number(card.relevanceScore || 0) +
      actionWeight(card.recommendedAction) +
      feedbackWeight(card.feedbackStatus) +
      deadline.score +
      (learnedPositive ? 8 : 0) -
      (learnedNegative ? 30 : 0) +
      (card.deepReadAt ? 3 : 0),
    0,
    100,
  );
  const reasons = [
    card.relevanceScore >= 85 ? '相关度高' : '',
    card.recommendedAction === 'send_to_group' ? '建议发群' : '',
    card.recommendedAction === 'deep_read_document' ? '需要查附件/详情' : '',
    card.recommendedAction === 'ask_boss' ? '需要老板判断' : '',
    card.feedbackStatus && card.feedbackSource !== 'system' ? `员工已标记：${card.feedbackStatus}` : '',
    card.feedbackSource === 'system' ? '命中过往反馈' : '',
    learnedPositive ? '反馈学习加权' : '',
    learnedNegative ? '反馈学习降权' : '',
    deadline.reason,
  ].filter(Boolean).slice(0, 5);
  return {
    priorityScore: score,
    priorityLevel: levelForScore(score),
    reasons,
    nextStep: actionText(card.recommendedAction),
  };
};

export const buildDailyPriorityBoard = (
  tasks: PriorityTaskLike[] = [],
  { now = new Date(), limit = 20, includeLow = false }: PriorityBoardOptions = {},
): DailyPriorityBoard => {
  const todaysTasks = tasks.filter((task) => sameLocalDate(task.updatedAt || '', now));
  const allItems = todaysTasks.flatMap((task) => (task.lastOpportunityCards || []).map((card, cardIndex) => {
    const scored = scorePriorityOpportunity(card, { now });
    return {
      taskId: task.id,
      cardIndex,
      sourceName: task.sourceName || '本地采集',
      searchTerms: task.searchTerms || '',
      updatedAt: task.updatedAt || '',
      card,
      ...scored,
    };
  }));
  const actionable = allItems
    .filter((item) => includeLow || (item.card.recommendedAction !== 'ignore' && item.priorityScore >= 40))
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    })
    .slice(0, limit);

  return {
    date: dateLabel(now),
    totalTasks: todaysTasks.length,
    totalCards: allItems.length,
    actionableCount: actionable.length,
    highCount: actionable.filter((item) => item.priorityLevel === 'high').length,
    mediumCount: actionable.filter((item) => item.priorityLevel === 'medium').length,
    lowCount: actionable.filter((item) => item.priorityLevel === 'low').length,
    items: actionable,
  };
};

const cardTerms = (card: OpportunityCard) => (
  card.matchedTerms?.length ? card.matchedTerms.join('、') : '未命中重点产品'
);

export const buildDailyPriorityReport = (
  tasks: PriorityTaskLike[] = [],
  options: PriorityBoardOptions = {},
) => {
  const board = buildDailyPriorityBoard(tasks, options);
  const lines = board.items.length
    ? board.items.map((item, index) => [
      `${index + 1}. 【${item.sourceName}】${item.card.title}`,
      `优先级：${item.priorityScore}/100；产品：${cardTerms(item.card)}；${item.nextStep}`,
      item.reasons.length ? `原因：${item.reasons.join('、')}` : '',
      item.card.deadlineAt ? `截止：${item.card.deadlineAt}` : '',
      item.card.url ? `链接：${item.card.url}` : '',
    ].filter(Boolean).join('\n')).join('\n\n')
    : '今日暂无需要优先处理的商机。';

  return [
    `今日招投标重点清单（${board.date}）`,
    `任务 ${board.totalTasks} 个；商机卡片 ${board.totalCards} 张；建议优先处理 ${board.actionableCount} 条`,
    '',
    compact(lines),
  ].filter(Boolean).join('\n');
};
