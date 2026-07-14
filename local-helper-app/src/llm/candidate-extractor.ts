import type {
  BrowserObservation,
  CandidateBundle,
  LocalHelperTask,
  TenderCandidate,
} from '../browser/types.ts';
import { definitionFor, sitePromptFor } from '../sites/registry.ts';
import {
  callOpenAICompatibleChatCompletion,
  resolveLLMSettings,
  type LocalLLMConfig,
} from './client.ts';

type FetchLike = typeof fetch;

const RESULT_NOTICE_PATTERN = /评标结果|招标结果|中标候选|中标结果|成交结果|采购结果|入围结果|结果公示/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

const jsonObjectFrom = (content = '') => {
  const clean = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
};

const compact = (value = '', limit = 12_000) => {
  const normalized = String(value || '').replace(/\u0000/g, '').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}\n...[truncated]` : normalized;
};

const observedUrls = (observation: BrowserObservation) => new Set([
  observation.url,
  ...(observation.links || []).map((link) => link.href),
  ...(observation.networkResponses || []).map((response) => response.url),
].filter(Boolean));

const safeUrl = (value: unknown, observation: BrowserObservation, fallbackToPage = true) => {
  const candidate = String(value || '').trim();
  if (!candidate) return fallbackToPage ? observation.url : '';
  const allowed = observedUrls(observation);
  if (allowed.has(candidate)) return candidate;
  try {
    const resolved = new URL(candidate, observation.url).toString();
    if (allowed.has(resolved)) return resolved;
  } catch {
    return fallbackToPage ? observation.url : '';
  }
  return fallbackToPage ? observation.url : '';
};

const safeDate = (value: unknown) => {
  const date = String(value || '').trim();
  return DATE_PATTERN.test(date) ? date : '';
};

const stringArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12)
  : [];

const normalizeCandidate = (
  value: Record<string, unknown>,
  observation: BrowserObservation,
  sourceCorpus: string,
): TenderCandidate | null => {
  const title = String(value.title || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (title.length < 6 || RESULT_NOTICE_PATTERN.test(title)) return null;
  const normalizedTitle = title.replace(/\s+/g, '');
  const grounded = Array.from({ length: Math.max(0, normalizedTitle.length - 5) }, (_, index) => (
    normalizedTitle.slice(index, index + 6)
  )).some((fragment) => sourceCorpus.includes(fragment));
  if (!grounded) return null;
  const rawText = compact(String(value.raw_text || value.evidence || title), 3_000);
  return {
    title,
    url: safeUrl(value.url, observation),
    published_at: safeDate(value.published_at),
    deadline_at: safeDate(value.deadline_at),
    buyer_name: String(value.buyer_name || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    raw_text: rawText,
    attachments: stringArray(value.attachments)
      .map((url) => safeUrl(url, observation, false))
      .filter(Boolean),
  };
};

const observationPrompt = (observation: BrowserObservation) => {
  const links = (observation.links || []).slice(0, 100).map((link, index) => ({
    index,
    text: compact(link.text || link.title || '', 220),
    url: link.href,
  }));
  const network = (observation.networkResponses || [])
    .filter((response) => !response.challenge && /json|javascript|text\/plain/i.test(response.contentType || ''))
    .slice(-12)
    .map((response) => ({
      url: response.url,
      status: response.status,
      body: compact(response.bodySnippet || '', 4_000),
    }));
  return [
    `页面标题：${observation.title}`,
    `当前地址：${observation.url}`,
    `可见文字：\n${compact(observation.visibleText, 16_000)}`,
    `页面链接 JSON：\n${compact(JSON.stringify(links), 12_000)}`,
    `业务网络响应 JSON：\n${compact(JSON.stringify(network), 14_000)}`,
  ].join('\n\n');
};

export const extractCandidatesWithLLM = async ({
  task,
  observation,
  config = null,
  env = process.env,
  fetchImpl = fetch,
}: {
  task: LocalHelperTask;
  observation: BrowserObservation;
  config?: LocalLLMConfig | null;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
}): Promise<CandidateBundle | null> => {
  const settings = resolveLLMSettings({ env, config });
  if (!settings.enabled || !settings.apiKey) return null;
  const site = definitionFor(task.sourceName);
  const result = await callOpenAICompatibleChatCompletion({
    env,
    config,
    fetchImpl,
    temperature: 0,
    maxTokens: 4_000,
    responseFormatJson: true,
    messages: [
      {
        role: 'system',
        content: [
          '你是化工 B2B 招投标网页抽取 Agent。根据页面可见文字、链接和网络 JSON，提取当前仍可参与的采购公告。',
          '不得把中标/成交/评标结果、工程施工、维修服务、设备、废物销售或平台广告当成化工产品采购。',
          '不得编造链接、日期、采购方、产品或要求。链接只能使用输入中出现的 URL。缺失日期必须返回空字符串。',
          '只返回严格 JSON：{"candidates":[{"title":"","url":"","published_at":"","deadline_at":"","buyer_name":"","raw_text":"原文证据","attachments":[]}]}。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          sitePromptFor(task.sourceName),
          `任务搜索词：${task.searchTerms || ''}`,
          `站点专项要求：${site.llmExtractionHint}`,
          observationPrompt(observation),
        ].join('\n\n'),
      },
    ],
  });
  const parsed = jsonObjectFrom(result.content);
  const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const sourceCorpus = [
    observation.visibleText,
    ...(observation.links || []).flatMap((link) => [link.text, link.title || '']),
    ...(observation.networkResponses || [])
      .filter((response) => !response.challenge)
      .map((response) => response.bodySnippet || ''),
  ].join('\n').replace(/\s+/g, '');
  const candidates = rawCandidates
    .map((candidate: unknown) => candidate && typeof candidate === 'object'
      ? normalizeCandidate(candidate as Record<string, unknown>, observation, sourceCorpus)
      : null)
    .filter((candidate: TenderCandidate | null): candidate is TenderCandidate => Boolean(candidate))
    .filter((candidate: TenderCandidate, index: number, all: TenderCandidate[]) => (
      index === all.findIndex((item) => `${item.title}|${item.url}` === `${candidate.title}|${candidate.url}`)
    ))
    .slice(0, 30);
  return candidates.length ? { source_name: task.sourceName, candidates } : null;
};
