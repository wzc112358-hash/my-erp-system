import {
  callOpenAICompatibleChatCompletion,
  resolveLLMSettings,
  type LocalLLMConfig,
} from './client.ts';
import type { ScreenedNotice, ScreeningAction, BidEligibility } from '../domain/tender-screening.ts';
import type { CandidateBundle, LocalHelperTask } from '../browser/types.ts';

export type NoticeAssessment = {
  relevanceScore: number;
  matchedTerms?: string[];
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
  task: LocalHelperTask;
  candidate: CandidateBundle['candidates'][number];
  baseCard: ScreenedNotice;
};

export type BidAssessor = {
  name: string;
  assess(input: AssessmentInput): Promise<ScreenedNotice>;
  assessBatch?(inputs: AssessmentInput[]): Promise<ScreenedNotice[]>;
};

type FetchLike = typeof fetch;

const VALID_BIDABILITY = new Set<BidEligibility>([
  'likely_can_do',
  'needs_manual_check',
  'likely_cannot_do',
]);
const VALID_ACTION = new Set<ScreeningAction>([
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
  return {
    ...baseCard,
    relevanceScore: Math.round(clamp(asNumber(assessment.relevanceScore, baseCard.relevanceScore), 0, 100)),
    matchedTerms: unique([...baseCard.matchedTerms, ...textArray(assessment.matchedTerms)]).slice(0, 12),
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
  `当前时间：${new Date().toISOString()}（业务时区为 Asia/Shanghai）；已截止公告必须 ignore。`,
  '评标/招标结果、中标/成交结果、采购结果和候选人公示不是当前可投商机，必须 ignore。',
  '1. 每条相关商机必须优先确认截止/开标/报价时间。',
  '2. 常做产品命中后，继续确认是否接受代理商、是否限制生产商/制造商、是否要授权。',
  '3. 必查第三方检测/质检单/业绩/8 位码/准入/危化资质/运输/包装回收等硬性条件。',
  '4. 王总点名或强相关产品，需要整理规格、技术参数、装置/用途、历史中标公示/价格和操作人员自我评定。',
  '5. 不确定就输出 needs_manual_check，并把 missingInfo 写清楚。',
  '',
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
  '字段：relevanceScore(number 0-100), matchedTerms(string[]), bidability(likely_can_do|needs_manual_check|likely_cannot_do), hardRequirements(string[]), riskFlags(string[]), missingInfo(string[]), recommendedAction(send_to_group|deep_read_document|ignore|ask_boss|track_deadline), evidenceText(string), wechatSummary(string), confidence(number 0-1)。',
].join('\n');

const buildBatchAssessmentPrompt = (inputs: AssessmentInput[]) => [
  '你要批量筛选恒化成今天抓到的招投标公告。必须对每个 index 返回一条判断，不能漏项。',
  `当前时间：${new Date().toISOString()}（业务时区为 Asia/Shanghai）。截止时间早于当前时间的公告必须 ignore。`,
  '筛出化工原料、油品、助剂、水处理剂、催化剂及公司可能经营的新化工产品。',
  '机械设备、工程施工、咨询服务、办公用品、废物销售/处置、采购结果和中标公示通常应 ignore。',
  '不要只依赖规则命中；规则未命中但标题明显是化工产品时也应保留。',
  '不得编造正文没有的截止时间、规格、资质和历史价格；缺失内容写入 missingInfo。',
  '返回严格 JSON：{"items":[{"index":0,"relevanceScore":0,"matchedTerms":[],"bidability":"likely_cannot_do","hardRequirements":[],"riskFlags":[],"missingInfo":[],"recommendedAction":"ignore","evidenceText":"...","wechatSummary":"...","confidence":0.9}]}。',
  `items 数量必须等于 ${inputs.length}，index 必须覆盖 0 到 ${Math.max(0, inputs.length - 1)}。`,
  '',
  ...inputs.map(({ task, candidate, baseCard }, index) => [
    `--- index ${index} ---`,
    `站点：${task.sourceName}`,
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
  '从以下公告中只挑出“当前仍可参与的化工产品采购”。只返回真正可能相关的 index，不要逐条解释。',
  '化工原料、油品、助剂、水处理剂、催化剂和新化工材料可以保留。设备、阀门、泵、工程、服务、办公用品、废物处置全部排除。',
  '评标/招标结果、中标/成交结果、采购结果、候选人公示和已经截止的公告全部排除。项目名称或采购方含化工词，但实际采购对象是设备或服务时必须排除。',
  `当前时间：${new Date().toISOString()}，业务时区 Asia/Shanghai。`,
  '只返回严格 JSON：{"matches":[{"index":0,"matchedTerms":["产品名"],"reason":"采购对象是化工产品","confidence":0.9}]}。没有匹配时返回 {"matches":[]}。',
  '',
  ...inputs.map(({ candidate, baseCard }, index) => [
    `${index}. ${candidate.title}`,
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

  async assessBatch(inputs) {
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
    const selectedIndexes = inputs
      .map((input, index) => (
        input.baseCard.recommendedAction !== 'ignore' || screened.has(index) ? index : -1
      ))
      .filter((index) => index >= 0);
    if (!selectedIndexes.length) return inputs.map((input) => input.baseCard);

    const selectedInputs = selectedIndexes.map((index) => {
      const input = inputs[index];
      const screen = screened.get(index);
      if (!screen) return input;
      return {
        ...input,
        baseCard: mergeAssessmentIntoCard(input.baseCard, {
          relevanceScore: Math.max(input.baseCard.relevanceScore, 60),
          matchedTerms: screen.matchedTerms,
          bidability: 'needs_manual_check',
          recommendedAction: 'deep_read_document',
          evidenceText: screen.reason || input.baseCard.evidenceText,
          confidence: screen.confidence,
        }),
      };
    });
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
          content: buildBatchAssessmentPrompt(selectedInputs),
        },
      ],
    });
    const assessments = batchAssessmentsFrom(detailResult.content, selectedInputs.length);
    const assessedByOriginalIndex = new Map<number, ScreenedNotice>();
    selectedIndexes.forEach((originalIndex, selectedIndex) => {
      assessedByOriginalIndex.set(
        originalIndex,
        mergeAssessmentIntoCard(selectedInputs[selectedIndex].baseCard, assessments.get(selectedIndex)),
      );
    });
    return inputs.map((input, index) => assessedByOriginalIndex.get(index) || input.baseCard);
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
}: {
  task: LocalHelperTask;
  bundle: CandidateBundle | null | undefined;
  cards: ScreenedNotice[];
  assessor?: BidAssessor;
}) => {
  const candidates = bundle?.candidates || [];
  const inputs = cards
    .map((baseCard, index) => candidates[index]
      ? { task, candidate: candidates[index], baseCard }
      : null)
    .filter((input): input is AssessmentInput => Boolean(input));
  if (assessor.assessBatch && inputs.length === cards.length) {
    try {
      const batch: ScreenedNotice[] = [];
      for (let index = 0; index < inputs.length; index += 40) {
        batch.push(...await assessor.assessBatch(inputs.slice(index, index + 40)));
      }
      if (batch.length === cards.length) return batch;
    } catch {
      // Keep the conservative per-item fallback when a provider rejects or truncates the batch.
    }
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
  return assessed;
};
