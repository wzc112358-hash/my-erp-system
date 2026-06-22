import type { LocalHelperTask } from './site-harness.ts';

export type DiscoveredLink = {
  title: string;
  url: string;
  description?: string;
  source: string;
  score?: number;
};

export type LinkDiscoveryResult = {
  provider: string;
  query: string;
  links: DiscoveredLink[];
  warnings: string[];
};

export type LinkDiscoveryInput = {
  task: LocalHelperTask;
  limit?: number;
};

export type SearchAdapter = {
  name: string;
  discoverLinks(input: LinkDiscoveryInput): Promise<LinkDiscoveryResult>;
};

type FetchLike = typeof fetch;

const DEFAULT_FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v2';
const DEFAULT_SEARCH_LIMIT = 8;
const NOTICE_TERMS = ['招标', '采购', '询价', '询比', '竞价', '谈判', '公告', '公示'];

export const splitSearchTerms = (value = '') => value
  .split(/[,\n，、;；\s]+/)
  .map((term) => term.trim())
  .filter(Boolean)
  .filter((term, index, all) => all.indexOf(term) === index);

export const hostnameForUrl = (value = '') => {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
};

const normalizeUrl = (value = '', baseUrl = '') => {
  try {
    return new URL(value, baseUrl || undefined).toString();
  } catch {
    return value;
  }
};

const compactWhitespace = (value = '') => value.replace(/\s+/g, ' ').trim();

export const buildDiscoveryQuery = (task: LocalHelperTask) => {
  const host = hostnameForUrl(task.entryUrl);
  const terms = splitSearchTerms(task.searchTerms || '').slice(0, 8);
  const sitePart = host ? `site:${host}` : task.sourceName;
  return compactWhitespace([
    sitePart,
    task.sourceName,
    ...terms,
    ...NOTICE_TERMS.slice(0, 4),
  ].filter(Boolean).join(' ')).slice(0, 500);
};

const titleTokensFor = (sourceName = '') => sourceName
  .split(/[（）()\s·\-_/]+/)
  .map((token) => token.trim())
  .filter((token) => token.length >= 2);

export const scoreDiscoveredLink = (
  link: DiscoveredLink,
  task: LocalHelperTask,
) => {
  const entryHost = hostnameForUrl(task.entryUrl);
  const linkHost = hostnameForUrl(link.url);
  const haystack = `${link.title}\n${link.description || ''}\n${link.url}`.toLowerCase();
  let score = 0;
  if (entryHost && linkHost === entryHost) score += 60;
  if (entryHost && linkHost.endsWith(`.${entryHost}`)) score += 40;
  for (const token of titleTokensFor(task.sourceName)) {
    if (haystack.includes(token.toLowerCase())) score += 12;
  }
  for (const term of splitSearchTerms(task.searchTerms || '').slice(0, 12)) {
    if (haystack.includes(term.toLowerCase())) score += 8;
  }
  for (const term of NOTICE_TERMS) {
    if (haystack.includes(term.toLowerCase())) score += 4;
  }
  if (/登录|注册|帮助|操作手册|用户指南|login|register|manual/i.test(haystack)) score -= 18;
  return score;
};

export const rankDiscoveredLinks = (
  links: DiscoveredLink[],
  task: LocalHelperTask,
) => [...links]
  .map((link) => ({ ...link, score: scoreDiscoveredLink(link, task) }))
  .filter((link) => /^https?:\/\//i.test(link.url))
  .filter((link, index, all) => index === all.findIndex((item) => item.url === link.url))
  .sort((left, right) => (right.score || 0) - (left.score || 0));

const firecrawlRowsFrom = (body: any) => {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.web)) return body.data.web;
  if (Array.isArray(body?.web)) return body.web;
  return [];
};

export const createFirecrawlSearchAdapter = ({
  env = process.env,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
} = {}): SearchAdapter => ({
  name: 'firecrawl',

  async discoverLinks({ task, limit = DEFAULT_SEARCH_LIMIT }) {
    const apiKey = String(env.FIRECRAWL_API_KEY || env.HCZ_FIRECRAWL_API_KEY || '').trim();
    const query = buildDiscoveryQuery(task);
    if (!apiKey) {
      return {
        provider: this.name,
        query,
        links: [],
        warnings: ['未配置 FIRECRAWL_API_KEY/HCZ_FIRECRAWL_API_KEY，已跳过 Firecrawl 搜索。'],
      };
    }

    const baseUrl = String(env.FIRECRAWL_BASE_URL || env.HCZ_FIRECRAWL_BASE_URL || DEFAULT_FIRECRAWL_BASE_URL)
      .replace(/\/+$/, '');
    const host = hostnameForUrl(task.entryUrl);
    const response = await fetchImpl(`${baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        sources: ['web'],
        country: 'CN',
        timeout: 45000,
        ignoreInvalidURLs: true,
        ...(host ? { includeDomains: [host] } : {}),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) {
      return {
        provider: this.name,
        query,
        links: [],
        warnings: [`Firecrawl 搜索失败：${body?.error || body?.message || response.status}`],
      };
    }

    const primaryLinks = firecrawlRowsFrom(body).map((row: any) => ({
      title: compactWhitespace(row?.title || row?.metadata?.title || row?.url || ''),
      url: normalizeUrl(row?.url || row?.metadata?.sourceURL || row?.metadata?.url || ''),
      description: compactWhitespace(row?.description || row?.snippet || row?.markdown?.slice?.(0, 260) || ''),
      source: this.name,
    }));
    const nestedLinks = firecrawlRowsFrom(body).flatMap((row: any) => (
      Array.isArray(row?.links)
        ? row.links.map((url: string) => ({
          title: normalizeUrl(url, row?.url || ''),
          url: normalizeUrl(url, row?.url || ''),
          description: compactWhitespace(row?.title || row?.description || ''),
          source: `${this.name}:links`,
        }))
        : []
    ));

    return {
      provider: this.name,
      query,
      links: rankDiscoveredLinks([...primaryLinks, ...nestedLinks], task).slice(0, limit),
      warnings: [body?.warning].filter(Boolean),
    };
  },
});

export const createEntryUrlSearchAdapter = (): SearchAdapter => ({
  name: 'entry-url',

  async discoverLinks({ task }) {
    const query = buildDiscoveryQuery(task);
    if (!task.entryUrl) {
      return {
        provider: this.name,
        query,
        links: [],
        warnings: ['任务缺少入口 URL，无法使用入口兜底。'],
      };
    }
    return {
      provider: this.name,
      query,
      links: [{
        title: task.sourceName || task.entryUrl,
        url: task.entryUrl,
        description: task.searchTerms || '',
        source: this.name,
        score: 1,
      }],
      warnings: [],
    };
  },
});

export const createCompositeSearchAdapter = (adapters: SearchAdapter[]): SearchAdapter => ({
  name: adapters.map((adapter) => adapter.name).join('+'),

  async discoverLinks(input) {
    const warnings: string[] = [];
    const links: DiscoveredLink[] = [];
    let query = '';
    for (const adapter of adapters) {
      try {
        const result = await adapter.discoverLinks(input);
        query ||= result.query;
        warnings.push(...(result.warnings || []));
        links.push(...(result.links || []));
      } catch (error) {
        warnings.push(`${adapter.name} 搜索异常：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return {
      provider: this.name,
      query,
      links: rankDiscoveredLinks(links, input.task).slice(0, input.limit || DEFAULT_SEARCH_LIMIT),
      warnings,
    };
  },
});

export const createDefaultSearchAdapter = ({
  env = process.env,
  fetchImpl = fetch,
}: {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
} = {}) => createCompositeSearchAdapter([
  createFirecrawlSearchAdapter({ env, fetchImpl }),
  createEntryUrlSearchAdapter(),
]);

export const formatDiscoveredLinks = (result: LinkDiscoveryResult) => [
  `搜索工具：${result.provider}`,
  result.query ? `搜索语句：${result.query}` : '',
  ...result.warnings.map((warning) => `提示：${warning}`),
  ...result.links.map((link, index) => `${index + 1}. ${link.title || link.url} (${link.score ?? 0})\n${link.url}`),
].filter(Boolean).join('\n');
