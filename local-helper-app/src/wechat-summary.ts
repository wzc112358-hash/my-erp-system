import type { OpportunityCard, OpportunityRecommendedAction } from './product-knowledge.ts';
import type { HelperTask } from './task-store.ts';

export type WechatTaskLike = Pick<HelperTask,
  'id' |
  'sourceName' |
  'searchTerms' |
  'status' |
  'updatedAt' |
  'lastCandidateBundle' |
  'lastOpportunityCards'
>;

export type WechatSummaryOptions = {
  now?: Date;
};

type CardGroup = {
  focus: OpportunityCard[];
  pending: OpportunityCard[];
  low: OpportunityCard[];
};

const actionLabel = (action: OpportunityRecommendedAction | string = '') => ({
  send_to_group: '建议发群确认',
  deep_read_document: '建议查附件/详情',
  ignore: '低相关可跳过',
  ask_boss: '建议人工判断',
  track_deadline: '建议跟踪截止',
}[action] || action || '待判断');

const dateLabel = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const unique = <T>(items: T[]) => [...new Set(items.filter(Boolean))];

const compactLine = (value = '') => value.replace(/\s+/g, ' ').trim();

const cardTerms = (card: OpportunityCard) => (
  card.matchedTerms.length ? card.matchedTerms.join('、') : '未命中重点产品'
);

const cardNeedText = (card: OpportunityCard) => unique([
  ...card.missingInfo,
  ...card.hardRequirements,
]).slice(0, 3).join('；');

const cardRiskText = (card: OpportunityCard) => card.riskFlags.slice(0, 2).join('；');

export const classifyWechatCards = (cards: OpportunityCard[] = []): CardGroup => {
  const focus: OpportunityCard[] = [];
  const pending: OpportunityCard[] = [];
  const low: OpportunityCard[] = [];
  for (const card of cards) {
    if (card.recommendedAction === 'send_to_group' || card.relevanceScore >= 85) {
      focus.push(card);
    } else if (card.recommendedAction === 'ignore' || card.relevanceScore <= 0) {
      low.push(card);
    } else {
      pending.push(card);
    }
  }
  const scoreDesc = (left: OpportunityCard, right: OpportunityCard) => right.relevanceScore - left.relevanceScore;
  return {
    focus: focus.sort(scoreDesc),
    pending: pending.sort(scoreDesc),
    low: low.sort(scoreDesc),
  };
};

export const buildOpportunityWechatSummary = (card: OpportunityCard) => [
  `【待确认】${card.sourceName || '本地采集'} - ${card.title}`,
  `产品：${cardTerms(card)}`,
  `相关度：${card.relevanceScore}/100，${actionLabel(card.recommendedAction)}`,
  card.buyerName ? `采购方：${card.buyerName}` : '',
  card.deadlineAt ? `截止：${card.deadlineAt}` : '',
  cardNeedText(card) ? `需确认：${cardNeedText(card)}` : '',
  cardRiskText(card) ? `风险：${cardRiskText(card)}` : '',
  card.deepReadAt ? '已查详情/附件，摘要如下：' : '',
  card.evidenceText ? `证据：${compactLine(card.evidenceText).slice(0, 220)}` : '',
  card.url ? `链接：${card.url}` : '',
].filter(Boolean).join('\n');

const listCards = (cards: OpportunityCard[], emptyText: string) => {
  if (!cards.length) return emptyText;
  return cards.map((card, index) => [
    `${index + 1}. ${card.title}`,
    `产品：${cardTerms(card)}；相关度：${card.relevanceScore}/100；${actionLabel(card.recommendedAction)}`,
    cardNeedText(card) ? `需确认：${cardNeedText(card)}` : '',
    card.url ? `链接：${card.url}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
};

export const buildTaskWechatReport = (
  task: WechatTaskLike,
  { now = new Date() }: WechatSummaryOptions = {},
) => {
  const cards = task.lastOpportunityCards || [];
  const groups = classifyWechatCards(cards);
  const candidateCount = task.lastCandidateBundle?.candidates?.length || 0;
  const noNewText = candidateCount
    ? `低相关 ${groups.low.length} 条，暂不建议发群。`
    : '今日暂无新增候选，或页面未识别到可入库公告。';

  return [
    `【站点日报】${task.sourceName || '本地采集'}（${dateLabel(now)}）`,
    task.searchTerms ? `搜索词：${task.searchTerms}` : '',
    `状态：${task.status || '未知'}；候选 ${candidateCount} 条；商机卡片 ${cards.length} 张`,
    '',
    '一、建议重点关注',
    listCards(groups.focus, '无'),
    '',
    '二、待人工确认',
    listCards(groups.pending, '无'),
    '',
    '三、低相关或无新增',
    groups.low.length
      ? listCards(groups.low.slice(0, 5), noNewText)
      : noNewText,
  ].filter((line) => line !== '').join('\n');
};

const sameLocalDate = (value = '', date = new Date()) => {
  if (!value) return true;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  return dateLabel(parsed) === dateLabel(date);
};

const taskNoNewLine = (task: WechatTaskLike) => {
  const cards = task.lastOpportunityCards || [];
  const candidates = task.lastCandidateBundle?.candidates?.length || 0;
  const low = classifyWechatCards(cards).low.length;
  if (!cards.length && !candidates) return `${task.sourceName || '本地采集'}：无新增`;
  if (low > 0 && low === cards.length) return `${task.sourceName || '本地采集'}：低相关 ${low} 条`;
  return '';
};

export const buildDailyWechatDigest = (
  tasks: WechatTaskLike[] = [],
  { now = new Date() }: WechatSummaryOptions = {},
) => {
  const todaysTasks = tasks.filter((task) => sameLocalDate(task.updatedAt || '', now));
  const allCards = todaysTasks.flatMap((task) => task.lastOpportunityCards || []);
  const groups = classifyWechatCards(allCards);
  const lowOrEmpty = unique([
    ...todaysTasks.map(taskNoNewLine),
  ]).filter(Boolean);

  return [
    `今日招投标信息汇总（${dateLabel(now)}）`,
    `已检查站点/任务：${todaysTasks.length} 个；候选商机卡片：${allCards.length} 张`,
    '',
    '一、建议重点关注',
    listCards(groups.focus, '无'),
    '',
    '二、待人工确认',
    listCards(groups.pending, '无'),
    '',
    '三、低相关或无新增站点',
    lowOrEmpty.length ? lowOrEmpty.map((line, index) => `${index + 1}. ${line}`).join('\n') : '无',
  ].filter((line) => line !== '').join('\n');
};
