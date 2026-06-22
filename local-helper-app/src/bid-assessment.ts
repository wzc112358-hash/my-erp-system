import {
  resolveLLMSettings,
  type LocalLLMConfig,
} from './local-llm-agent.ts';
import type { OpportunityCard, OpportunityRecommendedAction, OpportunityBidability } from './product-knowledge.ts';
import type { CandidateBundle, LocalHelperTask } from './site-harness.ts';

export type OpportunityAssessment = {
  relevanceScore: number;
  bidability: OpportunityBidability;
  hardRequirements: string[];
  riskFlags: string[];
  missingInfo: string[];
  recommendedAction: OpportunityRecommendedAction;
  evidenceText: string;
  wechatSummary: string;
  confidence: number;
};

export type AssessmentInput = {
  task: LocalHelperTask;
  candidate: CandidateBundle['candidates'][number];
  baseCard: OpportunityCard;
};

export type BidAssessor = {
  name: string;
  assess(input: AssessmentInput): Promise<OpportunityCard>;
};

type FetchLike = typeof fetch;

const VALID_BIDABILITY = new Set<OpportunityBidability>([
  'likely_can_do',
  'needs_manual_check',
  'likely_cannot_do',
]);
const VALID_ACTION = new Set<OpportunityRecommendedAction>([
  'send_to_group',
  'deep_read_document',
  'ignore',
  'ask_boss',
  'track_deadline',
]);

const unique = <T>(items: T[]) => [...new Set(items.filter(Boolean))];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const textArray = (value: unknown) => (
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : String(value || '').trim()
      ? [String(value).trim()]
      : []
);

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const firstJsonObject = (content = '') => {
  const withoutFence = content
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
};

export const mergeAssessmentIntoCard = (
  baseCard: OpportunityCard,
  assessment: Partial<OpportunityAssessment> | null | undefined,
): OpportunityCard => {
  if (!assessment) return baseCard;
  const bidability = VALID_BIDABILITY.has(assessment.bidability as OpportunityBidability)
    ? assessment.bidability as OpportunityBidability
    : baseCard.bidability;
  const recommendedAction = VALID_ACTION.has(assessment.recommendedAction as OpportunityRecommendedAction)
    ? assessment.recommendedAction as OpportunityRecommendedAction
    : baseCard.recommendedAction;
  return {
    ...baseCard,
    relevanceScore: Math.round(clamp(asNumber(assessment.relevanceScore, baseCard.relevanceScore), 0, 100)),
    bidability,
    hardRequirements: unique([...baseCard.hardRequirements, ...textArray(assessment.hardRequirements)]).slice(0, 8),
    riskFlags: unique([...baseCard.riskFlags, ...textArray(assessment.riskFlags)]).slice(0, 8),
    missingInfo: unique([...baseCard.missingInfo, ...textArray(assessment.missingInfo)]).slice(0, 8),
    recommendedAction,
    evidenceText: String(assessment.evidenceText || baseCard.evidenceText || '').trim(),
    wechatSummary: String(assessment.wechatSummary || baseCard.wechatSummary || '').trim(),
    confidence: clamp(asNumber(assessment.confidence, baseCard.confidence), 0, 1),
  };
};

export const createDeterministicBidAssessor = (): BidAssessor => ({
  name: 'deterministic-bid-assessor',
  async assess({ baseCard }) {
    return baseCard;
  },
});

const buildAssessmentPrompt = ({ task, candidate, baseCard }: AssessmentInput) => [
  `站点：${task.sourceName}`,
  `任务搜索词：${task.searchTerms || ''}`,
  `候选标题：${candidate.title}`,
  `链接：${candidate.url}`,
  `采购方：${candidate.buyer_name || '待确认'}`,
  `发布日期：${candidate.published_at || '待确认'}`,
  `截止时间：${candidate.deadline_at || '待确认'}`,
  `规则命中产品：${baseCard.matchedTerms.join('、') || '无'}`,
  `规则相关度：${baseCard.relevanceScore}`,
  `页面原文：\n${candidate.raw_text || candidate.title}`,
  `附件线索：\n${(candidate.attachments || []).join('\n') || '无'}`,
  '',
  '请只根据以上文本输出 JSON，不要编造采购方、截止日期、历史价格、资质要求。',
  '字段：relevanceScore(number 0-100), bidability(likely_can_do|needs_manual_check|likely_cannot_do), hardRequirements(string[]), riskFlags(string[]), missingInfo(string[]), recommendedAction(send_to_group|deep_read_document|ignore|ask_boss|track_deadline), evidenceText(string), wechatSummary(string), confidence(number 0-1)。',
].join('\n');

export const createOpenAIBidAssessor = ({
  env = process.env,
  config = null,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
  fetchImpl?: FetchLike;
} = {}): BidAssessor => ({
  name: 'openai-compatible-bid-assessor',

  async assess(input) {
    const { enabled, apiKey, baseUrl, model } = resolveLLMSettings({ env, config });
    if (!enabled || !apiKey || !baseUrl || !model) return input.baseCard;
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '你是恒化成的招投标商机研判助手。你必须谨慎、只基于输入文本、输出严格 JSON。不确定时标记 needs_manual_check。',
          },
          {
            role: 'user',
            content: buildAssessmentPrompt(input),
          },
        ],
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return input.baseCard;
    const parsed = firstJsonObject(String(body?.choices?.[0]?.message?.content || ''));
    return mergeAssessmentIntoCard(input.baseCard, parsed);
  },
});

export const createDefaultBidAssessor = ({
  env = process.env,
  config = null,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
  fetchImpl?: FetchLike;
} = {}) => {
  const settings = resolveLLMSettings({ env, config });
  if (settings.enabled && settings.apiKey) return createOpenAIBidAssessor({ env, config, fetchImpl });
  return createDeterministicBidAssessor();
};

export const assessOpportunityCards = async ({
  task,
  bundle,
  cards,
  assessor = createDeterministicBidAssessor(),
}: {
  task: LocalHelperTask;
  bundle: CandidateBundle | null | undefined;
  cards: OpportunityCard[];
  assessor?: BidAssessor;
}) => {
  const candidates = bundle?.candidates || [];
  const assessed: OpportunityCard[] = [];
  for (const [index, baseCard] of cards.entries()) {
    const candidate = candidates[index];
    if (!candidate) {
      assessed.push(baseCard);
      continue;
    }
    assessed.push(await assessor.assess({ task, candidate, baseCard }).catch(() => baseCard));
  }
  return assessed;
};
