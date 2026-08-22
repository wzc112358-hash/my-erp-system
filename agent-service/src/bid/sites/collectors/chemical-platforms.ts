import { resolve4 } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import type { PublicCollectionTask, TenderCandidate } from '../../domain/collection.ts';
import {
  MAX_DISCOVERY_EXCLUDED_NOTICES,
  type CollectionDiscoveryStats,
  type DiscoveryExcludedNotice,
  type DiscoveryExclusionReason,
} from '../../domain/discovery.ts';
import { effectiveSearchTerms } from '../../domain/site-search-scope.ts';
import type { SitePublicFeedResult } from '../public-collectors.ts';
import { definitionFor } from '../registry.ts';

type FetchLike = typeof fetch;
type CollectorInput = {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
};

type CollectionStats = {
  requests: number;
  successfulRequests: number;
  rawCount: number;
  expiredCount: number;
  nonActionableCount: number;
  duplicateCount: number;
  truncatedCount: number;
  staleCount: number;
};

const EPEC_BASE_URL = 'https://bidding.epec.com/';
const EPEC_NOTICE_ENDPOINT = `${EPEC_BASE_URL}gateway/obs/business/ubm/notice/queryNoticePageList`;
const EPEC_CHEMICAL_MAJORS = [
  { code: '01', label: '化工原料' },
  { code: '02', label: '化工辅料' },
];
const CNCEC_BASE_URL = 'https://bid.cncecyc.com/';
const CNCEC_NOTICE_CHANNELS = [
  { path: 'ywgg1hw', label: '货物招标公告' },
  { path: 'ywgg3xj1', label: '货物询比/询价公告' },
  { path: 'ywgg3jt1', label: '货物竞判公告' },
];
const CNCEC_SEARCH_CHANNEL_IDS = '208,209,210,211,212,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,237,238,239,240,241,242';
const RESULT_NOTICE_PATTERN = /中标|成交|结果公告|结果公示|预成交|评标结果|流标|废标/;
const PAGE_SIZE = 50;
const SEARCH_TERM_LIMIT = 32;

const normalizeText = (value = '') => String(value || '')
  .replace(/<!--[^]*?-->/g, ' ')
  .replace(/<(?:style|script|noscript|template)\b[^>]*>[^]*?<\/(?:style|script|noscript|template)>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&gt;/gi, '>')
  .replace(/&lt;/gi, '<')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const formatShanghaiDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const normalizeDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (/^\d{13}$/.test(raw)) return formatShanghaiDate(new Date(Number(raw)));
  const match = raw.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
};

const normalizeUrl = (value = '', baseUrl = '') => {
  try {
    return new URL(value, baseUrl || undefined).toString();
  } catch {
    return value;
  }
};

const fetchViaResolvedIpv4 = async (
  input: string,
  init: RequestInit = {},
  redirectCount = 0,
): Promise<Response> => {
  const url = new URL(input);
  if (url.protocol !== 'https:') throw new Error(`IPv4 DNS fallback only supports HTTPS: ${url.protocol}`);
  const [address] = await resolve4(url.hostname);
  if (!address) throw new Error(`无法解析 ${url.hostname} 的 IPv4 地址`);
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: init.method || 'GET',
      headers: init.headers as Record<string, string> | undefined,
      lookup: (_hostname, options, callback) => {
        if (typeof options === 'object' && options.all) {
          (callback as unknown as (error: null, addresses: { address: string; family: number }[]) => void)(null, [{ address, family: 4 }]);
          return;
        }
        callback(null, address, 4);
      },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      incoming.on('end', async () => {
        const status = incoming.statusCode || 500;
        const location = incoming.headers.location;
        if (location && status >= 300 && status < 400 && redirectCount < 3) {
          try {
            resolve(await fetchViaResolvedIpv4(new URL(location, url).toString(), init, redirectCount + 1));
          } catch (error) {
            reject(error);
          }
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          for (const item of Array.isArray(value) ? value : value ? [value] : []) headers.append(name, item);
        }
        resolve(new Response(Buffer.concat(chunks), { status, headers }));
      });
    });
    request.on('error', reject);
    if (typeof init.body === 'string' || Buffer.isBuffer(init.body)) request.write(init.body);
    request.end();
  });
};

const fetchWithIpv4DnsFallback = async (
  input: string,
  init: RequestInit,
  fetchImpl: FetchLike,
) => {
  try {
    return await fetchImpl(input, init);
  } catch (error) {
    const code = String((error as { cause?: { code?: unknown } })?.cause?.code || '');
    if (fetchImpl !== fetch || !['EAI_AGAIN', 'ENOTFOUND'].includes(code)) throw error;
    return fetchViaResolvedIpv4(input, init);
  }
};

const rowValue = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
};

const timestampFor = (value: unknown, endOfDay = false) => {
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  if (/^20\d{2}-\d{2}-\d{2}$/.test(raw)) {
    return Date.parse(`${raw}T${endOfDay ? '23:59:59' : '00:00:00'}+08:00`);
  }
  return Date.parse(raw.replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(raw) ? '' : '+08:00'));
};

const recentStartFor = (now: Date, days: number) => (
  Date.parse(`${formatShanghaiDate(now)}T00:00:00+08:00`) - days * 24 * 60 * 60 * 1_000
);

const deadlineFromText = (text: string) => normalizeDate(
  normalizeText(text).match(/(?:投标文件|响应文件|报价文件|投标|响应|报价|递交|提交)[^。；，]{0,30}?截止时间[：:]?\s*(20\d{2}[-年/.]\d{1,2}[-月/.]\d{1,2})/)?.[1] || '',
);

const searchTermsFor = (task: PublicCollectionTask, now: Date) => {
  const requested = String(task.searchTerms || '').split(/[,\n，、;；\s]+/).filter(Boolean);
  const terms = task.searchScope
    ? effectiveSearchTerms(task.searchScope, task.sourceName, now)
    : requested.length <= 3 ? requested : [...definitionFor(task.sourceName).deepSearchTerms, ...requested];
  return [...new Set(terms)].filter((term) => term.length >= 2).slice(0, SEARCH_TERM_LIMIT);
};

const candidateKey = (candidate: TenderCandidate) => (
  `${candidate.title.replace(/\s+/g, '')}|${candidate.published_at || candidate.url}`
);

const waitForInterval = async (lastRequestAt: number, intervalMs: number) => {
  const remaining = Math.max(0, intervalMs - (Date.now() - lastRequestAt));
  if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
};

const responseText = async (response: Response) => (
  new TextDecoder('utf-8').decode(await response.arrayBuffer())
);

const addExcluded = (
  target: DiscoveryExcludedNotice[],
  candidate: TenderCandidate,
  reason: DiscoveryExclusionReason,
) => {
  if (target.length >= MAX_DISCOVERY_EXCLUDED_NOTICES) return;
  target.push({
    title: candidate.title.slice(0, 500), url: candidate.url.slice(0, 2_000),
    publishedAt: candidate.published_at, deadlineAt: candidate.deadline_at, reason,
  });
};

const discoveryStats = (
  provider: string,
  stats: CollectionStats,
  candidates: TenderCandidate[],
  warnings: string[],
  excludedNotices: DiscoveryExcludedNotice[],
): CollectionDiscoveryStats => ({
  provider,
  requestCount: stats.requests,
  successfulRequestCount: stats.successfulRequests,
  rawCount: stats.rawCount,
  eligibleCount: candidates.length,
  expiredCount: stats.expiredCount,
  nonActionableCount: stats.nonActionableCount,
  duplicateCount: stats.duplicateCount,
  truncatedCount: stats.truncatedCount,
  llmIgnoredCount: 0,
  staleCount: stats.staleCount,
  warnings: warnings.slice(0, 20),
  excludedNotices,
});

const resultFor = ({
  task, provider, searchTerms, stats, candidates: allCandidates, warnings, excludedNotices, summary,
}: {
  task: PublicCollectionTask;
  provider: string;
  searchTerms: string[];
  stats: CollectionStats;
  candidates: TenderCandidate[];
  warnings: string[];
  excludedNotices: DiscoveryExcludedNotice[];
  summary: string;
}): SitePublicFeedResult => {
  const limit = definitionFor(task.sourceName).maxCandidates || 180;
  const candidates = allCandidates.slice(0, limit);
  for (const candidate of allCandidates.slice(limit)) {
    stats.truncatedCount += 1;
    addExcluded(excludedNotices, candidate, 'candidate_limit');
  }
  return {
    provider,
    status: candidates.length ? 'success' : warnings.length ? 'failed' : 'no_new',
    candidateBundle: candidates.length ? { source_name: task.sourceName, candidates } : null,
    artifacts: [{
      artifact_type: 'network_response',
      title: `${task.sourceName} 公开查询摘要`,
      url: task.entryUrl,
      content: JSON.stringify({ provider, summary, searchTerms, stats, warnings, candidates }, null, 2).slice(0, 80_000),
      mime_type: 'application/json',
    }],
    warnings,
    summary,
    discoveryStats: discoveryStats(provider, stats, candidates, warnings, excludedNotices),
  };
};

const uniqueCandidates = (
  candidates: TenderCandidate[],
  stats: CollectionStats,
  excluded: DiscoveryExcludedNotice[],
) => candidates.filter((candidate, index, all) => {
  const duplicate = all.findIndex((item) => candidateKey(item) === candidateKey(candidate)) !== index;
  if (duplicate) {
    stats.duplicateCount += 1;
    addExcluded(excluded, candidate, 'duplicate');
  }
  return !duplicate;
});

const epecCandidate = (row: Record<string, unknown>, searchQuery = ''): TenderCandidate | null => {
  const noticeId = rowValue(row, ['noticeId']);
  const title = normalizeText(rowValue(row, ['noticeTitle', 'title']));
  if (!noticeId || !title) return null;
  const params = new URLSearchParams({ noticeId });
  for (const [name, value] of [
    ['type', rowValue(row, ['noticeAttachType', 'noticeType'])],
    ['businessId', rowValue(row, ['businessId'])],
    ['attachUrl', rowValue(row, ['attachUrl'])],
  ]) if (value) params.set(name, value);
  const publishedAt = normalizeDate(rowValue(row, ['releaseTime']));
  const deadlineAt = normalizeDate(rowValue(row, ['saleEndTime', 'bidOpeningTime']));
  return {
    title,
    url: `${EPEC_BASE_URL}noticeDetail?${params.toString()}`,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    buyer_name: normalizeText(rowValue(row, ['tenderOrganizationName'])) || '中国石化',
    raw_text: normalizeText([
      title,
      `专业分类：${rowValue(row, ['majorName']) || '未标注'}`,
      rowValue(row, ['sourcingTypeName']) ? `采购方式：${rowValue(row, ['sourcingTypeName'])}` : '',
      rowValue(row, ['tenderCode']) ? `招标编号：${rowValue(row, ['tenderCode'])}` : '',
      publishedAt ? `发布时间：${publishedAt}` : '',
      rowValue(row, ['saleEndTime']) ? `标书售卖截止：${rowValue(row, ['saleEndTime'])}` : '',
      rowValue(row, ['bidOpeningTime']) ? `开标时间：${rowValue(row, ['bidOpeningTime'])}` : '',
    ].filter(Boolean).join(' ')),
    attachments: [],
    search_query: searchQuery || undefined,
    notice_type: normalizeText(rowValue(row, ['noticeTypeName', 'sourcingTypeName'])) || '招标公告',
  };
};

export const collectEpecPublicNotices = async ({
  task, fetchImpl = fetch, now = new Date(), minimumIntervalMs = 500,
}: CollectorInput): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:sinopec-epec';
  const site = definitionFor(task.sourceName);
  const terms = searchTermsFor(task, now);
  const recentStart = recentStartFor(now, site.browserJourney?.recentDays || 14);
  const stats: CollectionStats = { requests: 0, successfulRequests: 0, rawCount: 0, expiredCount: 0, nonActionableCount: 0, duplicateCount: 0, truncatedCount: 0, staleCount: 0 };
  const warnings: string[] = [];
  const excluded: DiscoveryExcludedNotice[] = [];
  const candidates: TenderCandidate[] = [];
  let lastRequestAt = 0;
  let rateLimited = false;

  const query = async (model: Record<string, unknown>, searchQuery = '') => {
    for (let page = 1; page <= 2 && !rateLimited; page += 1) {
      await waitForInterval(lastRequestAt, minimumIntervalMs);
      lastRequestAt = Date.now();
      stats.requests += 1;
      try {
        const response = await fetchImpl(EPEC_NOTICE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Referer': `${EPEC_BASE_URL}tenderInfoOne`, 'User-Agent': 'HCZ-ERP-Bid-Agent/1.0' },
          body: JSON.stringify({
            model: { noticeTypeList: ['01', '11'], releaseTimeStart: formatShanghaiDate(new Date(recentStart)), releaseTimeEnd: formatShanghaiDate(now), ...model },
            currentPage: page, limit: PAGE_SIZE, pageSize: PAGE_SIZE, start: (page - 1) * PAGE_SIZE,
          }),
        });
        if ([429, 503].includes(response.status)) {
          rateLimited = true;
          warnings.push(`EPEC 触发访问限制：HTTP ${response.status}`);
          break;
        }
        const payload = await response.json().catch(() => null) as any;
        if (!response.ok || payload?.code !== '000000' || !payload?.data) {
          warnings.push(`EPEC 公告查询失败：HTTP ${response.status} / ${payload?.code || 'unknown'}`);
          break;
        }
        stats.successfulRequests += 1;
        const rows = Array.isArray(payload.data.root) ? payload.data.root as Record<string, unknown>[] : [];
        for (const row of rows) {
          stats.rawCount += 1;
          const candidate = epecCandidate(row, searchQuery);
          if (!candidate) continue;
          if (RESULT_NOTICE_PATTERN.test(candidate.title)) {
            stats.nonActionableCount += 1;
            addExcluded(excluded, candidate, 'non_actionable');
            continue;
          }
          const deadline = timestampFor(rowValue(row, ['saleEndTime', 'bidOpeningTime']), true);
          if (/已截止|已结束/.test(rowValue(row, ['noticeState'])) || (Number.isFinite(deadline) && deadline < now.getTime())) {
            stats.expiredCount += 1;
            addExcluded(excluded, candidate, 'expired');
            continue;
          }
          candidates.push(candidate);
        }
        if (page * PAGE_SIZE >= Number(payload.data.totalCount || 0) || rows.length < PAGE_SIZE) break;
      } catch (error) {
        warnings.push(`EPEC 公告查询异常：${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
  };

  for (const major of EPEC_CHEMICAL_MAJORS) await query({ majorCode: major.code });
  for (const term of terms) {
    if (rateLimited) break;
    await query({ noticeTitle: term }, term);
  }
  const unique = uniqueCandidates(candidates, stats, excluded);
  const summary = `EPEC 化工原料/化工辅料与 ${terms.length} 个产品词共读取 ${stats.rawCount} 条，排除过期 ${stats.expiredCount} 条，去重 ${stats.duplicateCount} 条，保留 ${unique.length} 条交给 LLM。`;
  return resultFor({ task, provider, searchTerms: terms, stats, candidates: unique, warnings, excludedNotices: excluded, summary });
};

export const readEpecPublicCandidateDetail = async ({
  candidate, fetchImpl = fetch,
}: { candidate: TenderCandidate; fetchImpl?: FetchLike }): Promise<TenderCandidate> => {
  const parsed = new URL(candidate.url);
  const attachUrl = parsed.searchParams.get('attachUrl') || '';
  const url = attachUrl ? normalizeUrl(`noticefile/${attachUrl.replace(/^\/+/, '')}`, EPEC_BASE_URL) : candidate.url;
  const response = await fetchImpl(url, { headers: { 'Referer': candidate.url, 'User-Agent': 'HCZ-ERP-Bid-Agent/1.0' } });
  const html = await responseText(response);
  if (!response.ok) throw new Error(`EPEC 公告详情读取失败：HTTP ${response.status}`);
  const text = normalizeText(html).slice(0, 26_000);
  const attachments = [...new Set([
    ...candidate.attachments,
    ...[...html.matchAll(/(?:href|data)=["']([^"']+)["']/gi)].map((match) => normalizeUrl(match[1].replace(/&amp;/gi, '&'), EPEC_BASE_URL)),
  ])].filter((item) => /\.(?:pdf|docx?|xlsx?)(?:[?#]|$)|\/gateway\/c\/dowload\//i.test(item)).slice(0, 10);
  return {
    ...candidate,
    title: normalizeText(html.match(/<(?:h1|h2)\b[^>]*>([\s\S]*?)<\/(?:h1|h2)>/i)?.[1] || '') || candidate.title,
    buyer_name: normalizeText(text.match(/(?:招\s*标\s*人|采\s*购\s*人)[：:]\s*([^。；]{2,100}?)(?=[。；]|\s+(?:地\s*址|联\s*系\s*人|招标代理机构)[：:]|$)/)?.[1] || '') || candidate.buyer_name,
    deadline_at: deadlineFromText(text) || candidate.deadline_at,
    raw_text: normalizeText(`${candidate.raw_text} 【公告网页正文】${text}`).slice(0, 30_000),
    attachments,
  };
};

const parseCncecList = (html: string, pageUrl: string, label: string, searchQuery = ''): TenderCandidate[] => {
  const candidates: TenderCandidate[] = [];
  for (const match of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = match[1];
    const attrs = block.match(/<a\b([^>]*)>/i)?.[1] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    const title = normalizeText(attrs.match(/\btitle=["']([^"']+)["']/i)?.[1] || '');
    const url = normalizeUrl(href, pageUrl);
    if (!title || !/\/cms\/channel\/ywgg(?:1hw|3xj1|3jt1)\/\d+\.htm(?:[?#]|$)/i.test(url)) continue;
    const publishedAt = normalizeDate(block.match(/class=["'][^"']*bidDate[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || block);
    const deadlineRaw = block.match(/\bbuyend=["']([^"']+)["']/i)?.[1] || '';
    candidates.push({
      title, url, published_at: publishedAt, deadline_at: normalizeDate(deadlineRaw),
      buyer_name: '中国化学工程集团',
      raw_text: normalizeText(`${title} 公告栏目：${label} ${publishedAt ? `发布时间：${publishedAt}` : ''} ${deadlineRaw ? `截止时间：${deadlineRaw}` : ''}`),
      attachments: [], search_query: searchQuery || undefined, notice_type: label,
    });
  }
  return candidates;
};

export const collectCncecPublicNotices = async ({
  task, fetchImpl = fetch, now = new Date(), minimumIntervalMs = 500,
}: CollectorInput): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:cncec-public-notices';
  const terms = searchTermsFor(task, now);
  const recentStart = recentStartFor(now, definitionFor(task.sourceName).browserJourney?.recentDays || 14);
  const stats: CollectionStats = { requests: 0, successfulRequests: 0, rawCount: 0, expiredCount: 0, nonActionableCount: 0, duplicateCount: 0, truncatedCount: 0, staleCount: 0 };
  const warnings: string[] = [];
  const excluded: DiscoveryExcludedNotice[] = [];
  const candidates: TenderCandidate[] = [];
  let lastRequestAt = 0;
  let rateLimited = false;

  const readPage = async (url: string, label: string, searchQuery = '') => {
    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    try {
      const response = await fetchWithIpv4DnsFallback(url, { headers: { 'Referer': CNCEC_BASE_URL, 'User-Agent': 'HCZ-ERP-Bid-Agent/1.0' } }, fetchImpl);
      if ([429, 503].includes(response.status)) {
        rateLimited = true;
        warnings.push(`中国化学${label}触发访问限制：HTTP ${response.status}`);
        return;
      }
      const html = await responseText(response);
      if (!response.ok) {
        warnings.push(`中国化学${label}读取失败：HTTP ${response.status}`);
        return;
      }
      stats.successfulRequests += 1;
      for (const candidate of parseCncecList(html, url, label, searchQuery)) {
        stats.rawCount += 1;
        if (RESULT_NOTICE_PATTERN.test(candidate.title)) {
          stats.nonActionableCount += 1;
          addExcluded(excluded, candidate, 'non_actionable');
          continue;
        }
        const published = timestampFor(candidate.published_at);
        if (Number.isFinite(published) && published < recentStart) {
          stats.staleCount += 1;
          addExcluded(excluded, candidate, 'stale');
          continue;
        }
        const deadline = timestampFor(candidate.deadline_at, true);
        if (Number.isFinite(deadline) && deadline < now.getTime()) {
          stats.expiredCount += 1;
          addExcluded(excluded, candidate, 'expired');
          continue;
        }
        candidates.push(candidate);
      }
    } catch (error) {
      warnings.push(`中国化学${label}读取异常：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  for (const channel of CNCEC_NOTICE_CHANNELS) {
    await readPage(`${CNCEC_BASE_URL}cms/channel/${channel.path}/index.htm`, channel.label);
    if (rateLimited) break;
  }
  for (const term of terms) {
    if (rateLimited) break;
    const url = new URL('cms/search.htm', CNCEC_BASE_URL);
    url.searchParams.set('kwd', term);
    url.searchParams.set('channelIds', CNCEC_SEARCH_CHANNEL_IDS);
    await readPage(url.toString(), '站内产品检索', term);
  }
  const unique = uniqueCandidates(candidates, stats, excluded);
  const summary = `中国化学货物招标、询比/询价和竞判，与 ${terms.length} 个产品词共读取 ${stats.rawCount} 条，排除过期 ${stats.expiredCount} 条、陈旧 ${stats.staleCount} 条，去重 ${stats.duplicateCount} 条，保留 ${unique.length} 条交给 LLM。`;
  return resultFor({ task, provider, searchTerms: terms, stats, candidates: unique, warnings, excludedNotices: excluded, summary });
};

export const readCncecPublicCandidateDetail = async ({
  candidate, fetchImpl = fetch,
}: { candidate: TenderCandidate; fetchImpl?: FetchLike }): Promise<TenderCandidate> => {
  const response = await fetchWithIpv4DnsFallback(candidate.url, { headers: { 'Referer': `${CNCEC_BASE_URL}cms/channel/ywgg1hw/index.htm`, 'User-Agent': 'HCZ-ERP-Bid-Agent/1.0' } }, fetchImpl);
  const html = await responseText(response);
  if (!response.ok) throw new Error(`中国化学公告详情读取失败：HTTP ${response.status}`);
  const articleHtml = html.match(/<div\b[^>]*class=["'][^"']*ninfo-con[^"']*["'][^>]*>([\s\S]*?)<div\b[^>]*class=["'][^"']*ip-link[^"']*["']/i)?.[1] || html;
  const text = normalizeText(articleHtml).slice(0, 26_000);
  const attachments = [...new Set([
    ...candidate.attachments,
    ...[...articleHtml.matchAll(/href=["']([^"']+)["']/gi)].map((match) => normalizeUrl(match[1].replace(/&amp;/gi, '&'), candidate.url)),
  ])].filter((item) => /\.(?:pdf|docx?|xlsx?)(?:[?#]|$)|(?:download|attachment|file)/i.test(item)).slice(0, 10);
  return {
    ...candidate,
    title: normalizeText(html.match(/class=["'][^"']*ninfo-title[^"']*["'][^>]*>[\s\S]*?<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '') || candidate.title,
    buyer_name: normalizeText(text.match(/(?:采\s*购\s*人|招\s*标\s*人)\s*(?:为|[：:])\s*([^。，,；]{2,100}?)(?=[。，,；]|\s*(?:现进行|地址|联系人)[：:]|$)/)?.[1] || '') || candidate.buyer_name,
    deadline_at: deadlineFromText(text) || candidate.deadline_at,
    raw_text: normalizeText(`${candidate.raw_text} 【公告网页正文】${text}`).slice(0, 30_000),
    attachments,
  };
};
