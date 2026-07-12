import type { DiscoveredLink } from './agent-search-adapter.ts';
import type { CandidateBundle, LocalHelperTask } from './site-harness.ts';

export type AgentSummaryInput = {
  task: LocalHelperTask;
  discoveredLinks: DiscoveredLink[];
  candidateBundle: CandidateBundle | null;
  fallbackSummary: string;
};

export type LLMAgentAdapter = {
  name: string;
  summarize(input: AgentSummaryInput): Promise<string>;
};

export type LocalLLMConfig = {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  updatedAt?: string;
};

export type LLMConnectionTestResult = {
  ok: boolean;
  baseUrl: string;
  model: string;
  message: string;
};

type FetchLike = typeof fetch;
type ChatRole = 'system' | 'user' | 'assistant';
type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatCompletionCallResult = {
  content: string;
  durationMs: number;
  retriedWithoutResponseFormat: boolean;
};

const DEFAULT_LLM_TIMEOUT_MS = 30_000;

const firstLines = (value = '', limit = 1800) => (
  value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value
);

export const resolveLLMSettings = ({
  env = process.env,
  config = null,
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
}) => ({
  enabled: config?.enabled !== false,
  apiKey: String(config?.apiKey || env.HCZ_LOCAL_AGENT_LLM_API_KEY || '').trim(),
  baseUrl: String(config?.baseUrl || env.HCZ_LOCAL_AGENT_LLM_BASE_URL || '').trim().replace(/\/+$/, ''),
  model: String(config?.model || env.HCZ_LOCAL_AGENT_LLM_MODEL || '').trim(),
  timeoutMs: Number(config?.timeoutMs || env.HCZ_LOCAL_AGENT_LLM_TIMEOUT_MS || DEFAULT_LLM_TIMEOUT_MS),
});

const errorMessageFor = (error: unknown) => {
  if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError') {
    return 'LLM 请求超时，请检查接口地址、网络或模型服务状态。';
  }
  return error instanceof Error ? error.message : String(error);
};

const responseErrorMessage = (body: any, status: number) => (
  body?.error?.message || body?.error || body?.message || `HTTP ${status}`
);

const looksLikeResponseFormatError = (message = '') => (
  /response_format|json_object|JSON mode|unsupported/i.test(message)
);

const fetchWithTimeout = async (
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) => {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_LLM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

export const callOpenAICompatibleChatCompletion = async ({
  env = process.env,
  config = null,
  fetchImpl = fetch,
  messages,
  temperature = 0.2,
  maxTokens,
  responseFormatJson = false,
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
  fetchImpl?: FetchLike;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormatJson?: boolean;
}): Promise<ChatCompletionCallResult> => {
  const { enabled, apiKey, baseUrl, model, timeoutMs } = resolveLLMSettings({ env, config });
  if (!enabled) throw new Error('LLM 研判未启用。');
  if (!apiKey || !baseUrl || !model) throw new Error('请填写接口地址、API Key 和模型名。');
  const startedAt = Date.now();
  const url = `${baseUrl}/chat/completions`;
  const basePayload = {
    model,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    messages,
  };
  const execute = async (payload: Record<string, unknown>) => {
    const response = await fetchWithTimeout(fetchImpl, url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, timeoutMs);
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };

  try {
    let retriedWithoutResponseFormat = false;
    let payload: Record<string, unknown> = responseFormatJson
      ? { ...basePayload, response_format: { type: 'json_object' } }
      : basePayload;
    let { response, body } = await execute(payload);
    if (!response.ok && responseFormatJson && looksLikeResponseFormatError(responseErrorMessage(body, response.status))) {
      retriedWithoutResponseFormat = true;
      payload = basePayload;
      ({ response, body } = await execute(payload));
    }
    if (!response.ok) throw new Error(responseErrorMessage(body, response.status));
    const content = body?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM 返回内容为空。');
    return {
      content: String(content).trim(),
      durationMs: Date.now() - startedAt,
      retriedWithoutResponseFormat,
    };
  } catch (error) {
    throw new Error(errorMessageFor(error));
  }
};

export const buildWechatCandidateSummary = (bundle: CandidateBundle | null) => {
  const candidates = bundle?.candidates || [];
  if (!candidates.length) return '未识别到可发送到微信群的招投标候选。';
  return [
    `发现 ${candidates.length} 条招投标候选：`,
    ...candidates.slice(0, 10).map((candidate, index) => [
      `${index + 1}. ${candidate.title}`,
      candidate.buyer_name ? `采购方：${candidate.buyer_name}` : '',
      candidate.published_at ? `发布日期：${candidate.published_at}` : '',
      candidate.deadline_at ? `截止：${candidate.deadline_at}` : '',
      candidate.url ? `链接：${candidate.url}` : '',
    ].filter(Boolean).join('\n')),
  ].join('\n\n');
};

export const createDeterministicLLMAgent = (): LLMAgentAdapter => ({
  name: 'deterministic-summary',
  async summarize({ fallbackSummary }) {
    return fallbackSummary;
  },
});

export const createOpenAICompatibleLLMAgent = ({
  env = process.env,
  config = null,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
  fetchImpl?: FetchLike;
} = {}): LLMAgentAdapter => ({
  name: 'openai-compatible-chat',

  async summarize(input) {
    const { enabled, apiKey, baseUrl, model } = resolveLLMSettings({ env, config });
    if (!enabled || !apiKey || !baseUrl || !model) return input.fallbackSummary;
    const candidateText = JSON.stringify(input.candidateBundle?.candidates || [], null, 2);
    const linkText = input.discoveredLinks
      .slice(0, 8)
      .map((link, index) => `${index + 1}. ${link.title}\n${link.url}`)
      .join('\n');
    try {
      const result = await callOpenAICompatibleChatCompletion({
        env,
        config,
        fetchImpl,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: '你是恒化成的本地招投标采集 Agent。只根据给定候选和链接生成简洁、可发微信群的中文摘要，不编造日期、采购方或链接。',
          },
          {
            role: 'user',
            content: [
              `站点：${input.task.sourceName}`,
              `搜索词：${input.task.searchTerms || ''}`,
              `发现链接：\n${firstLines(linkText)}`,
              `候选 JSON：\n${firstLines(candidateText)}`,
              `兜底摘要：${input.fallbackSummary}`,
            ].join('\n\n'),
          },
        ],
      });
      return result.content || input.fallbackSummary;
    } catch {
      return input.fallbackSummary;
    }
  },
});

export const createDefaultLLMAgent = ({
  env = process.env,
  config = null,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
  fetchImpl?: FetchLike;
} = {}) => {
  const settings = resolveLLMSettings({ env, config });
  if (settings.enabled && settings.apiKey) return createOpenAICompatibleLLMAgent({ env, config, fetchImpl });
  return createDeterministicLLMAgent();
};

export const testOpenAICompatibleLLMConfig = async ({
  env = process.env,
  config = null,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
  fetchImpl?: FetchLike;
} = {}): Promise<LLMConnectionTestResult> => {
  const { enabled, apiKey, baseUrl, model } = resolveLLMSettings({ env, config });
  if (!enabled) {
    return { ok: false, baseUrl, model, message: 'LLM 研判未启用。' };
  }
  if (!apiKey || !baseUrl || !model) {
    return { ok: false, baseUrl, model, message: '请填写接口地址、API Key 和模型名。' };
  }
  try {
    const result = await callOpenAICompatibleChatCompletion({
      env,
      config,
      fetchImpl,
      temperature: 0,
      maxTokens: 64,
      messages: [
        {
          role: 'system',
          content: '你是连接测试助手，只返回简短中文确认。',
        },
        {
          role: 'user',
          content: '请回复：连接正常',
        },
      ],
    });
    return {
      ok: true,
      baseUrl,
      model,
      message: result.content ? `LLM 连接成功：${result.content}` : 'LLM 连接成功。',
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      model,
      message: `LLM 连接失败：${errorMessageFor(error)}`,
    };
  }
};
