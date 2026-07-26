import type {
  BidDraftExtractor,
  DraftFieldName,
  ExtractedBidDraft,
} from '../application/bid-preparation.ts';
import { callOpenAICompatibleChatCompletion } from './client.ts';

type FetchLike = typeof fetch;

const firstJsonObject = (content = '') => {
  const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const allowedFields = new Set<DraftFieldName>([
  'biddingCompany',
  'biddingNo',
  'productName',
  'quantity',
  'quantityUnit',
  'specification',
  'purity',
  'packaging',
  'quotedUnitPrice',
  'quotedTotalAmount',
  'currency',
  'tenderFee',
  'bidBond',
  'openDate',
  'qualificationSnapshot',
  'remark',
]);

const normalizeResult = (parsed: Record<string, unknown> | null): ExtractedBidDraft => {
  if (!parsed) return { warnings: ['LLM 没有返回可用的投标字段。'] };
  const rawFields = parsed.fields && typeof parsed.fields === 'object'
    ? parsed.fields as Record<string, unknown>
    : {};
  const rawEvidence = parsed.evidence && typeof parsed.evidence === 'object'
    ? parsed.evidence as Record<string, unknown>
    : {};
  const fields = Object.fromEntries(
    Object.entries(rawFields).filter(([key]) => allowedFields.has(key as DraftFieldName)),
  ) as ExtractedBidDraft;
  const evidence = Object.fromEntries(
    Object.entries(rawEvidence)
      .filter(([key, value]) => allowedFields.has(key as DraftFieldName) && String(value || '').trim())
      .map(([key, value]) => [key, String(value).trim()]),
  ) as Partial<Record<DraftFieldName, string>>;
  return {
    ...fields,
    evidence,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.map(String).filter(Boolean).slice(0, 8)
      : [],
  };
};

export const createBidDraftExtractor = ({
  env = process.env,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
} = {}): BidDraftExtractor => ({
  async extract({ notice }) {
    const assessment = notice.assessment;
    const result = await callOpenAICompatibleChatCompletion({
      env,
      fetchImpl,
      temperature: 0,
      maxTokens: 2_200,
      responseFormatJson: true,
      messages: [
        {
          role: 'system',
          content: '你是化工 B2B 投标准备助手。只提取公告明确事实，绝不编造，绝不把历史项目的金额或日期复制到当前项目。',
        },
        {
          role: 'user',
          content: [
            '请从当前公告生成“投标草稿建议字段”。字段没有明确证据时不要输出。',
            '严格规则：',
            '1. 每个非空字段必须在 evidence 中提供当前公告的短原文；不得引用历史投标。',
            '2. openDate 只有原文明示“开标时间”才输出，投标/报价/报名截止时间不能代替开标时间。',
            '3. quotedUnitPrice/quotedTotalAmount 只代表我方当前报价；公告的限价、预算、控制价不能当作我方报价，因此通常留空。',
            '4. tenderFee 和 bidBond 只在公告明确写出当前项目金额时输出。',
            '5. quantity 只输出数字，quantityUnit 单独输出；未知则都留空。',
            '6. currency 只在原文明确人民币、美元、欧元或币种符号时输出 CNY/USD/EUR。',
            '7. qualificationSnapshot 不自动判断公司已满足的资质，留空交给员工确认。',
            '8. remark 不写泛化总结，留空。',
            '',
            '只返回严格 JSON：',
            '{"fields":{"biddingCompany":"","biddingNo":"","productName":"","quantity":0,"quantityUnit":"","specification":"","purity":"","packaging":"","quotedUnitPrice":0,"quotedTotalAmount":0,"currency":"","tenderFee":0,"bidBond":0,"openDate":"YYYY-MM-DD HH:mm:ss","qualificationSnapshot":[],"remark":""},"evidence":{"字段名":"当前公告原文"},"warnings":[]}',
            '请删除未知字段，不要用 0、待确认、未知占位。',
            '',
            `站点：${notice.sourceName}`,
            `标题：${notice.title}`,
            `采购方：${notice.buyerName || ''}`,
            `当前截止时间：${notice.deadlineAt || ''}`,
            `产品研判：${assessment?.productSummary || notice.matchedProducts.join('、')}`,
            `数量研判：${assessment?.quantity || ''}`,
            `规格研判：${(assessment?.specifications || []).join('；')}`,
            `商务研判：${(assessment?.commercialTerms || []).join('；')}`,
            `公告原文：\n${notice.evidence}`,
          ].join('\n'),
        },
      ],
    });
    return normalizeResult(firstJsonObject(result.content));
  },
});
