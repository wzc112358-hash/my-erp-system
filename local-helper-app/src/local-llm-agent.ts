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
  updatedAt?: string;
};

export type LLMConnectionTestResult = {
  ok: boolean;
  baseUrl: string;
  model: string;
  message: string;
};

type FetchLike = typeof fetch;

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
});

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
  async summarize({ candidateBundle, fallbackSummary }) {
    const groupSummary = buildWechatCandidateSummary(candidateBundle);
    return candidateBundle?.candidates?.length ? groupSummary : fallbackSummary;
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
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
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
      }),
    });
    const body = await response.json().catch(() => ({}));
    const content = body?.choices?.[0]?.message?.content;
    return response.ok && content ? String(content).trim() : input.fallbackSummary;
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
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 16,
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
    }),
  });
  const body = await response.json().catch(() => ({}));
  const content = body?.choices?.[0]?.message?.content;
  if (!response.ok) {
    return {
      ok: false,
      baseUrl,
      model,
      message: `LLM 连接失败：${body?.error?.message || body?.message || response.status}`,
    };
  }
  return {
    ok: true,
    baseUrl,
    model,
    message: content ? `LLM 连接成功：${String(content).trim()}` : 'LLM 连接成功。',
  };
};
