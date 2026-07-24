import {
  callOpenAICompatibleChatCompletion,
  resolveLLMSettings,
  type LocalLLMConfig,
} from './client.ts';
import {
  enforcePromotedProductEvidence,
  enforceScreenedNoticeConstraints,
  type BusinessRelevance,
  type ScreenedNotice,
  type ScreeningAction,
  type BidEligibility,
} from '../domain/tender-screening.ts';
import type { CandidateBundle, PublicCollectionTask } from '../domain/collection.ts';
import { definitionFor } from '../sites/registry.ts';

export type NoticeAssessment = {
  relevanceScore: number;
  matchedTerms?: string[];
  businessRelevance?: BusinessRelevance;
  bidability: BidEligibility;
  hardRequirements: string[];
  riskFlags: string[];
  missingInfo: string[];
  recommendedAction: ScreeningAction;
  evidenceText: string;
  wechatSummary: string;
  confidence: number;
};

export type AssessmentInput = {
  task: PublicCollectionTask;
  candidate: CandidateBundle['candidates'][number];
  baseCard: ScreenedNotice;
};

export type BidAssessor = {
  name: string;
  assess(input: AssessmentInput): Promise<ScreenedNotice>;
  screenBatch?(inputs: AssessmentInput[]): Promise<ScreenedNotice[]>;
  assessBatch?(inputs: AssessmentInput[]): Promise<ScreenedNotice[]>;
};

type FetchLike = typeof fetch;

const VALID_BIDABILITY = new Set<BidEligibility>([
  'likely_can_do',
  'needs_manual_check',
  'likely_cannot_do',
]);
const VALID_ACTION = new Set<ScreeningAction>([
  'prioritize',
  'deep_read',
  'ignore',
  'manual_review',
  'track_deadline',
]);
const VALID_BUSINESS_RELEVANCE = new Set<BusinessRelevance>([
  'known_product',
  'potential_product',
  'irrelevant',
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
  baseCard: ScreenedNotice,
  assessment: Partial<NoticeAssessment> | null | undefined,
): ScreenedNotice => {
  if (!assessment) return baseCard;
  const bidability = VALID_BIDABILITY.has(assessment.bidability as BidEligibility)
    ? assessment.bidability as BidEligibility
    : baseCard.bidability;
  const recommendedAction = VALID_ACTION.has(assessment.recommendedAction as ScreeningAction)
    ? assessment.recommendedAction as ScreeningAction
    : baseCard.recommendedAction;
  const rawRelevanceScore = asNumber(assessment.relevanceScore, baseCard.relevanceScore);
  const relevanceScore = rawRelevanceScore > 0 && rawRelevanceScore <= 1 && recommendedAction !== 'ignore'
    ? rawRelevanceScore * 100
    : rawRelevanceScore;
  const assessmentTerms = textArray(assessment.matchedTerms);
  const baseBusinessRelevance = baseCard.businessRelevance
    || (baseCard.matchedTerms.length ? 'known_product' : 'irrelevant');
  const businessRelevance = VALID_BUSINESS_RELEVANCE.has(assessment.businessRelevance as BusinessRelevance)
    ? assessment.businessRelevance as BusinessRelevance
    : baseBusinessRelevance !== 'irrelevant'
      ? baseBusinessRelevance
      : recommendedAction !== 'ignore' && assessmentTerms.length
        ? 'potential_product'
        : 'irrelevant';
  return {
    ...baseCard,
    relevanceScore: Math.round(clamp(relevanceScore, 0, 100)),
    matchedTerms: unique([...baseCard.matchedTerms, ...assessmentTerms]).slice(0, 12),
    businessRelevance,
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
  '恒化成招投标判断要求：',
  `当前时间：${new Date().toISOString()}（业务时区为 Asia/Shanghai）；已截止公告的 recommendedAction 必须为 ignore，但仍需独立判断业务相关性。`,
  '评标/招标结果、中标/成交结果、采购结果和候选人公示不是当前可投商机，必须 ignore。',
  '先判断采购对象是否是公司可经营的化工产品，再判断当前能否参与；这两个结论不得混为一谈。',
  '旧产品词库未命中，但正文明确采购化工原料、油品、助剂、水处理剂、催化剂或新化工材料时，businessRelevance 必须为 potential_product，不得只因“不是重点词”而 ignore。',
  '1. 每条相关商机必须优先确认截止/开标/报价时间。',
  '2. 常做产品命中后，继续确认是否接受代理商、是否限制生产商/制造商、是否要授权。',
  '3. 必查第三方检测/质检单/业绩/8 位码/准入/危化资质/运输/包装回收等硬性条件。',
  '4. 王总点名或强相关产品，需要整理规格、技术参数、装置/用途、历史中标公示/价格和操作人员自我评定。',
  '5. 不确定就输出 needs_manual_check，并把 missingInfo 写清楚。',
  '',
  `站点：${task.sourceName}`,
  `站点专项要求：${definitionFor(task.sourceName).llmExtractionHint}`,
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
  '字段：relevanceScore(number 0-100), matchedTerms(string[]), businessRelevance(known_product|potential_product|irrelevant), bidability(likely_can_do|needs_manual_check|likely_cannot_do), hardRequirements(string[]), riskFlags(string[]), missingInfo(string[]), recommendedAction(prioritize|deep_read|ignore|manual_review|track_deadline), evidenceText(string), wechatSummary(string), confidence(number 0-1)。',
].join('\n');

const buildBatchAssessmentPrompt = (inputs: AssessmentInput[]) => [
  '你要批量筛选恒化成今天抓到的招投标公告。必须对每个 index 返回一条判断，不能漏项。',
  `当前时间：${new Date().toISOString()}（业务时区为 Asia/Shanghai）。截止时间早于当前时间的公告，其 recommendedAction 必须 ignore，但 businessRelevance 仍应按采购产品独立判断。`,
  '筛出化工原料、油品、助剂、水处理剂、催化剂及公司可能经营的新化工产品。',
  '机械设备、工程施工、咨询服务、办公用品、废物销售/处置、采购结果和中标公示通常应 ignore。',
  '不要只依赖规则命中；规则未命中但标题或正文明确是化工产品时，标为 potential_product 并保留供人工复核。不得因为未命中旧产品词库就判为 irrelevant。',
  '不得编造正文没有的截止时间、规格、资质和历史价格；缺失内容写入 missingInfo。',
  '返回严格 JSON：{"items":[{"index":0,"relevanceScore":0,"matchedTerms":[],"businessRelevance":"irrelevant","bidability":"likely_cannot_do","hardRequirements":[],"riskFlags":[],"missingInfo":[],"recommendedAction":"ignore","evidenceText":"...","wechatSummary":"...","confidence":0.9}]}。',
  `items 数量必须等于 ${inputs.length}，index 必须覆盖 0 到 ${Math.max(0, inputs.length - 1)}。`,
  '',
  ...inputs.map(({ task, candidate, baseCard }, index) => [
    `--- index ${index} ---`,
    `站点：${task.sourceName}`,
    `站点专项要求：${definitionFor(task.sourceName).llmExtractionHint}`,
    `任务产品范围：${task.searchTerms || '未提供'}`,
    `标题：${candidate.title}`,
    `采购方：${candidate.buyer_name || '待确认'}`,
    `发布日期：${candidate.published_at || '待确认'}`,
    `截止：${candidate.deadline_at || '待确认'}`,
    `规则命中：${baseCard.matchedTerms.join('、') || '无'}`,
    `原文：${String(candidate.raw_text || candidate.title).replace(/\s+/g, ' ').slice(0, 900)}`,
  ].join('\n')),
].join('\n');

const buildBatchScreenPrompt = (inputs: AssessmentInput[]) => [
  '从以下公告中挑出“与化工产品经营相关的采购”。只返回真正可能相关的 index，不要逐条解释。',
  '化工原料、油品、助剂、水处理剂、催化剂和新化工材料可以保留。设备、阀门、泵、工程、服务、办公用品、废物处置全部排除。',
  '评标/招标结果、中标/成交结果、采购结果和候选人公示全部排除。已经截止但产品相关的采购仍可保留为可关注信息，并在 reason 中注明已截止。项目名称或采购方含化工词，但实际采购对象是设备或服务时必须排除。',
  '旧词库没有的明确化工产品也要保留为新化工产品，不能仅因“未命中重点产品词”排除。',
  `当前时间：${new Date().toISOString()}，业务时区 Asia/Shanghai。`,
  '只返回严格 JSON：{"matches":[{"index":0,"matchedTerms":["产品名"],"reason":"采购对象是化工产品","confidence":0.9}]}。没有匹配时返回 {"matches":[]}。',
  '',
  ...inputs.map(({ task, candidate, baseCard }, index) => [
    `${index}. ${candidate.title}`,
    `站点专项要求：${definitionFor(task.sourceName).llmExtractionHint}`,
    `截止：${candidate.deadline_at || '待确认'}；规则命中：${baseCard.matchedTerms.join('、') || '无'}；摘要：${String(candidate.raw_text || '').replace(/\s+/g, ' ').slice(0, 260)}`,
  ].join('\n')),
].join('\n');

type BatchScreenMatch = {
  index: number;
  matchedTerms: string[];
  reason: string;
  confidence: number;
};

const batchScreenMatchesFrom = (content: string, expectedCount: number) => {
  const parsed = firstJsonObject(content);
  const matches = Array.isArray(parsed?.matches) ? parsed.matches : [];
  const byIndex = new Map<number, BatchScreenMatch>();
  for (const match of matches) {
    const index = Number(match?.index);
    if (!Number.isInteger(index) || index < 0 || index >= expectedCount || byIndex.has(index)) continue;
    byIndex.set(index, {
      index,
      matchedTerms: textArray(match?.matchedTerms).slice(0, 8),
      reason: String(match?.reason || '').trim(),
      confidence: clamp(asNumber(match?.confidence, 0.6), 0, 1),
    });
  }
  return byIndex;
};

const batchAssessmentsFrom = (content: string, expectedCount: number) => {
  const parsed = firstJsonObject(content);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length !== expectedCount) throw new Error('LLM batch assessment returned incomplete items');
  const byIndex = new Map<number, Partial<NoticeAssessment>>();
  for (const item of items) {
    const index = Number(item?.index);
    if (!Number.isInteger(index) || index < 0 || index >= expectedCount || byIndex.has(index)) {
      throw new Error('LLM batch assessment returned invalid indexes');
    }
    byIndex.set(index, item as Partial<NoticeAssessment>);
  }
  if (byIndex.size !== expectedCount) throw new Error('LLM batch assessment did not cover every candidate');
  return byIndex;
};

const shouldSkipLLMAssessment = (card: ScreenedNotice) => (
  card.relevanceScore <= 0 &&
  card.matchedTerms.length === 0 &&
  card.recommendedAction === 'ignore'
);

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
    const result = await callOpenAICompatibleChatCompletion({
      env,
      config,
      fetchImpl,
      temperature: 0.1,
      responseFormatJson: true,
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
    });
    const parsed = firstJsonObject(result.content);
    return mergeAssessmentIntoCard(input.baseCard, parsed);
  },

  async screenBatch(inputs) {
    if (!inputs.length) return [];
    const { enabled, apiKey, baseUrl, model } = resolveLLMSettings({ env, config });
    if (!enabled || !apiKey || !baseUrl || !model) return inputs.map((input) => input.baseCard);
    const screenResult = await callOpenAICompatibleChatCompletion({
      env,
      config,
      fetchImpl,
      temperature: 0,
      maxTokens: 2200,
      responseFormatJson: true,
      messages: [
        {
          role: 'system',
          content: '你是化工 B2B 招投标公告初筛 Agent。宁可少选，不得把设备、工程、服务和结果公告当成化工产品采购。',
        },
        {
          role: 'user',
          content: buildBatchScreenPrompt(inputs),
        },
      ],
    });
    const screened = batchScreenMatchesFrom(screenResult.content, inputs.length);
    return inputs.map((input, index) => {
      const screen = screened.get(index);
      if (!screen) return input.baseCard;
      return mergeAssessmentIntoCard(input.baseCard, {
        relevanceScore: Math.max(input.baseCard.relevanceScore, 60),
        matchedTerms: screen.matchedTerms,
        bidability: 'needs_manual_check',
        recommendedAction: 'deep_read',
        evidenceText: screen.reason || input.baseCard.evidenceText,
        confidence: screen.confidence,
      });
    });
  },

  async assessBatch(inputs) {
    if (!inputs.length) return [];
    const { enabled, apiKey, baseUrl, model } = resolveLLMSettings({ env, config });
    if (!enabled || !apiKey || !baseUrl || !model) return inputs.map((input) => input.baseCard);
    const detailResult = await callOpenAICompatibleChatCompletion({
      env,
      config,
      fetchImpl,
      temperature: 0,
      responseFormatJson: true,
      messages: [
        {
          role: 'system',
          content: '你是化工 B2B 招投标信息筛选 Agent。严格输出 JSON，逐条判断，不遗漏，不编造。',
        },
        {
          role: 'user',
          content: buildBatchAssessmentPrompt(inputs),
        },
      ],
    });
    const assessments = batchAssessmentsFrom(detailResult.content, inputs.length);
    return inputs.map((input, index) => (
      mergeAssessmentIntoCard(input.baseCard, assessments.get(index))
    ));
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

export const assessScreenedNotices = async ({
  task,
  bundle,
  cards,
  assessor = createDeterministicBidAssessor(),
  mode = 'detail',
}: {
  task: PublicCollectionTask;
  bundle: CandidateBundle | null | undefined;
  cards: ScreenedNotice[];
  assessor?: BidAssessor;
  mode?: 'screen' | 'detail';
}) => {
  const candidates = bundle?.candidates || [];
  const inputs = cards
    .map((baseCard, index) => candidates[index]
      ? { task, candidate: candidates[index], baseCard }
      : null)
    .filter((input): input is AssessmentInput => Boolean(input));
  const enforceConstraints = (assessed: ScreenedNotice[]) => assessed.map((card, index) => {
    const candidate = candidates[index];
    if (!candidate) return card;
    const evidenced = enforcePromotedProductEvidence({
      candidate,
      baseCard: cards[index] || card,
      assessedCard: card,
    });
    return enforceScreenedNoticeConstraints({ candidate, card: evidenced });
  });
  const batchAssessor = mode === 'screen'
    ? assessor.screenBatch || assessor.assessBatch
    : assessor.assessBatch;
  if (batchAssessor && inputs.length === cards.length) {
    const batch: ScreenedNotice[] = [];
    const chunkSize = mode === 'screen' ? 30 : 30;
    for (let index = 0; index < inputs.length; index += chunkSize) {
      const chunk = inputs.slice(index, index + chunkSize);
      try {
        const assessedChunk = await batchAssessor.call(assessor, chunk);
        batch.push(...(assessedChunk.length === chunk.length
          ? assessedChunk
          : chunk.map((input) => input.baseCard)));
      } catch {
        // A failed batch stays deterministic. Retrying every item would turn
        // one provider timeout into an unbounded request fan-out.
        batch.push(...chunk.map((input) => input.baseCard));
      }
    }
    return enforceConstraints(batch);
  }
  const assessed: ScreenedNotice[] = [];
  for (const [index, baseCard] of cards.entries()) {
    const candidate = candidates[index];
    if (!candidate) {
      assessed.push(baseCard);
      continue;
    }
    if (shouldSkipLLMAssessment(baseCard)) {
      assessed.push(baseCard);
      continue;
    }
    assessed.push(await assessor.assess({ task, candidate, baseCard }).catch(() => baseCard));
  }
  return enforceConstraints(assessed);
};
