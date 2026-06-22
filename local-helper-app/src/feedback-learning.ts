import {
  applyOpportunityFeedback,
  feedbackLabel,
  feedbackWeightDeltaFor,
  type OpportunityCard,
  type OpportunityFeedbackInput,
  type OpportunityFeedbackStatus,
  type ProductTerm,
} from './product-knowledge.ts';

export type FeedbackLearnedTerm = {
  term: string;
  weightDelta: number;
  positiveCount: number;
  negativeCount: number;
  askBossCount: number;
  sourceNames: string[];
  lastStatus: OpportunityFeedbackStatus;
  lastFeedbackAt: string;
};

export type FeedbackNoticeRecord = {
  key: string;
  title: string;
  url: string;
  sourceName: string;
  status: OpportunityFeedbackStatus;
  note: string;
  matchedTerms: string[];
  weightDelta: number;
  feedbackSource: 'employee' | 'system';
  updatedAt: string;
};

export type FeedbackLearningState = {
  version: 1;
  updatedAt: string;
  terms: Record<string, FeedbackLearnedTerm>;
  notices: Record<string, FeedbackNoticeRecord>;
  recent: FeedbackNoticeRecord[];
};

export type FeedbackLearningSummary = {
  updatedAt: string;
  termCount: number;
  noticeCount: number;
  positiveCount: number;
  negativeCount: number;
  topPositiveTerms: Array<{ term: string; weightDelta: number; count: number }>;
  topNegativeTerms: Array<{ term: string; weightDelta: number; count: number }>;
  recent: FeedbackNoticeRecord[];
};

const MAX_RECENT_RECORDS = 300;
const MAX_NOTICE_RECORDS = 800;
const MAX_WEIGHT_DELTA = 80;
const MIN_WEIGHT_DELTA = -120;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const unique = <T>(items: T[]) => [...new Set(items.filter(Boolean))];
const normalize = (value = '') => value.normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();

export const createEmptyFeedbackLearning = (): FeedbackLearningState => ({
  version: 1,
  updatedAt: '',
  terms: {},
  notices: {},
  recent: [],
});

export const noticeKeyForOpportunity = (card: Pick<OpportunityCard, 'sourceName' | 'url' | 'title'>) => (
  normalize(`${card.sourceName || ''}|${card.url || ''}|${card.title || ''}`).slice(0, 260)
);

const normalizeRecord = (record: Partial<FeedbackNoticeRecord> = {}): FeedbackNoticeRecord => ({
  key: String(record.key || ''),
  title: String(record.title || ''),
  url: String(record.url || ''),
  sourceName: String(record.sourceName || ''),
  status: record.status as OpportunityFeedbackStatus,
  note: String(record.note || ''),
  matchedTerms: unique((record.matchedTerms || []).map((term) => String(term || '').trim())),
  weightDelta: Number(record.weightDelta || 0),
  feedbackSource: record.feedbackSource === 'system' ? 'system' : 'employee',
  updatedAt: String(record.updatedAt || ''),
});

const normalizeTerm = (term: Partial<FeedbackLearnedTerm> = {}): FeedbackLearnedTerm => ({
  term: String(term.term || ''),
  weightDelta: clamp(Number(term.weightDelta || 0), MIN_WEIGHT_DELTA, MAX_WEIGHT_DELTA),
  positiveCount: Math.max(0, Number(term.positiveCount || 0)),
  negativeCount: Math.max(0, Number(term.negativeCount || 0)),
  askBossCount: Math.max(0, Number(term.askBossCount || 0)),
  sourceNames: unique((term.sourceNames || []).map((sourceName) => String(sourceName || '').trim())).slice(0, 20),
  lastStatus: term.lastStatus as OpportunityFeedbackStatus,
  lastFeedbackAt: String(term.lastFeedbackAt || ''),
});

export const normalizeFeedbackLearningState = (
  state: Partial<FeedbackLearningState> | null | undefined,
): FeedbackLearningState => {
  if (!state || typeof state !== 'object') return createEmptyFeedbackLearning();
  const terms = Object.fromEntries(
    Object.entries(state.terms || {})
      .map(([key, value]) => [key, normalizeTerm(value)])
      .filter(([, value]) => Boolean((value as FeedbackLearnedTerm).term)),
  );
  const recent = (state.recent || [])
    .map(normalizeRecord)
    .filter((record) => record.key && record.status)
    .slice(0, MAX_RECENT_RECORDS);
  const noticeEntries = Object.entries(state.notices || {})
    .map(([key, value]) => [key, normalizeRecord(value)])
    .filter(([, value]) => Boolean((value as FeedbackNoticeRecord).key && (value as FeedbackNoticeRecord).status))
    .slice(-MAX_NOTICE_RECORDS);
  return {
    version: 1,
    updatedAt: String(state.updatedAt || recent[0]?.updatedAt || ''),
    terms,
    notices: Object.fromEntries(noticeEntries),
    recent,
  };
};

const feedbackBucketsFor = (status: OpportunityFeedbackStatus) => ({
  positiveCount: ['valuable', 'sent_to_group', 'followed_up'].includes(status) ? 1 : 0,
  negativeCount: status === 'irrelevant' ? 1 : 0,
  askBossCount: status === 'ask_boss' ? 1 : 0,
});

const sourcesForTerm = (term: ProductTerm, adjustedWeight: number, stat: FeedbackLearnedTerm) => unique([
  ...(term.sources || []),
  term.source || '',
  stat.positiveCount ? 'feedback_positive' : '',
  adjustedWeight < 0 ? 'feedback_negative' : '',
  stat.negativeCount && adjustedWeight >= 0 ? 'feedback_adjusted' : '',
]);

export const applyFeedbackLearningToTerms = (
  terms: ProductTerm[],
  state: Partial<FeedbackLearningState> | null | undefined,
): ProductTerm[] => {
  const learning = normalizeFeedbackLearningState(state);
  const handled = new Set<string>();
  const adjusted = terms.map((term) => {
    const key = term.term;
    const stat = learning.terms[key];
    if (!stat) return term;
    handled.add(key);
    const nextWeight = clamp(Number(term.weight ?? 50) + stat.weightDelta, -60, 100);
    return {
      ...term,
      weight: nextWeight,
      sources: sourcesForTerm(term, nextWeight, stat),
      notes: [term.notes, `本地反馈学习：${stat.weightDelta > 0 ? '+' : ''}${stat.weightDelta}`].filter(Boolean).join('；'),
    };
  });

  const learnedOnly = Object.values(learning.terms)
    .filter((stat) => !handled.has(stat.term))
    .map((stat): ProductTerm => {
      const weight = clamp(50 + stat.weightDelta, -60, 90);
      return {
        term: stat.term,
        aliases: [],
        sources: unique([
          stat.positiveCount ? 'feedback_positive' : '',
          weight < 0 ? 'feedback_negative' : '',
          weight >= 0 && stat.negativeCount ? 'feedback_adjusted' : '',
        ]),
        weight,
        status: 'active',
        notes: `本地反馈学习：${stat.weightDelta > 0 ? '+' : ''}${stat.weightDelta}`,
      };
    });

  return [...adjusted, ...learnedOnly];
};

export const learnFromOpportunityFeedback = (
  state: Partial<FeedbackLearningState> | null | undefined,
  card: OpportunityCard,
  feedback: OpportunityFeedbackInput,
): FeedbackLearningState => {
  const current = normalizeFeedbackLearningState(state);
  const updatedAt = feedback.updatedAt || card.feedbackUpdatedAt || new Date().toISOString();
  const status = feedback.status;
  const weightDelta = feedbackWeightDeltaFor(status);
  const record = normalizeRecord({
    key: noticeKeyForOpportunity(card),
    title: card.title,
    url: card.url,
    sourceName: card.sourceName,
    status,
    note: feedback.note || card.feedbackNote || '',
    matchedTerms: card.matchedTerms || [],
    weightDelta,
    feedbackSource: feedback.source || 'employee',
    updatedAt,
  });
  const nextTerms = { ...current.terms };
  const buckets = feedbackBucketsFor(status);

  for (const term of record.matchedTerms) {
    const existing = nextTerms[term] || normalizeTerm({ term });
    nextTerms[term] = {
      ...existing,
      term,
      weightDelta: clamp(existing.weightDelta + weightDelta, MIN_WEIGHT_DELTA, MAX_WEIGHT_DELTA),
      positiveCount: existing.positiveCount + buckets.positiveCount,
      negativeCount: existing.negativeCount + buckets.negativeCount,
      askBossCount: existing.askBossCount + buckets.askBossCount,
      sourceNames: unique([record.sourceName, ...existing.sourceNames]).slice(0, 20),
      lastStatus: status,
      lastFeedbackAt: updatedAt,
    };
  }

  const notices = {
    ...current.notices,
    [record.key]: record,
  };
  const noticeEntries = Object.values(notices)
    .sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)))
    .slice(-MAX_NOTICE_RECORDS);
  const recent = [
    record,
    ...current.recent.filter((item) => item.key !== record.key),
  ].slice(0, MAX_RECENT_RECORDS);

  return {
    version: 1,
    updatedAt,
    terms: nextTerms,
    notices: Object.fromEntries(noticeEntries.map((item) => [item.key, item])),
    recent,
  };
};

export const applyFeedbackLearningToOpportunityCards = (
  cards: OpportunityCard[],
  state: Partial<FeedbackLearningState> | null | undefined,
): OpportunityCard[] => {
  const learning = normalizeFeedbackLearningState(state);
  return cards.map((card) => {
    if (card.feedbackStatus) return card;
    const record = learning.notices[noticeKeyForOpportunity(card)];
    if (!record) return card;
    return applyOpportunityFeedback(card, {
      status: record.status,
      note: `命中过往员工反馈：${feedbackLabel(record.status)}${record.note ? `，${record.note}` : ''}`,
      updatedAt: record.updatedAt,
      source: 'system',
    });
  });
};

export const summarizeFeedbackLearning = (
  state: Partial<FeedbackLearningState> | null | undefined,
): FeedbackLearningSummary => {
  const learning = normalizeFeedbackLearningState(state);
  const terms = Object.values(learning.terms);
  const notices = Object.values(learning.notices);
  const positiveCount = notices.filter((record) => record.status !== 'irrelevant').length;
  const negativeCount = notices.filter((record) => record.status === 'irrelevant').length;
  const byPositive = [...terms]
    .filter((term) => term.weightDelta > 0)
    .sort((left, right) => right.weightDelta - left.weightDelta)
    .slice(0, 8)
    .map((term) => ({ term: term.term, weightDelta: term.weightDelta, count: term.positiveCount + term.askBossCount }));
  const byNegative = [...terms]
    .filter((term) => term.weightDelta < 0)
    .sort((left, right) => left.weightDelta - right.weightDelta)
    .slice(0, 8)
    .map((term) => ({ term: term.term, weightDelta: term.weightDelta, count: term.negativeCount }));
  return {
    updatedAt: learning.updatedAt,
    termCount: terms.length,
    noticeCount: notices.length,
    positiveCount,
    negativeCount,
    topPositiveTerms: byPositive,
    topNegativeTerms: byNegative,
    recent: learning.recent.slice(0, 10),
  };
};
