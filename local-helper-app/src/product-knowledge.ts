import seedTerms from './data/product-terms.seed.json' with { type: 'json' };
import type { CandidateBundle, LocalHelperTask } from './site-harness.ts';

export type ProductTermStatus = 'active' | 'disabled';

export type ProductTerm = {
  term: string;
  aliases?: string[];
  sources?: string[];
  source?: string;
  weight?: number;
  status?: ProductTermStatus;
  notes?: string;
};

export type ProductTermMatch = {
  term: string;
  matchedText: string;
  sources: string[];
  weight: number;
  evidenceText: string;
};

export type ProductMatchResult = {
  score: number;
  matchedTerms: string[];
  matchedSources: string[];
  evidenceText: string;
  negativeTerms: string[];
  matches: ProductTermMatch[];
};

export type OpportunityRecommendedAction =
  'send_to_group'
  | 'deep_read_document'
  | 'ignore'
  | 'ask_boss'
  | 'track_deadline';

export type OpportunityBidability =
  'likely_can_do'
  | 'needs_manual_check'
  | 'likely_cannot_do';

export type OpportunityFeedbackStatus =
  'valuable'
  | 'irrelevant'
  | 'ask_boss'
  | 'sent_to_group'
  | 'followed_up';

export type OpportunityReviewDecision =
  'follow'
  | 'irrelevant'
  | 'needs_boss'
  | 'needs_documents'
  | 'expired'
  | 'approved'
  | 'rejected';

export type OpportunityReviewDraft = {
  review_type: 'employee';
  decision: OpportunityReviewDecision;
  comment: string;
};

export type OpportunityFeedbackInput = {
  status: OpportunityFeedbackStatus;
  note?: string;
  updatedAt?: string;
  source?: 'employee' | 'system';
};

export type OpportunityDocumentSummary = {
  title: string;
  url?: string;
  filePath?: string;
  textSnippet?: string;
  warning?: string;
};

export type OpportunityCard = {
  id: string;
  title: string;
  sourceName: string;
  url: string;
  buyerName: string;
  publishedAt: string;
  deadlineAt: string;
  matchedTerms: string[];
  matchedSources: string[];
  relevanceScore: number;
  bidability: OpportunityBidability;
  hardRequirements: string[];
  riskFlags: string[];
  missingInfo: string[];
  recommendedAction: OpportunityRecommendedAction;
  evidenceText: string;
  wechatSummary: string;
  confidence: number;
  originalRelevanceScore?: number;
  deepReadAt?: string;
  detailUrl?: string;
  detailScreenshotPath?: string;
  documentSummaries?: OpportunityDocumentSummary[];
  feedbackStatus?: OpportunityFeedbackStatus;
  feedbackNote?: string;
  feedbackUpdatedAt?: string;
  feedbackSource?: 'employee' | 'system';
  feedbackWeightDelta?: number;
  erpReviewDraft?: OpportunityReviewDraft;
};

const DEFAULT_TERMS = seedTerms as ProductTerm[];
const NEGATIVE_SOURCES = new Set(['negative_guard', 'feedback_negative']);
const BROAD_SOURCES = new Set(['broad_guard']);
const REQUIREMENT_PATTERNS = [
  /代理商|授权|制造商|生产商|厂家/,
  /8\s*位码|八位码|准入|入网/,
  /第三方|检测|质检|检验报告/,
  /业绩|合同业绩|供货业绩/,
  /危化|危险化学品|危包|运输/,
  /保证金|标书费|服务费|质保金/,
  /交货期|分批|到货|付款|账期/,
  /截止|递交|开标|报价/,
];

const normalize = (value = '') => value.normalize('NFKC').toLowerCase();
const compact = (value = '') => normalize(value).replace(/\s+/g, '');
const unique = <T>(items: T[]) => [...new Set(items.filter(Boolean))];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const loadProductTerms = (terms: ProductTerm[] = DEFAULT_TERMS) => (
  terms
    .filter((term) => term.status !== 'disabled')
    .filter((term) => String(term.term || '').trim())
    .map((term) => ({
      ...term,
      term: String(term.term).trim(),
      aliases: unique((term.aliases || []).map((alias) => String(alias).trim())),
      sources: unique([...(term.sources || []), term.source || 'curated']),
      weight: Number(term.weight ?? 50),
    }))
);

const labelsForTerm = (term: ProductTerm) => unique([term.term, ...(term.aliases || [])]);

const sourceListFor = (term: ProductTerm) => unique([...(term.sources || []), term.source || 'curated']);

const includesLabel = (haystack: string, compactHaystack: string, label: string) => {
  const normalized = normalize(label);
  return Boolean(normalized) && (haystack.includes(normalized) || compactHaystack.includes(compact(label)));
};

const snippetFor = (text: string, label: string) => {
  const normalizedText = normalize(text);
  const normalizedLabel = normalize(label);
  const index = normalizedText.indexOf(normalizedLabel);
  if (index < 0) return text.replace(/\s+/g, ' ').trim().slice(0, 180);
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + label.length + 90);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
};

export const matchProductTerms = (
  text: string,
  terms: ProductTerm[] = loadProductTerms(),
): ProductMatchResult => {
  const normalizedText = normalize(text);
  const compactText = compact(text);
  const matches: ProductTermMatch[] = [];
  const negativeMatches: ProductTermMatch[] = [];

  for (const term of terms) {
    const labels = labelsForTerm(term);
    const matchedText = labels.find((label) => includesLabel(normalizedText, compactText, label));
    if (!matchedText) continue;
    const sources = sourceListFor(term);
    const match = {
      term: term.term,
      matchedText,
      sources,
      weight: Number(term.weight ?? 50),
      evidenceText: snippetFor(text, matchedText),
    };
    if (sources.some((source) => NEGATIVE_SOURCES.has(source)) || match.weight < 0) {
      negativeMatches.push(match);
    } else if (!sources.some((source) => BROAD_SOURCES.has(source)) || match.weight > 10) {
      matches.push(match);
    }
  }

  const positiveScore = matches.reduce((sum, match) => sum + Math.max(0, match.weight), 0);
  const negativePenalty = negativeMatches.reduce((sum, match) => sum + Math.abs(Math.min(0, match.weight)), 0);
  const broadOnlyPenalty = matches.length === 0 && negativeMatches.length > 0 ? 20 : 0;
  const score = Math.round(clamp(positiveScore - negativePenalty - broadOnlyPenalty, 0, 100));

  return {
    score,
    matchedTerms: unique(matches.map((match) => match.term)),
    matchedSources: unique(matches.flatMap((match) => match.sources)),
    evidenceText: unique(matches.map((match) => match.evidenceText)).slice(0, 3).join('\n'),
    negativeTerms: unique(negativeMatches.map((match) => match.term)),
    matches,
  };
};

const candidateText = (candidate: CandidateBundle['candidates'][number]) => [
  candidate.title,
  candidate.buyer_name,
  candidate.published_at,
  candidate.deadline_at,
  candidate.raw_text,
  ...(candidate.attachments || []),
].filter(Boolean).join('\n');

const collectRequirementHints = (text: string) => {
  const lines = text
    .split(/[\n。；;]+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 4);
  return unique(lines.filter((line) => REQUIREMENT_PATTERNS.some((pattern) => pattern.test(line))))
    .slice(0, 6)
    .map((line) => line.slice(0, 120));
};

const riskFlagsFor = (text: string, match: ProductMatchResult) => {
  const risks = [];
  if (match.negativeTerms.length) risks.push(`命中低相关排除词：${match.negativeTerms.join('、')}`);
  if (/制造商|生产商|厂家|原厂/.test(text)) risks.push('可能限制生产商/制造商资质');
  if (/8\s*位码|八位码|准入|入网/.test(text)) risks.push('可能需要 8 位码或供应商准入');
  if (/危化|危险化学品|危包/.test(text)) risks.push('可能涉及危化品资质和运输要求');
  if (/保证金|标书费|服务费|质保金/.test(text)) risks.push('可能存在保证金、标书费或服务费');
  return unique(risks).slice(0, 5);
};

const missingInfoFor = (text: string, match: ProductMatchResult) => {
  if (!match.matchedTerms.length) return ['未命中公司重点产品词'];
  const missing = [];
  if (!/规格|型号|纯度|含量|包装|数量|吨|kg|千克/i.test(text)) missing.push('规格、数量、包装待确认');
  if (!/装置|用途|使用|项目|车间/.test(text)) missing.push('具体装置或用途待确认');
  if (!/代理商|授权|制造商|生产商|厂家/.test(text)) missing.push('是否接受代理商投标待确认');
  if (!/第三方|检测|质检|业绩|8\s*位码|八位码|准入|危化|危险化学品/.test(text)) missing.push('检测、业绩、8 位码或危化资质要求待确认');
  return missing.slice(0, 5);
};

const recommendedActionFor = (match: ProductMatchResult): OpportunityRecommendedAction => {
  if (match.score <= 0) return 'ignore';
  if (match.score >= 85 && match.matchedSources.includes('erp_history')) return 'send_to_group';
  if (match.score >= 55) return 'deep_read_document';
  return 'ask_boss';
};

const bidabilityFor = (match: ProductMatchResult): OpportunityBidability => {
  if (match.score <= 0) return 'likely_cannot_do';
  return 'needs_manual_check';
};

const actionLabel = (action: OpportunityRecommendedAction) => ({
  send_to_group: '建议发群请老板确认',
  deep_read_document: '建议继续查附件/详情',
  ignore: '建议忽略',
  ask_boss: '建议人工判断后再问老板',
  track_deadline: '建议跟踪截止时间',
}[action]);

export const feedbackLabel = (status: OpportunityFeedbackStatus) => ({
  valuable: '有价值',
  irrelevant: '不相关',
  ask_boss: '待老板确认',
  sent_to_group: '已发群',
  followed_up: '已跟进',
}[status]);

export const feedbackDecisionFor = (status: OpportunityFeedbackStatus): OpportunityReviewDecision => ({
  valuable: 'follow',
  irrelevant: 'irrelevant',
  ask_boss: 'needs_boss',
  sent_to_group: 'follow',
  followed_up: 'follow',
}[status]);

export const feedbackWeightDeltaFor = (status: OpportunityFeedbackStatus) => ({
  valuable: 16,
  irrelevant: -60,
  ask_boss: 8,
  sent_to_group: 20,
  followed_up: 24,
}[status]);

const feedbackActionFor = (
  status: OpportunityFeedbackStatus,
  current: OpportunityRecommendedAction,
): OpportunityRecommendedAction => ({
  valuable: 'send_to_group',
  irrelevant: 'ignore',
  ask_boss: 'ask_boss',
  sent_to_group: 'send_to_group',
  followed_up: current === 'ignore' ? 'track_deadline' : current,
}[status]);

const feedbackScoreFor = (
  status: OpportunityFeedbackStatus,
  score: number,
) => {
  if (status === 'irrelevant') return 0;
  if (status === 'valuable' || status === 'sent_to_group') return Math.max(score, 85);
  if (status === 'followed_up') return Math.max(score, 80);
  if (status === 'ask_boss') return Math.max(score, 60);
  return score;
};

export const buildOpportunityReviewDraft = (
  card: OpportunityCard,
  feedback: OpportunityFeedbackInput,
): OpportunityReviewDraft => {
  const label = feedbackLabel(feedback.status);
  const terms = card.matchedTerms.length ? card.matchedTerms.join('、') : '未命中重点产品';
  const lines = [
    `员工反馈：${label}`,
    feedback.note ? `备注：${feedback.note}` : '',
    `产品：${terms}`,
    `相关度：${card.relevanceScore}/100`,
    `建议动作：${actionLabel(card.recommendedAction)}`,
    card.url ? `链接：${card.url}` : '',
  ].filter(Boolean);
  return {
    review_type: 'employee',
    decision: feedbackDecisionFor(feedback.status),
    comment: lines.join('\n'),
  };
};

export const applyOpportunityFeedback = (
  card: OpportunityCard,
  feedback: OpportunityFeedbackInput,
): OpportunityCard => {
  const updatedAt = feedback.updatedAt || new Date().toISOString();
  const originalRelevanceScore = card.originalRelevanceScore ?? card.relevanceScore;
  const nextAction = feedbackActionFor(feedback.status, card.recommendedAction);
  const nextScore = feedbackScoreFor(feedback.status, originalRelevanceScore);
  const note = String(feedback.note || '').trim();
  const feedbackRisk = `员工反馈：${feedbackLabel(feedback.status)}`;
  const riskFlags = [feedbackRisk, ...card.riskFlags.filter((item) => !/^员工反馈：/.test(item))].slice(0, 8);
  return {
    ...card,
    originalRelevanceScore,
    relevanceScore: nextScore,
    recommendedAction: nextAction,
    bidability: feedback.status === 'irrelevant' ? 'likely_cannot_do' : card.bidability,
    riskFlags,
    feedbackStatus: feedback.status,
    feedbackNote: note,
    feedbackUpdatedAt: updatedAt,
    feedbackSource: feedback.source || 'employee',
    feedbackWeightDelta: feedbackWeightDeltaFor(feedback.status),
    erpReviewDraft: buildOpportunityReviewDraft(card, {
      ...feedback,
      updatedAt,
    }),
  };
};

const cardIdFor = (sourceName: string, title: string, url: string) => (
  `${sourceName}|${title}|${url}`.replace(/\s+/g, '').slice(0, 240)
);

const wechatSummaryFor = ({
  sourceName,
  title,
  url,
  match,
  hardRequirements,
  missingInfo,
  riskFlags,
  recommendedAction,
}: {
  sourceName: string;
  title: string;
  url: string;
  match: ProductMatchResult;
  hardRequirements: string[];
  missingInfo: string[];
  riskFlags: string[];
  recommendedAction: OpportunityRecommendedAction;
}) => [
  `【待确认】${sourceName} - ${title}`,
  `产品：${match.matchedTerms.length ? match.matchedTerms.join('、') : '未命中重点产品'}`,
  `相关度：${match.score}/100，${actionLabel(recommendedAction)}`,
  hardRequirements.length ? `页面线索：${hardRequirements.slice(0, 2).join('；')}` : '',
  missingInfo.length ? `需确认：${missingInfo.slice(0, 3).join('；')}` : '',
  riskFlags.length ? `风险：${riskFlags.slice(0, 2).join('；')}` : '',
  url ? `链接：${url}` : '',
].filter(Boolean).join('\n');

export const buildOpportunityCards = ({
  bundle,
  task,
  terms = loadProductTerms(),
}: {
  bundle: CandidateBundle | null | undefined;
  task?: Pick<LocalHelperTask, 'sourceName'>;
  terms?: ProductTerm[];
}): OpportunityCard[] => {
  const sourceName = bundle?.source_name || task?.sourceName || '';
  return (bundle?.candidates || []).map((candidate) => {
    const text = candidateText(candidate);
    const match = matchProductTerms(text, terms);
    const hardRequirements = collectRequirementHints(text);
    const riskFlags = riskFlagsFor(text, match);
    const missingInfo = missingInfoFor(text, match);
    const recommendedAction = recommendedActionFor(match);
    return {
      id: cardIdFor(sourceName, candidate.title, candidate.url),
      title: candidate.title,
      sourceName,
      url: candidate.url,
      buyerName: candidate.buyer_name,
      publishedAt: candidate.published_at,
      deadlineAt: candidate.deadline_at,
      matchedTerms: match.matchedTerms,
      matchedSources: match.matchedSources,
      relevanceScore: match.score,
      bidability: bidabilityFor(match),
      hardRequirements,
      riskFlags,
      missingInfo,
      recommendedAction,
      evidenceText: match.evidenceText || candidate.raw_text || candidate.title,
      wechatSummary: wechatSummaryFor({
        sourceName,
        title: candidate.title,
        url: candidate.url,
        match,
        hardRequirements,
        missingInfo,
        riskFlags,
        recommendedAction,
      }),
      confidence: match.score > 0 ? clamp(match.score / 100, 0.25, 0.9) : 0.2,
    };
  });
};

export const summarizeOpportunityCards = (
  cards: OpportunityCard[],
  fallback = '本次采集没有识别到可入库候选，请调整搜索词或进入公告列表后继续采集。',
) => {
  if (!cards.length) return fallback;
  const strong = cards.filter((card) => card.recommendedAction === 'send_to_group');
  const manual = cards.filter((card) => card.recommendedAction !== 'send_to_group' && card.recommendedAction !== 'ignore');
  const ignored = cards.filter((card) => card.recommendedAction === 'ignore');
  return [
    `本次采集识别到 ${cards.length} 条候选，生成 ${cards.length} 张商机卡片。`,
    strong.length ? `建议发群确认：${strong.length} 条。` : '',
    manual.length ? `待查附件/人工确认：${manual.length} 条。` : '',
    ignored.length ? `低相关可跳过：${ignored.length} 条。` : '',
    ...cards.slice(0, 5).map((card, index) => `${index + 1}. ${card.title}｜${card.matchedTerms.join('、') || '未命中重点产品'}｜${card.relevanceScore}/100｜${actionLabel(card.recommendedAction)}`),
  ].filter(Boolean).join('\n');
};
