import type { DiscoveredLink } from './agent-search-adapter.ts';
import type { AgentToolManifest } from './agent-toolbox.ts';
import {
  resolveLLMSettings,
  type LocalLLMConfig,
} from './local-llm-agent.ts';
import type { LocalHelperTask } from './site-harness.ts';

export type ReActAction =
  | { type: 'search'; reason: string; limit?: number }
  | { type: 'open_url'; reason: string; url: string }
  | { type: 'observe'; reason: string }
  | { type: 'read_documents'; reason: string; maxDocuments?: number }
  | { type: 'finish'; reason: string }
  | { type: 'request_human'; reason: string };

export type ReActPlannerState = {
  task: LocalHelperTask;
  iteration: number;
  maxIterations: number;
  tools: AgentToolManifest[];
  discoveredLinks: Array<DiscoveredLink & { visited?: boolean }>;
  openedUrls: string[];
  observation?: {
    title: string;
    url: string;
    visibleTextSnippet: string;
    linkCount: number;
    networkResponseCount: number;
    downloadedFileCount: number;
  };
  candidateCount: number;
  documentCount: number;
  hasDocumentSignals: boolean;
  lastHumanReason?: string;
  warnings: string[];
};

export type ReActPlanner = {
  name: string;
  chooseAction(state: ReActPlannerState): Promise<ReActAction>;
};

type FetchLike = typeof fetch;

const firstJsonObject = (content = '') => {
  const withoutFence = content
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const trim = (value = '', limit = 1800) => (
  value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value
);

const allowedUrlsFor = (state: ReActPlannerState) => new Set([
  state.task.entryUrl,
  ...state.discoveredLinks.map((link) => link.url),
].filter(Boolean));

const firstUnvisitedUrl = (state: ReActPlannerState) => (
  state.discoveredLinks.find((link) => !link.visited)?.url ||
  (!state.openedUrls.includes(state.task.entryUrl) ? state.task.entryUrl : '')
);

export const createDeterministicReActPlanner = (): ReActPlanner => ({
  name: 'deterministic-react-planner',

  async chooseAction(state) {
    if (state.lastHumanReason) {
      return {
        type: 'request_human',
        reason: state.lastHumanReason,
      };
    }
    if (state.candidateCount > 0 && state.hasDocumentSignals && state.documentCount === 0) {
      return {
        type: 'read_documents',
        reason: '已识别候选公告且页面存在附件线索，先读取采购文件再完成。',
        maxDocuments: 2,
      };
    }
    if (state.candidateCount > 0) {
      return {
        type: 'finish',
        reason: '已识别到候选公告，可以进入研判和摘要。',
      };
    }
    if (state.discoveredLinks.length === 0 && state.iteration === 1) {
      return {
        type: 'search',
        reason: '先发现公开入口和公告链接。',
        limit: 8,
      };
    }
    const nextUrl = firstUnvisitedUrl(state);
    if (nextUrl) {
      return {
        type: 'open_url',
        reason: '打开下一个未访问的候选入口。',
        url: nextUrl,
      };
    }
    if (state.observation) {
      return {
        type: 'request_human',
        reason: '已尝试公开入口，但当前页面没有识别到公告列表或候选信息，需要员工进入正确列表后继续。',
      };
    }
    return {
      type: 'observe',
      reason: '没有新的入口，观察当前浏览器页面。',
    };
  },
});

const coerceAction = (
  raw: Record<string, unknown> | null,
  state: ReActPlannerState,
): ReActAction | null => {
  const type = String(raw?.type || '').trim();
  const reason = String(raw?.reason || '').trim() || 'LLM 已选择下一步。';
  if (type === 'search') {
    const limit = Number(raw?.limit || 8);
    return {
      type,
      reason,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(12, Math.round(limit)) : 8,
    };
  }
  if (type === 'open_url') {
    const url = String(raw?.url || '').trim();
    if (!url || !allowedUrlsFor(state).has(url)) return null;
    return { type, reason, url };
  }
  if (type === 'observe') return { type, reason };
  if (type === 'read_documents') {
    const maxDocuments = Number(raw?.maxDocuments || 2);
    return {
      type,
      reason,
      maxDocuments: Number.isFinite(maxDocuments) && maxDocuments > 0 ? Math.min(5, Math.round(maxDocuments)) : 2,
    };
  }
  if (type === 'finish') return { type, reason };
  if (type === 'request_human') return { type, reason };
  return null;
};

const plannerPromptFor = (state: ReActPlannerState) => [
  '你是恒化成本地招投标采集 ReAct planner。你只能选择一个下一步动作，并输出严格 JSON。',
  '不要编造 URL；open_url 只能使用 discoveredLinks 或 task.entryUrl 中已有 URL。',
  '如果遇到登录、验证码、CA、短信、安全验证、空白页或没有入口，应 request_human。',
  '如果已经有候选公告且有附件线索但还没读附件，应 read_documents。',
  '如果已经有候选公告且没有必要再读附件，应 finish。',
  '',
  '动作 JSON 之一：',
  '{"type":"search","reason":"...","limit":8}',
  '{"type":"open_url","reason":"...","url":"..."}',
  '{"type":"observe","reason":"..."}',
  '{"type":"read_documents","reason":"...","maxDocuments":2}',
  '{"type":"finish","reason":"..."}',
  '{"type":"request_human","reason":"..."}',
  '',
  `状态 JSON：\n${trim(JSON.stringify(state, null, 2), 5000)}`,
].join('\n');

export const createOpenAIReActPlanner = ({
  env = process.env,
  config = null,
  fetchImpl = fetch,
  fallback = createDeterministicReActPlanner(),
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
  fetchImpl?: FetchLike;
  fallback?: ReActPlanner;
} = {}): ReActPlanner => ({
  name: 'openai-compatible-react-planner',

  async chooseAction(state) {
    const { enabled, apiKey, baseUrl, model } = resolveLLMSettings({ env, config });
    if (!enabled || !apiKey || !baseUrl || !model) return fallback.chooseAction(state);
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: '你只输出一个 JSON 对象，不输出解释。',
            },
            {
              role: 'user',
              content: plannerPromptFor(state),
            },
          ],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return fallback.chooseAction(state);
      return coerceAction(firstJsonObject(String(body?.choices?.[0]?.message?.content || '')), state) ||
        fallback.chooseAction(state);
    } catch {
      return fallback.chooseAction(state);
    }
  },
});

export const createDefaultReActPlanner = ({
  env = process.env,
  config = null,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  config?: LocalLLMConfig | null;
  fetchImpl?: FetchLike;
} = {}) => {
  const settings = resolveLLMSettings({ env, config });
  if (settings.enabled && settings.apiKey) return createOpenAIReActPlanner({ env, config, fetchImpl });
  return createDeterministicReActPlanner();
};

