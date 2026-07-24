import { createDecipheriv } from 'node:crypto';

import type { CandidateBundle, CollectionArtifact, PublicCollectionTask, TenderCandidate } from '../domain/collection.ts';
import {
  MAX_DISCOVERY_EXCLUDED_NOTICES,
  type CollectionDiscoveryStats,
  type DiscoveryExcludedNotice,
  type DiscoveryExclusionReason,
} from '../domain/discovery.ts';
import { definitionFor } from './registry.ts';

export type SitePublicFeedResult = {
  provider: string;
  status: 'unsupported' | 'success' | 'no_new' | 'failed';
  candidateBundle: CandidateBundle | null;
  artifacts: CollectionArtifact[];
  warnings: string[];
  summary?: string;
  discoveryStats?: CollectionDiscoveryStats;
};

type FetchLike = typeof fetch;

const GUONENG_EGOU_FEEDS = [
  {
    name: '国能E购-询价采购公告',
    url: 'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireOne/index.json',
  },
  {
    name: '国能E购-竞争性谈判公告',
    url: 'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireTwo/index.json',
  },
  {
    name: '国能E购-竞价公告',
    url: 'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireBidding/index.json',
  },
  {
    name: '国能E购-紧急/直接/零星采购公告',
    url: 'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireUrgent/index.json',
  },
];
const GUONENG_EGOU_SEARCH_ENDPOINT = 'https://www.neep.shop/rest/service/routing/nouser/inquiry/quote/searchCmsArticleList';
const GUONENG_EGOU_SEARCH_NOTICE_TYPES = [
  { name: '询价采购公告', noticeType: 1 },
  { name: '竞争性谈判公告', noticeType: 2 },
  { name: '竞价公告', noticeType: 8 },
  { name: '紧急/直接/零星采购公告', noticeType: 7 },
];
const SINOPEC_NOTICE_URL = 'https://ec.sinopec.com/supp/index.shtml';
const SINOCHEM_NOTICE_ENDPOINT = 'https://scm.esinochem.com/gateway/obs/business/notice/outer/page/queryPageList';
const YMZ_NOTICE_ENDPOINT = 'https://www.ymzec.com/bid-api/api/truelore-business-support/noauth/trans/trade/pageEs';
const YMZ_DETAIL_ENDPOINT = 'https://www.ymzec.com/bid-api/api/truelore-business-support/noauth/trans/trade/getByTradeId';
const GUONENG_EBID_SEARCH_ENDPOINT = 'https://www.chnenergybidding.com.cn/bidfulltextsearch/rest/inteligentSearch/getFullTextData';
const GUONENG_EBID_BASE_URL = 'https://www.chnenergybidding.com.cn/';
const CNOOC_LIST_ENDPOINT = 'https://bid.cnooc.com.cn/prodeta/homeportalweb/portal/indexHome/background/businessannouncement/page';
const CNOOC_DETAIL_ENDPOINT = 'https://bid.cnooc.com.cn/prodeta/homeportalweb/portal/indexHome/background/businessannouncement/detail';
const YANCHANG_NOTICE_ENDPOINT = 'https://zc.sxycpc.com/ebidPortal/listNoticePage';
const YANCHANG_SNTBA_SEARCH_ENDPOINT = 'http://bulletin.sntba.com/xxfbcmses/search/bulletin.html';
const YANCHANG_SNTBA_SECRET_ENDPOINT = 'http://39.107.102.206:8087/permission/getSecretKey';
const YANCHANG_SNTBA_PDF_ENDPOINT = 'http://39.107.102.206:8087/bulletin/getBulletin';
const YANCHANG_REGULATION_SCRIPT_URL = 'http://61.185.253.156:18088/ztbView/js/ztbSystem.js';
const YANCHANG_REGULATION_ENDPOINT = 'https://61.185.253.156:8085/ztb/GainData/GetInformation';
const YANCHANG_REGULATION_LIST_URL = 'http://61.185.253.156:18088/ztbView/regulation.html?dHlwZSUzRE4yJTI2bGltaXQlM0RmYWxzZQ==';
const NORINCO_BID_SEARCH_ENDPOINT = 'https://bid.norincogroup-ebuy.com/retrieve.do';
const LONGDAO_SEARCH_ENDPOINT = 'https://search-plus.longdaoyun.com/query/bulletin/list';
const JINNENG_NOTICE_ENDPOINT = 'http://www.jinnengtech.com:6789/webportal/index/bidnotice/getBidNoticeList.do';
const JINNENG_BASE_URL = 'http://www.jinnengtech.com:6789/';
const YANCHANG_NOTICE_CATEGORIES = [
  { requestType: '0001', detailType: 1, label: '招标公告' },
  { requestType: '001', detailType: 20, label: '非招标公告' },
];
const PUBLIC_HTML_CANDIDATE_LIMIT = 30;
const PUBLIC_FEED_SEARCH_TERM_LIMIT = 24;
const PUBLIC_FEED_SEARCH_PAGE_SIZE = 10;
const PUBLIC_FEED_BASELINE_LIMIT_AFTER_MATCH = 0;
const BUSINESS_SEARCH_TERM_LIMIT = 18;
const YMZ_SEARCH_TERM_LIMIT = 24;
const BUSINESS_SEARCH_PAGE_SIZE = 50;
const SINOCHEM_BASELINE_PAGE_LIMIT = 2;
const BUSINESS_SEARCH_PAGE_LIMIT = 3;
const YMZ_SEARCH_PAGE_LIMIT = 6;
const YANCHANG_SNTBA_PAGE_LIMIT = 12;
const GUONENG_QUERY_INTERVAL_MS = 350;
const PUBLIC_SEARCH_QUERY_INTERVAL_MS = 500;
const DEFAULT_BUSINESS_QUERY_INTERVAL_MS = 1_500;
let lastYmzDetailRequestAt = 0;
let lastLongdaoDetailRequestAt = 0;
let lastJinnengDetailRequestAt = 0;
let lastYanchangDetailRequestAt = 0;
const ACTIVE_NOTICE_PATTERN = /招标公告|采购公告|询价|询比|竞价|谈判|公开招标|邀请招标/;
const RESULT_NOTICE_PATTERN = /中标|成交|结果公告|结果公示|预成交|评标结果|流标|废标/;
const SINOCHEM_NON_PURCHASE_PATTERN = /出售|处置|回收|报废|废旧|次品|等外品|终炼胶/;
const YANCHANG_NON_GOODS_PATTERN = /工程|施工|维修|服务|设计|监理|劳务|租赁|设备安装/;
const YANCHANG_BUYER_PATTERN = /陕西延长石油|延长石油(?:集团|物资|油田|炼化|矿业|煤业|化工|能源)?|延长油田|榆林能化|榆神能化|延安能化|兴化化工/;
const NORINCO_NON_GOODS_PATTERN = /项目行业：(工程|服务)|(?:施工|维修|设计|监理|劳务|租赁|系统集成)(?:项目|服务|招标)/;
const LONGDAO_ENDED_PATTERN = /已结束|已截止|已终止|终止|流标|废标/;
const LONGDAO_LOGIN_REQUIRED_PATTERN = /(?:注册|登录).{0,12}(?:查看|获取).{0,12}(?:完整|全部)(?:公告|采购|项目信息)|完整(?:公告|采购|项目信息).{0,12}(?:注册|登录)/;
const JINNENG_NON_GOODS_PATTERN = /(?:物流|运费|维修|施工|服务|处置|销售|废旧|废物)/;
const JINNENG_ENDED_PATTERN = /报价已结束|提前结标/;
const JINNENG_CATEGORIES = [
  { kind: '1', label: '招标采购', recentDays: 30 },
  { kind: '2', label: '直接定价', recentDays: 14 },
  { kind: '3', label: '竞价公告', recentDays: 14 },
  { kind: '4', label: '公开招标', recentDays: 30 },
];
const JINNENG_PAGE_LIMIT = 20;
const YMZ_DISCOVERY_SCOPES = [
  { label: '招标采购', purchaseModeCode: '' },
  { label: '非招标采购（谈判/询比）', purchaseModeCode: '4,5' },
];
const CNOOC_COLUMNS = [
  { id: '1', label: '招标公告', childIndex: 4 },
  { id: '4', label: '非招标公告', childIndex: 2 },
];
const CNOOC_BASELINE_PAGE_LIMIT = 1;
const GUONENG_EBID_BASELINE_PAGES = [
  { path: '001/001002', label: '招标公告' },
  { path: '001/001003', label: '非招标公告' },
  { path: '001/001004', label: '变更公告' },
];
const GUONENG_EBID_ACTIVE_CATEGORY_PATTERN = /^001(?:002|003|004)/;
const GUONENG_EBID_BASELINE_PAGE_LIMIT = 1;

const normalizeText = (value = '') => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&gt;/gi, '>')
  .replace(/&lt;/gi, '<')
  .replace(/&amp;/gi, '&')
  .replace(/&#40;/gi, '(')
  .replace(/&#41;/gi, ')')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeNoticeHtml = (value = '') => normalizeText(
  String(value || '')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<(?:style|script|noscript|template)\b[^>]*>[^]*?<\/(?:style|script|noscript|template)>/gi, ' '),
);

const normalizeDate = (value = '') => {
  const raw = String(value || '').trim();
  if (/^\d{13}$/.test(raw)) {
    const date = new Date(Number(raw));
    if (!Number.isNaN(date.getTime())) {
      return formatShanghaiDate(date);
    }
  }
  const match = raw.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const normalizeUrl = (value = '', baseUrl = '') => {
  try {
    return new URL(value, baseUrl || undefined).toString();
  } catch {
    return value;
  }
};

const rowValue = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
};

const rowsFromPayload = (payload: any): Record<string, unknown>[] => {
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const guonengEgouCandidateFromRow = ({
  row,
  sourceLabel,
  baseUrl,
}: {
  row: Record<string, unknown>;
  sourceLabel: string;
  baseUrl: string;
}): CandidateBundle['candidates'][number] | null => {
  const title = normalizeText(rowValue(row, ['inquireName', 'title', 'noticeName', 'enquiryOrderName', 'projectName']));
  const link = rowValue(row, ['articleUrl', 'link', 'url', 'noticeUrl', 'href']);
  if (!title || !link) return null;
  const url = normalizeUrl(link, baseUrl);
  const publishedAt = normalizeDate(rowValue(row, ['publishTimeString', 'publishTime', 'noticeSendTime', 'createTime', 'releaseTime']));
  const deadlineAt = normalizeDate(rowValue(row, ['quotDeadlineString', 'quotDeadline', 'deadline', 'endTime', 'bidEndTime']));
  const buyerName = normalizeText(rowValue(row, ['publishArea', 'buyerName', 'purchaseUnit', 'purchaser', 'purchaseOrg']));
  const inquiryCode = normalizeText(rowValue(row, ['inquireCode', 'purchaseNum', 'articleCode', 'inquiryIdSeq']));
  return {
    title,
    url,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    buyer_name: buyerName,
    raw_text: normalizeText([
      sourceLabel,
      title,
      buyerName,
      inquiryCode ? `采购编号：${inquiryCode}` : '',
      publishedAt ? `发布时间：${publishedAt}` : '',
      deadlineAt ? `报价截止：${deadlineAt}` : '',
      rowValue(row, ['fullText']),
    ].filter(Boolean).join(' ')),
    attachments: [],
  };
};

const shouldKeepPublicNotice = (title = '') => (
  ACTIVE_NOTICE_PATTERN.test(title) && !RESULT_NOTICE_PATTERN.test(title)
);

const candidateKey = (title = '', url = '', publishedAt = '') => {
  const stableDate = normalizeDate(publishedAt).slice(0, 10);
  return `${title.replace(/\s+/g, '')}|${stableDate || url}`;
};

const unique = <T>(items: T[]) => [...new Set(items.filter(Boolean))];

const splitSearchTerms = (value = '') => value
  .split(/[,\n，、;；\s]+/)
  .map((term) => term.trim())
  .filter(Boolean);

const formatShanghaiDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const shanghaiDayStart = (date: Date, daysBack = 0) => {
  const current = Date.parse(`${formatShanghaiDate(date)}T00:00:00+08:00`);
  return current - daysBack * 24 * 60 * 60 * 1_000;
};

const timestampFor = (value: unknown, endOfDay = false) => {
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1_000;
  if (/^20\d{2}-\d{2}-\d{2}$/.test(raw)) {
    return Date.parse(`${raw}T${endOfDay ? '23:59:59' : '00:00:00'}+08:00`);
  }
  return Date.parse(raw);
};

const deadlineDateFromText = (value = '') => {
  const text = normalizeText(value);
  const match = text.match(
    /(?:投标文件|响应文件|报价文件|申请文件|投标|响应|报价|递交|提交|询价|报名)[^。；，]{0,20}?截止时间[：:]?\s*(20\d{2}[年\-/.]\d{1,2}[月\-/.]\d{1,2})/,
  ) || text.match(/截止时间[：:]?\s*(20\d{2}[年\-/.]\d{1,2}[月\-/.]\d{1,2})/);
  return normalizeDate(match?.[1] || '');
};

const waitForInterval = async (lastRequestAt: number, minimumIntervalMs: number) => {
  const remaining = Math.max(0, minimumIntervalMs - (Date.now() - lastRequestAt));
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
};

const businessSearchTermsFor = (task: PublicCollectionTask, limit = BUSINESS_SEARCH_TERM_LIMIT) => {
  const site = definitionFor(task.sourceName);
  const requested = splitSearchTerms(task.searchTerms || '');
  const explicitlyFocused = requested.length > 0 && requested.length <= 3;
  return unique(explicitlyFocused ? requested : [...site.deepSearchTerms, ...requested])
    .filter((term) => term.length >= 2)
    .filter((term) => !/^(中化|中国石油|云梦泽|采购|公告|招标|询价|化工助剂)$/.test(term))
    .slice(0, limit);
};

type PublicCollectionStats = {
  requests: number;
  successfulRequests: number;
  rawCount: number;
  expiredCount: number;
  nonActionableCount: number;
  duplicateCount: number;
  truncatedCount: number;
  endedCount?: number;
  staleCount?: number;
  resultCount?: number;
};

const addExcludedNotice = (
  target: DiscoveryExcludedNotice[],
  candidate: CandidateBundle['candidates'][number] | null,
  reason: DiscoveryExclusionReason,
) => {
  if (!candidate || target.length >= MAX_DISCOVERY_EXCLUDED_NOTICES) return;
  target.push({
    title: candidate.title.slice(0, 500),
    url: candidate.url.slice(0, 2_000),
    publishedAt: candidate.published_at,
    deadlineAt: candidate.deadline_at,
    reason,
  });
};

const discoveryStatsFor = ({
  provider,
  stats,
  eligibleCount,
  warnings,
  excludedNotices,
}: {
  provider: string;
  stats: PublicCollectionStats;
  eligibleCount: number;
  warnings: string[];
  excludedNotices: DiscoveryExcludedNotice[];
}): CollectionDiscoveryStats => ({
  provider,
  requestCount: stats.requests,
  successfulRequestCount: stats.successfulRequests,
  rawCount: stats.rawCount,
  eligibleCount,
  expiredCount: stats.expiredCount,
  nonActionableCount: stats.nonActionableCount,
  duplicateCount: stats.duplicateCount,
  truncatedCount: stats.truncatedCount,
  llmIgnoredCount: 0,
  endedCount: stats.endedCount || 0,
  staleCount: stats.staleCount || 0,
  resultCount: stats.resultCount || 0,
  warnings: warnings.slice(0, 20),
  excludedNotices: excludedNotices.slice(0, MAX_DISCOVERY_EXCLUDED_NOTICES),
});

const publicSummaryArtifact = ({
  task,
  provider,
  summary,
  searchTerms,
  stats,
  warnings,
  candidates,
}: {
  task: PublicCollectionTask;
  provider: string;
  summary: string;
  searchTerms: string[];
  stats: PublicCollectionStats;
  warnings: string[];
  candidates: CandidateBundle['candidates'];
}): CollectionArtifact => ({
  artifact_type: 'network_response',
  title: `${task.sourceName} 公开查询摘要`,
  url: task.entryUrl,
  content: JSON.stringify({
    provider,
    summary,
    searchTerms,
    stats,
    warnings,
    candidates: candidates.map((candidate) => ({
      title: candidate.title,
      url: candidate.url,
      published_at: candidate.published_at,
      deadline_at: candidate.deadline_at,
      search_query: candidate.search_query,
    })),
  }, null, 2).slice(0, 80_000),
  mime_type: 'application/json',
});

const formatDateTimeForQuery = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ` +
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
);

const parseMaybeJsonp = (text = '') => {
  const trimmed = text.trim();
  const jsonpMatch = trimmed.match(/^[\w.$]+\(([\s\S]*)\)\s*;?$/);
  return JSON.parse(jsonpMatch ? jsonpMatch[1] : trimmed || '{}');
};

const guonengEgouSearchTermsFor = (task: PublicCollectionTask) => {
  const site = definitionFor(task.sourceName);
  const requested = splitSearchTerms(task.searchTerms || '');
  return unique(requested.length > 0 && requested.length <= 3
    ? requested
    : [...site.deepSearchTerms, ...requested])
    .filter((term) => term.length >= 2)
    .filter((term) => !/^(国能|国能E购|询价|竞价|竞争性谈判|采购|公告|化工助剂)$/.test(term))
    .slice(0, PUBLIC_FEED_SEARCH_TERM_LIMIT);
};

const collectPublicHtmlFeed = async ({
  task,
  feedName,
  url,
  parse,
  fetchImpl,
}: {
  task: PublicCollectionTask;
  feedName: string;
  url: string;
  parse: (html: string, baseUrl: string) => CandidateBundle['candidates'];
  fetchImpl: FetchLike;
}): Promise<SitePublicFeedResult> => {
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'HCZ-ERP-Bid-Agent/1.0' },
    });
    const text = await response.text();
    const artifacts: CollectionArtifact[] = [{
      artifact_type: 'network_response',
      title: `${feedName} HTML`,
      url,
      content: text.slice(0, 80_000),
      mime_type: 'text/html',
    }];
    if (!response.ok) {
      return {
        provider: `site-public-feed:${feedName}`,
        status: 'failed',
        candidateBundle: null,
        artifacts,
        warnings: [`${feedName} 读取失败：HTTP ${response.status}`],
      };
    }
    const seen = new Set<string>();
    const candidates = parse(text, url)
      .filter((candidate) => {
        const key = candidateKey(candidate.title, candidate.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, PUBLIC_HTML_CANDIDATE_LIMIT);
    return {
      provider: `site-public-feed:${feedName}`,
      status: candidates.length ? 'success' : 'no_new',
      candidateBundle: candidates.length ? {
        source_name: task.sourceName,
        candidates,
      } : null,
      artifacts,
      warnings: [],
    };
  } catch (error) {
    return {
      provider: `site-public-feed:${feedName}`,
      status: 'failed',
      candidateBundle: null,
      artifacts: [],
      warnings: [`${feedName} 读取异常：${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

const parseSinopecPublicHtml = (
  html: string,
  baseUrl: string,
): CandidateBundle['candidates'] => {
  const candidates: CandidateBundle['candidates'] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']*\/f\/supp\/notice\/[^"']+\.do[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>[\s\S]{0,240}?<div\b[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const title = normalizeText(match[2]);
    if (!shouldKeepPublicNotice(title)) continue;
    const publishedAt = normalizeDate(normalizeText(match[3]));
    candidates.push({
      title,
      url: normalizeUrl(match[1], baseUrl),
      published_at: publishedAt,
      deadline_at: '',
      buyer_name: '中石化',
      raw_text: normalizeText([title, publishedAt ? `发布时间：${publishedAt}` : ''].filter(Boolean).join(' ')),
      attachments: [],
    });
  }
  return candidates;
};

export const collectSinopecPublicHtml = async ({
  task,
  fetchImpl = fetch,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
}): Promise<SitePublicFeedResult> => collectPublicHtmlFeed({
  task,
  feedName: 'sinopec-public-html',
  url: task.entryUrl || SINOPEC_NOTICE_URL,
  parse: parseSinopecPublicHtml,
  fetchImpl,
});

const sinochemCandidateFromRow = ({
  row,
  searchQuery = '',
}: {
  row: Record<string, unknown>;
  searchQuery?: string;
}): CandidateBundle['candidates'][number] | null => {
  const title = normalizeText(rowValue(row, ['title', 'noticeName']));
  const noticeId = rowValue(row, ['noticeId']);
  if (!title || !noticeId) return null;
  const publishedAt = normalizeDate(rowValue(row, ['startTime', 'startTimeStr', 'createTime']));
  const deadlineAt = normalizeDate(rowValue(row, ['endTime', 'endTimeStr']));
  const buyerName = normalizeText(rowValue(row, ['buName', 'purchaseCompanyName']));
  const detailUrl = `https://scm.esinochem.com/hpc/index.html#/details?noticeId=${encodeURIComponent(noticeId)}&title=${encodeURIComponent(encodeURIComponent(title))}`;
  const attachmentRows = (() => {
    const value = row.attachmentsDTOs;
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [];
    } catch {
      return [];
    }
  })();
  const attachments = unique([
    rowValue(row, ['preSupFileId']),
    rowValue(row, ['aftSupFileId']),
    rowValue(row, ['pdfUrl']),
    ...attachmentRows.map((attachment) => rowValue(attachment, ['fileUrl', 'downloadUrl', 'url', 'attachmentUrl'])),
  ]).filter((url) => /^https?:/i.test(url));
  const content = normalizeText(rowValue(row, ['content', 'noticeContent', 'description'])).slice(0, 12_000);
  return {
    title,
    url: detailUrl,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    buyer_name: buyerName,
    raw_text: normalizeText([
      title,
      buyerName ? `采购人：${buyerName}` : '',
      rowValue(row, ['requireTypeDesc']) ? `需求类型：${rowValue(row, ['requireTypeDesc'])}` : '',
      rowValue(row, ['purchaseMethodDesc']) ? `采购方式：${rowValue(row, ['purchaseMethodDesc'])}` : '',
      publishedAt ? `发布时间：${publishedAt}` : '',
      deadlineAt ? `截止时间：${deadlineAt}` : '',
      searchQuery ? '来自站内产品检索' : '公告大厅近期物资',
      content ? `【公告网页正文】${content}` : '',
    ].filter(Boolean).join(' ')),
    attachments,
    search_query: searchQuery || undefined,
    notice_type: normalizeText(rowValue(row, ['noticeTypeName', 'plateTypeName', 'purchaseMethodDesc'])) || undefined,
  };
};

export const collectSinochemPublicNotices = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:sinochem-notice-hall';
  const site = definitionFor(task.sourceName);
  const searchTerms = businessSearchTermsFor(task);
  const recentDays = site.browserJourney?.recentDays || 14;
  const queryBeginTime = formatShanghaiDate(new Date(shanghaiDayStart(now, recentDays)));
  const queryEndTime = formatShanghaiDate(now);
  const warnings: string[] = [];
  const stats: PublicCollectionStats = {
    requests: 0,
    successfulRequests: 0,
    rawCount: 0,
    expiredCount: 0,
    nonActionableCount: 0,
    duplicateCount: 0,
    truncatedCount: 0,
  };
  const excludedNotices: DiscoveryExcludedNotice[] = [];
  const matchedCandidates: CandidateBundle['candidates'] = [];
  const baselineCandidates: CandidateBundle['candidates'] = [];
  let lastRequestAt = 0;
  let rateLimited = false;

  const fetchPage = async (title: string, page: number) => {
    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    const url = `${SINOCHEM_NOTICE_ENDPOINT}?t=${Date.now()}`;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://scm.esinochem.com/hpc/index.html',
          'User-Agent': 'HCZ-ERP-Bid-Agent/1.0',
        },
        body: JSON.stringify({
          start: (page - 1) * BUSINESS_SEARCH_PAGE_SIZE,
          limit: BUSINESS_SEARCH_PAGE_SIZE,
          currentPage: page,
          model: {
            noticeType: '01',
            title,
            state: '',
            requireType: '101',
            queryBeginTime,
            queryEndTime,
          },
        }),
      });
      const retryAfter = response.headers.get('retry-after') || '';
      if (response.status === 429 || response.status === 503) {
        rateLimited = true;
        warnings.push(`中化公告大厅触发访问限制${retryAfter ? `，建议 ${retryAfter} 后重试` : ''}`);
        return null;
      }
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || !payload?.status || payload?.code !== '000000') {
        warnings.push(`中化公告大厅查询失败：HTTP ${response.status} / ${payload?.code || 'unknown'} ${payload?.msg || ''}`.trim());
        return null;
      }
      stats.successfulRequests += 1;
      return payload.data || { root: [], totalCount: 0, totalPage: 0 };
    } catch (error) {
      warnings.push(`中化公告大厅查询异常：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const collectRows = (
    rows: Record<string, unknown>[],
    searchQuery: string,
    target: CandidateBundle['candidates'],
  ) => {
    for (const row of rows) {
      stats.rawCount += 1;
      const title = normalizeText(rowValue(row, ['title', 'noticeName']));
      const candidate = sinochemCandidateFromRow({ row, searchQuery });
      const deadline = timestampFor(rowValue(row, ['endTime', 'endTimeStr']), true);
      if (Number.isFinite(deadline) && deadline < now.getTime()) {
        stats.expiredCount += 1;
        addExcludedNotice(excludedNotices, candidate, 'expired');
        continue;
      }
      const requirement = normalizeText(rowValue(row, ['requireTypeDesc']));
      const plateType = rowValue(row, ['plateType']);
      if ((requirement && requirement !== '物资') || plateType === 'Auction' || SINOCHEM_NON_PURCHASE_PATTERN.test(title)) {
        stats.nonActionableCount += 1;
        addExcludedNotice(excludedNotices, candidate, 'non_actionable');
        continue;
      }
      if (candidate) target.push(candidate);
    }
  };

  const collectQuery = async (title: string, pageLimit: number, target: CandidateBundle['candidates']) => {
    for (let page = 1; page <= pageLimit && !rateLimited; page += 1) {
      const data = await fetchPage(title, page);
      if (!data) break;
      const rows = Array.isArray(data.root) ? data.root as Record<string, unknown>[] : [];
      collectRows(rows, title, target);
      const totalPages = Math.max(1, Number(data.totalPage) || Math.ceil(Number(data.totalCount || 0) / BUSINESS_SEARCH_PAGE_SIZE));
      if (page >= totalPages || rows.length < BUSINESS_SEARCH_PAGE_SIZE) break;
    }
  };

  await collectQuery('', SINOCHEM_BASELINE_PAGE_LIMIT, baselineCandidates);
  for (const term of searchTerms) {
    if (rateLimited) break;
    await collectQuery(term, BUSINESS_SEARCH_PAGE_LIMIT, matchedCandidates);
  }

  const seen = new Set<string>();
  const uniqueCandidates = [...matchedCandidates, ...baselineCandidates]
    .filter((candidate) => {
      const key = candidateKey(candidate.title, candidate.url);
      if (seen.has(key)) {
        stats.duplicateCount += 1;
        addExcludedNotice(excludedNotices, candidate, 'duplicate');
        return false;
      }
      seen.add(key);
      return true;
    });
  const candidateLimit = site.maxCandidates || 80;
  const candidates = uniqueCandidates.slice(0, candidateLimit);
  for (const candidate of uniqueCandidates.slice(candidateLimit)) {
    stats.truncatedCount += 1;
    addExcludedNotice(excludedNotices, candidate, 'candidate_limit');
  }
  const discoveryStats = discoveryStatsFor({
    provider,
    stats,
    eligibleCount: candidates.length,
    warnings,
    excludedNotices,
  });
  const summary = [
    `中化公告大厅已检索近期物资和产品词 ${searchTerms.length} 个`,
    `接口请求 ${stats.requests} 次，读取原始记录 ${stats.rawCount} 条`,
    `排除已截止 ${stats.expiredCount} 条，排除非物资/处置类 ${stats.nonActionableCount} 条，去重 ${stats.duplicateCount} 条，候选上限未展开 ${stats.truncatedCount} 条`,
    `保留 ${candidates.length} 条交给 LLM 筛选${warnings.length ? `；${warnings.length} 个查询存在异常` : ''}。`,
  ].join('；');
  const artifacts = [publicSummaryArtifact({
    task,
    provider,
    summary,
    searchTerms,
    stats,
    warnings,
    candidates,
  })];
  return {
    provider,
    status: candidates.length ? 'success' : warnings.length ? 'failed' : 'no_new',
    candidateBundle: candidates.length ? { source_name: task.sourceName, candidates } : null,
    artifacts,
    warnings,
    summary,
    discoveryStats,
  };
};

const ymzCandidateFromRow = ({
  row,
  searchQuery,
  sourceLabel = '',
}: {
  row: Record<string, unknown>;
  searchQuery: string;
  sourceLabel?: string;
}): CandidateBundle['candidates'][number] | null => {
  const title = normalizeText(rowValue(row, ['businessName', 'title']));
  const id = rowValue(row, ['id']);
  if (!title || !id) return null;
  const noticeType = rowValue(row, ['noticeType']);
  const publishStatus = rowValue(row, ['publishStatus']) || '2';
  const publishedAt = normalizeDate(rowValue(row, ['releaseTime']));
  const deadlineAt = normalizeDate(rowValue(row, ['bidEndTime', 'endTime']));
  const buyerName = normalizeText(rowValue(row, ['tendererName', 'purchaseName']));
  const url = `https://www.ymzec.com/bid/web-outportal/index.html#/trade-info-detail?id=${encodeURIComponent(id)}&noticeType=${encodeURIComponent(noticeType)}&publishStatus=${encodeURIComponent(publishStatus)}`;
  return {
    title,
    url,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    buyer_name: buyerName,
    raw_text: normalizeText([
      title,
      buyerName ? `招标人：${buyerName}` : '',
      rowValue(row, ['purchaseProjectCode']) ? `项目编号：${rowValue(row, ['purchaseProjectCode'])}` : '',
      publishedAt ? `发布时间：${publishedAt}` : '',
      deadlineAt ? `截止时间：${deadlineAt}` : '',
      rowValue(row, ['purchaseModeName', 'purchasingMethodName'])
        ? `采购方式：${rowValue(row, ['purchaseModeName', 'purchasingMethodName'])}`
        : sourceLabel,
      `公告类型：${noticeType}`,
      '来自站内产品检索',
    ].filter(Boolean).join(' ')),
    attachments: [],
    search_query: searchQuery,
    notice_type: noticeType === '2' ? '变更公告' : '采购/招标公告',
  };
};

export type PublicCandidateDetailReader = (input: { candidate: TenderCandidate }) => Promise<TenderCandidate>;

export const readYmzPublicCandidateDetail = async ({
  candidate,
  fetchImpl = fetch,
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  candidate: TenderCandidate;
  fetchImpl?: FetchLike;
  minimumIntervalMs?: number;
}): Promise<TenderCandidate> => {
  const hashParams = new URLSearchParams((new URL(candidate.url).hash.split('?')[1] || ''));
  const id = hashParams.get('id') || '';
  const noticeType = hashParams.get('noticeType') || '1';
  if (!id) throw new Error('云梦泽公告链接缺少 trade id');
  await waitForInterval(lastYmzDetailRequestAt, minimumIntervalMs);
  lastYmzDetailRequestAt = Date.now();
  const url = `${YMZ_DETAIL_ENDPOINT}?id=${encodeURIComponent(id)}&noticeType=${encodeURIComponent(noticeType)}`;
  const response = await fetchImpl(url, {
    headers: {
      'Referer': candidate.url,
      'User-Agent': 'HCZ-ERP-Bid-Agent/1.0',
    },
  });
  if (response.status === 429 || response.status === 503) {
    throw new Error(`云梦泽详情接口触发访问限制：HTTP ${response.status}`);
  }
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.success !== true || !payload?.data?.biddingNotice) {
    throw new Error(`云梦泽详情接口读取失败：HTTP ${response.status} / ${payload?.errCode || 'unknown'}`);
  }
  const notice = payload.data.biddingNotice as Record<string, any>;
  const fileRows = [
    ...(Array.isArray(notice.announceFileDtoList) ? notice.announceFileDtoList : []),
    ...(notice.htmlFileUrl ? [{ downLoadUrl: notice.htmlFileUrl }] : []),
    ...(Array.isArray(notice.remarksFileDtoList) ? notice.remarksFileDtoList : []),
    ...(Array.isArray(notice.bidSectionList)
      ? notice.bidSectionList.flatMap((section: Record<string, any>) => [
        ...(Array.isArray(section.announceFileDtoList) ? section.announceFileDtoList : []),
        ...(Array.isArray(section.remarksFileDtoList) ? section.remarksFileDtoList : []),
      ])
      : []),
  ];
  const attachments = unique([
    ...candidate.attachments,
    ...fileRows.map((file: Record<string, unknown>) => rowValue(file, ['downLoadUrl', 'downloadUrl', 'fileUrl', 'url'])),
  ]).filter((attachment) => /^https?:/i.test(attachment)).slice(0, 10);
  const deadlineAt = normalizeDate(rowValue(notice, ['bidEndTime', 'newBidEndTime'])) || candidate.deadline_at;
  const documentDeadline = normalizeDate(rowValue(notice, ['tenderDocGetEndTime', 'newTenderDocGetEndTime']));
  const buyerName = normalizeText(rowValue(notice, ['tendererName', 'purchaseName'])) || candidate.buyer_name;
  const publicText = normalizeText([
    rowValue(notice, ['projectOverview']),
    rowValue(notice, ['purchaseModeName']) ? `采购方式：${rowValue(notice, ['purchaseModeName'])}` : '',
    rowValue(notice, ['purchaseProjectTypeName']) ? `项目类型：${rowValue(notice, ['purchaseProjectTypeName'])}` : '',
    documentDeadline ? `文件获取截止时间：${documentDeadline}` : '',
    deadlineAt ? `投标截止时间：${deadlineAt}` : '',
  ].filter(Boolean).join(' '));
  return {
    ...candidate,
    title: normalizeText(rowValue(notice, ['businessName'])) || candidate.title,
    buyer_name: buyerName,
    deadline_at: deadlineAt,
    raw_text: normalizeText([
      candidate.raw_text,
      publicText ? `【公告网页正文】${publicText}` : '',
    ].filter(Boolean).join(' ')).slice(0, 20_000),
    attachments,
  };
};

export const collectYmzPublicNotices = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:ymz-recent-search';
  const site = definitionFor(task.sourceName);
  const searchTerms = businessSearchTermsFor(task, YMZ_SEARCH_TERM_LIMIT);
  const recentDays = site.browserJourney?.recentDays || 30;
  const releaseStartTime = shanghaiDayStart(now, recentDays);
  const releaseEndTime = now.getTime();
  const warnings: string[] = [];
  const stats: PublicCollectionStats = {
    requests: 0,
    successfulRequests: 0,
    rawCount: 0,
    expiredCount: 0,
    nonActionableCount: 0,
    duplicateCount: 0,
    truncatedCount: 0,
  };
  const collected: CandidateBundle['candidates'] = [];
  const excludedNotices: DiscoveryExcludedNotice[] = [];
  let lastRequestAt = 0;
  let rateLimited = false;

  const fetchPage = async (term: string, page: number, scope: typeof YMZ_DISCOVERY_SCOPES[number]) => {
    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    try {
      const response = await fetchImpl(YMZ_NOTICE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.ymzec.com',
          'Referer': 'https://www.ymzec.com/bid/web-outportal/index.html',
          'User-Agent': 'HCZ-ERP-Bid-Agent/1.0',
        },
        body: JSON.stringify({
          pageNum: page,
          pageSize: BUSINESS_SEARCH_PAGE_SIZE,
          businessName: term,
          releaseEndTime,
          releaseStartTime,
          purchaseProjectType: '',
          purchaseModes: [],
          purchasePatternId: '',
          tendererName: '',
          noticeTypes: ['1', '2'],
          ...(scope.purchaseModeCode ? { purchaseModeCode: scope.purchaseModeCode } : {}),
        }),
      });
      const retryAfter = response.headers.get('retry-after') || '';
      if (response.status === 429 || response.status === 503) {
        rateLimited = true;
        warnings.push(`云梦泽触发访问限制${retryAfter ? `，建议 ${retryAfter} 后重试` : ''}`);
        return null;
      }
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || payload?.success !== true || payload?.errCode) {
        warnings.push(`云梦泽查询失败：HTTP ${response.status} / ${payload?.errCode || 'unknown'} ${payload?.errMessage || ''}`.trim());
        return null;
      }
      stats.successfulRequests += 1;
      return payload.data || { list: [], totalCount: 0, pageNum: page, pageSize: BUSINESS_SEARCH_PAGE_SIZE };
    } catch (error) {
      warnings.push(`云梦泽查询异常：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  for (const term of searchTerms) {
    for (const scope of YMZ_DISCOVERY_SCOPES) {
      for (let page = 1; page <= YMZ_SEARCH_PAGE_LIMIT && !rateLimited; page += 1) {
        const data = await fetchPage(term, page, scope);
        if (!data) break;
        const rows = Array.isArray(data.list) ? data.list as Record<string, unknown>[] : [];
        for (const row of rows) {
          stats.rawCount += 1;
          const noticeType = rowValue(row, ['noticeType']);
          const candidate = ymzCandidateFromRow({ row, searchQuery: term, sourceLabel: scope.label });
          if (!['1', '2'].includes(noticeType)) {
            stats.nonActionableCount += 1;
            addExcludedNotice(excludedNotices, candidate, 'non_actionable');
            continue;
          }
          // Live YMZ uses publishStatus=1 for publicly visible, currently
          // biddable notices. Eligibility comes from notice type, deadline and
          // explicit terminal states instead of this undocumented numeric flag.
          const deadline = timestampFor(rowValue(row, ['bidEndTime', 'endTime']), true);
          if (Number.isFinite(deadline) && deadline < now.getTime()) {
            stats.expiredCount += 1;
            addExcludedNotice(excludedNotices, candidate, 'expired');
            continue;
          }
          if (candidate) collected.push(candidate);
        }
        const totalPages = Math.max(1, Math.ceil(Number(data.totalCount || 0) / Number(data.pageSize || BUSINESS_SEARCH_PAGE_SIZE)));
        if (page >= totalPages || rows.length === 0) break;
      }
      if (rateLimited) break;
    }
    if (rateLimited) break;
  }

  const seen = new Set<string>();
  const uniqueCandidates = collected
    .filter((candidate) => {
      const key = candidateKey(candidate.title, candidate.url);
      if (seen.has(key)) {
        stats.duplicateCount += 1;
        addExcludedNotice(excludedNotices, candidate, 'duplicate');
        return false;
      }
      seen.add(key);
      return true;
    });
  const candidateLimit = site.maxCandidates || 100;
  const candidates = uniqueCandidates.slice(0, candidateLimit);
  for (const candidate of uniqueCandidates.slice(candidateLimit)) {
    stats.truncatedCount += 1;
    addExcludedNotice(excludedNotices, candidate, 'candidate_limit');
  }
  const discoveryStats = discoveryStatsFor({
    provider,
    stats,
    eligibleCount: candidates.length,
    warnings,
    excludedNotices,
  });
  const summary = [
    `云梦泽已完成 ${searchTerms.length} 个产品词的近 ${recentDays} 天查询，覆盖招标采购、谈判采购和询比采购`,
    `接口请求 ${stats.requests} 次，读取原始记录 ${stats.rawCount} 条`,
    `排除已截止 ${stats.expiredCount} 条，排除结果或计划 ${stats.nonActionableCount} 条，去重 ${stats.duplicateCount} 条`,
    `保留 ${candidates.length} 条交给 LLM 筛选${warnings.length ? `；${warnings.length} 个查询存在异常` : ''}。`,
  ].join('；');
  const artifacts = [publicSummaryArtifact({
    task,
    provider,
    summary,
    searchTerms,
    stats,
    warnings,
    candidates,
  })];
  return {
    provider,
    status: candidates.length ? 'success' : warnings.length ? 'failed' : 'no_new',
    candidateBundle: candidates.length ? { source_name: task.sourceName, candidates } : null,
    artifacts,
    warnings,
    summary,
    discoveryStats,
  };
};

const cnoocHeaders = {
  'Accept': 'application/json, text/plain, */*',
  'app-id': 'cnooc-kshmh',
  'did': '0',
  'is-english': '0',
  'Referer': 'https://bid.cnooc.com.cn/home/',
  'User-Agent': 'HCZ-ERP-Bid-Agent/1.0',
};

const cnoocCandidateFromRow = ({
  row,
  column,
  searchQuery,
}: {
  row: Record<string, unknown>;
  column: typeof CNOOC_COLUMNS[number];
  searchQuery: string;
}): TenderCandidate | null => {
  const id = rowValue(row, ['id']);
  const title = normalizeText(rowValue(row, ['title', 'name']).replace(/<\/?em\b[^>]*>/gi, ''));
  if (!id || !title) return null;
  const publishedAt = normalizeDate(rowValue(row, ['createdTime', 'updatedTime']));
  const url = `https://bid.cnooc.com.cn/home/#/newsAlertDetails?index=0&childrenActive=${column.childIndex}&id=${encodeURIComponent(id)}&type=null`;
  return {
    title,
    url,
    published_at: publishedAt,
    deadline_at: '',
    buyer_name: '中国海油',
    raw_text: normalizeText([
      title,
      `公告栏目：${column.label}`,
      publishedAt ? `发布时间：${publishedAt}` : '',
      searchQuery ? '来自站内产品检索' : '近期公告扫描',
    ].filter(Boolean).join(' ')),
    attachments: [],
    search_query: searchQuery || undefined,
    notice_type: column.label,
  };
};

export const readCnoocPublicCandidateDetail = async ({
  candidate,
  fetchImpl = fetch,
}: {
  candidate: TenderCandidate;
  fetchImpl?: FetchLike;
}): Promise<TenderCandidate> => {
  const parsed = new URL(candidate.url);
  const params = new URLSearchParams(parsed.hash.split('?')[1] || parsed.search);
  const id = params.get('id') || '';
  if (!id) throw new Error('中国海油公告链接缺少公告 ID');
  const response = await fetchImpl(`${CNOOC_DETAIL_ENDPOINT}/${encodeURIComponent(id)}`, { headers: cnoocHeaders });
  const payload = await response.json().catch(() => null) as any;
  const code = payload?.httpCode ?? payload?.code;
  const detail = payload?.result as Record<string, unknown> | undefined;
  if (!response.ok || Number(code) !== 100200 || !detail) {
    throw new Error(`中国海油公告详情读取失败：HTTP ${response.status} / ${code || 'unknown'}`);
  }
  const fullTextHtml = rowValue(detail, ['fullText']);
  const fullText = normalizeNoticeHtml(fullTextHtml).slice(0, 26_000);
  const changedDeadline = fullText.match(/变更后(?:截标\s*\/\s*开标|投标文件递交截止|响应文件递交截止|报价截止)时间[：:]?\s*(20\d{2}[年\-/.]\d{1,2}[月\-/.]\d{1,2})/i)?.[1] || '';
  const deadlineAt = normalizeDate(changedDeadline) || deadlineDateFromText(fullText) || candidate.deadline_at;
  const title = normalizeText(rowValue(detail, ['title'])) || candidate.title;
  const buyerFromTable = fullTextHtml.match(/<td\b[^>]*class=["'][^"']*contact-type[^"']*["'][^>]*>\s*(?:采购人|招标人)\s*<\/td>\s*<td\b[^>]*class=["'][^"']*contact-name[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] || '';
  const buyerName = normalizeText(buyerFromTable || (
    fullText.match(/(?:招\s*标\s*人|采\s*购\s*人)[：:]\s*([^。；]{2,100}?)(?=[。；]|\s+(?:地\s*址|联\s*系\s*人|电子邮箱|联系电话|招标代理机构)[：:]|$)/)?.[1] || ''
  )) || candidate.buyer_name;
  const attachments = unique([
    ...candidate.attachments,
    ...[...fullTextHtml.matchAll(/href=["']([^"']+)["']/gi)]
      .map((match) => normalizeUrl(match[1].replace(/&amp;/gi, '&'), 'https://bid.cnooc.com.cn/')),
  ]).filter((url) => /^https?:/i.test(url) && (
    /\.(?:pdf|docx?|xlsx?)(?:[?#]|$)/i.test(url) || /\/downloadUrl\?.*fileName=.*\.(?:pdf|docx?|xlsx?)/i.test(url)
  )).slice(0, 10);
  return {
    ...candidate,
    title,
    buyer_name: buyerName,
    published_at: normalizeDate(rowValue(detail, ['createdTime', 'updatedTime'])) || candidate.published_at,
    deadline_at: deadlineAt,
    raw_text: normalizeText([
      candidate.raw_text,
      fullText ? `【公告网页正文】${fullText}` : '',
    ].filter(Boolean).join(' ')).slice(0, 30_000),
    attachments,
  };
};

export const collectCnoocPublicNotices = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
  minimumIntervalMs = PUBLIC_SEARCH_QUERY_INTERVAL_MS,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:cnooc-announcements';
  const site = definitionFor(task.sourceName);
  const searchTerms = businessSearchTermsFor(task, site.deepSearchTerms.length || BUSINESS_SEARCH_TERM_LIMIT);
  const recentDays = site.browserJourney?.recentDays || 30;
  const recentStart = shanghaiDayStart(now, recentDays);
  const startDate = formatShanghaiDate(new Date(recentStart));
  const endDate = formatShanghaiDate(now);
  const warnings: string[] = [];
  const stats: PublicCollectionStats = {
    requests: 0, successfulRequests: 0, rawCount: 0, expiredCount: 0,
    nonActionableCount: 0, duplicateCount: 0, truncatedCount: 0, staleCount: 0,
  };
  const excludedNotices: DiscoveryExcludedNotice[] = [];
  const matched: TenderCandidate[] = [];
  const baseline: TenderCandidate[] = [];
  let lastRequestAt = 0;
  let rateLimited = false;

  const fetchPage = async (column: typeof CNOOC_COLUMNS[number], title: string, page: number) => {
    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    const url = new URL(CNOOC_LIST_ENDPOINT);
    Object.entries({
      columns: column.id,
      current: String(page),
      size: String(BUSINESS_SEARCH_PAGE_SIZE),
      pageSize: String(BUSINESS_SEARCH_PAGE_SIZE),
      pageNum: String(page),
      page: String(page),
      time: '',
      title,
      startDate,
      endDate,
      visiblePosition: '1',
      id: column.id,
      status: '3',
      visibilityRange: '1',
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    try {
      const response = await fetchImpl(url, { headers: cnoocHeaders });
      if (response.status === 429 || response.status === 503) {
        rateLimited = true;
        warnings.push(`中国海油公告接口触发访问限制：HTTP ${response.status}`);
        return null;
      }
      const payload = await response.json().catch(() => null) as any;
      const code = payload?.httpCode ?? payload?.code;
      if (!response.ok || Number(code) !== 100200 || !payload?.result) {
        warnings.push(`中国海油${column.label}查询失败：HTTP ${response.status} / ${code || 'unknown'}`);
        return null;
      }
      stats.successfulRequests += 1;
      return payload.result as { total?: number; pages?: number; data?: Record<string, unknown>[] };
    } catch (error) {
      warnings.push(`中国海油${column.label}查询异常：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const collectQuery = async (
    column: typeof CNOOC_COLUMNS[number],
    title: string,
    pageLimit: number,
    target: TenderCandidate[],
  ) => {
    for (let page = 1; page <= pageLimit && !rateLimited; page += 1) {
      const data = await fetchPage(column, title, page);
      if (!data) break;
      const rows = Array.isArray(data.data) ? data.data : [];
      for (const row of rows) {
        stats.rawCount += 1;
        const candidate = cnoocCandidateFromRow({ row, column, searchQuery: title });
        if (!candidate) continue;
        const published = timestampFor(candidate.published_at);
        if (Number.isFinite(published) && published < recentStart) {
          stats.staleCount = (stats.staleCount || 0) + 1;
          addExcludedNotice(excludedNotices, candidate, 'stale');
          continue;
        }
        if (RESULT_NOTICE_PATTERN.test(candidate.title)) {
          stats.nonActionableCount += 1;
          addExcludedNotice(excludedNotices, candidate, 'non_actionable');
          continue;
        }
        target.push(candidate);
      }
      const totalPages = Math.max(1, Number(data.pages) || Math.ceil(Number(data.total || 0) / BUSINESS_SEARCH_PAGE_SIZE));
      if (page >= totalPages || rows.length < BUSINESS_SEARCH_PAGE_SIZE) break;
    }
  };

  for (const column of CNOOC_COLUMNS) {
    await collectQuery(column, '', CNOOC_BASELINE_PAGE_LIMIT, baseline);
  }
  for (const term of searchTerms) {
    for (const column of CNOOC_COLUMNS) {
      await collectQuery(column, term, site.browserJourney?.maxPages || 2, matched);
      if (rateLimited) break;
    }
    if (rateLimited) break;
  }

  const seen = new Set<string>();
  const uniqueCandidates = [...matched, ...baseline].filter((candidate) => {
    const key = candidateKey(candidate.title, candidate.url, candidate.published_at);
    if (seen.has(key)) {
      stats.duplicateCount += 1;
      addExcludedNotice(excludedNotices, candidate, 'duplicate');
      return false;
    }
    seen.add(key);
    return true;
  });
  const candidates = uniqueCandidates.slice(0, site.maxCandidates || 160);
  for (const candidate of uniqueCandidates.slice(candidates.length)) {
    stats.truncatedCount += 1;
    addExcludedNotice(excludedNotices, candidate, 'candidate_limit');
  }
  const discoveryStats = discoveryStatsFor({ provider, stats, eligibleCount: candidates.length, warnings, excludedNotices });
  const summary = [
    `中国海油已扫描近期招标/非招标公告，并检索 ${searchTerms.length} 个产品词`,
    `接口请求 ${stats.requests} 次，读取原始记录 ${stats.rawCount} 条`,
    `排除陈旧 ${stats.staleCount || 0} 条，去重 ${stats.duplicateCount} 条，保留 ${candidates.length} 条交给 LLM 筛选。`,
  ].join('；');
  return {
    provider,
    status: candidates.length ? 'success' : warnings.length ? 'failed' : 'no_new',
    candidateBundle: candidates.length ? { source_name: task.sourceName, candidates } : null,
    artifacts: [publicSummaryArtifact({ task, provider, summary, searchTerms, stats, warnings, candidates })],
    warnings,
    summary,
    discoveryStats,
  };
};

const guonengEBidDirectUrl = (row: Record<string, unknown>) => {
  const rawLink = rowValue(row, ['linkurl', 'url', 'href']);
  if (rawLink && !/\/bidweb\/jump\.html/i.test(rawLink)) return normalizeUrl(rawLink, GUONENG_EBID_BASE_URL);
  const category = rowValue(row, ['categorynum']);
  const infoDate = rowValue(row, ['infodate']).replace(/\D/g, '').slice(0, 8);
  const linkParams = (() => {
    try {
      return new URL(rawLink, GUONENG_EBID_BASE_URL).searchParams;
    } catch {
      return new URLSearchParams();
    }
  })();
  const infoId = rowValue(row, ['infoid']) || linkParams.get('infoid') || '';
  if (!category || !infoDate || !infoId) return normalizeUrl(rawLink, GUONENG_EBID_BASE_URL);
  const categoryFolders: string[] = [];
  for (let length = 3; length <= category.length; length += 3) categoryFolders.push(category.slice(0, length));
  return `${GUONENG_EBID_BASE_URL}bidweb/${categoryFolders.join('/')}/${infoDate}/${infoId}.html`;
};

const guonengEBidCandidateFromRow = ({
  row,
  searchQuery = '',
  categoryLabel = '',
}: {
  row: Record<string, unknown>;
  searchQuery?: string;
  categoryLabel?: string;
}): TenderCandidate | null => {
  const title = normalizeText(rowValue(row, ['title', 'name']).replace(/<\/?em\b[^>]*>/gi, ''));
  const category = rowValue(row, ['categorynum']);
  const url = guonengEBidDirectUrl(row);
  if (!title || !url) return null;
  const publishedAt = normalizeDate(rowValue(row, ['infodate', 'publishedAt', 'publishTime']));
  const content = normalizeText(rowValue(row, ['content', 'description'])).slice(0, 3_000);
  return {
    title,
    url,
    published_at: publishedAt,
    deadline_at: '',
    buyer_name: '国家能源集团',
    raw_text: normalizeText([
      title,
      categoryLabel ? `公告栏目：${categoryLabel}` : `公告分类：${category}`,
      publishedAt ? `发布时间：${publishedAt}` : '',
      searchQuery ? '来自站内产品检索' : '近期公告扫描',
      content,
    ].filter(Boolean).join(' ')),
    attachments: [],
    search_query: searchQuery || undefined,
    notice_type: categoryLabel || (category.startsWith('001003') ? '非招标公告' : category.startsWith('001004') ? '变更公告' : '招标公告'),
  };
};

const parseGuonengEBidBaselineHtml = (html: string, baseUrl: string, label: string): TenderCandidate[] => {
  const candidates: TenderCandidate[] = [];
  for (const item of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = item[1];
    const anchor = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*infolink[^"']*["'][^>]*title=["']([^"']+)["'][^>]*>/i)
      || block.match(/<a\b[^>]*class=["'][^"']*infolink[^"']*["'][^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>/i);
    const date = normalizeDate(block);
    if (!anchor || !date) continue;
    const candidate = guonengEBidCandidateFromRow({
      row: { title: anchor[2], href: normalizeUrl(anchor[1], baseUrl), infodate: date },
      categoryLabel: label,
    });
    if (candidate) candidates.push(candidate);
  }
  return candidates;
};

export const readGuonengEBidPublicCandidateDetail = async ({
  candidate,
  fetchImpl = fetch,
}: {
  candidate: TenderCandidate;
  fetchImpl?: FetchLike;
}): Promise<TenderCandidate> => {
  const response = await fetchImpl(candidate.url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Referer': 'https://www.chnenergybidding.com.cn/bidweb/',
      'User-Agent': 'HCZ-ERP-Bid-Agent/1.0',
    },
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`国能E招公告详情读取失败：HTTP ${response.status}`);
  const articleHtml = html.match(/<div\b[^>]*class=["'][^"']*article-info[^"']*["'][^>]*>([\s\S]*?)<div\b[^>]*class=["'][^"']*con\s+attach/i)?.[1] || html;
  const articleText = normalizeNoticeHtml(articleHtml).slice(0, 26_000);
  const title = normalizeText(articleHtml.match(/<h1\b[^>]*id=["']title["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || candidate.title;
  const publishedAt = normalizeDate(articleText.match(/发布时间[：:]\s*(20\d{2}[-年/.]\d{1,2}[-月/.]\d{1,2})/)?.[1] || '') || candidate.published_at;
  const explicitDeadline = articleText.match(/(?:投标文件|响应文件|报价文件)[^。；]{0,80}?截止时间[^\d]{0,60}(20\d{2}[年\-/.]\d{1,2}[月\-/.]\d{1,2})/)?.[1] || '';
  const deadlineAt = normalizeDate(explicitDeadline) || deadlineDateFromText(articleText) || candidate.deadline_at;
  const buyerName = normalizeText(
    articleText.match(/招\s*标\s*人[：:]\s*([^。；]{2,100}?)(?=[。；]|\s+(?:地\s*址|联\s*系\s*人|电子邮箱|招标代理机构)[：:]|$)/)?.[1] || '',
  ) || candidate.buyer_name;
  const attachments = unique([
    ...candidate.attachments,
    ...[...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((match) => normalizeUrl(match[1].replace(/&amp;/gi, '&'), candidate.url)),
  ]).filter((url) => /^https?:/i.test(url) && /\.(?:pdf|docx?|xlsx?)(?:[?#]|$)/i.test(url)).slice(0, 10);
  return {
    ...candidate,
    title,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    buyer_name: buyerName,
    raw_text: normalizeText([
      candidate.raw_text,
      articleText ? `【公告网页正文】${articleText}` : '',
    ].filter(Boolean).join(' ')).slice(0, 30_000),
    attachments,
  };
};

export const collectGuonengEBidPublicNotices = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
  minimumIntervalMs = PUBLIC_SEARCH_QUERY_INTERVAL_MS,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:guoneng-ebid-search';
  const site = definitionFor(task.sourceName);
  const searchTerms = businessSearchTermsFor(task, site.deepSearchTerms.length || PUBLIC_FEED_SEARCH_TERM_LIMIT);
  const recentDays = site.browserJourney?.recentDays || 30;
  const recentStart = shanghaiDayStart(now, recentDays);
  const startDate = formatShanghaiDate(new Date(recentStart));
  const endDate = formatShanghaiDate(now);
  const warnings: string[] = [];
  const stats: PublicCollectionStats = {
    requests: 0, successfulRequests: 0, rawCount: 0, expiredCount: 0,
    nonActionableCount: 0, duplicateCount: 0, truncatedCount: 0, staleCount: 0,
  };
  const excludedNotices: DiscoveryExcludedNotice[] = [];
  const matched: TenderCandidate[] = [];
  const baseline: TenderCandidate[] = [];
  let lastRequestAt = 0;
  let rateLimited = false;

  const request = async (url: string, init?: RequestInit) => {
    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    const response = await fetchImpl(url, init);
    if (response.status === 429 || response.status === 503) {
      rateLimited = true;
      warnings.push(`国能E招触发访问限制：HTTP ${response.status}`);
      return null;
    }
    if (!response.ok) {
      warnings.push(`国能E招读取失败：HTTP ${response.status}`);
      return null;
    }
    stats.successfulRequests += 1;
    return response;
  };

  for (const pageDefinition of GUONENG_EBID_BASELINE_PAGES) {
    for (let page = 1; page <= GUONENG_EBID_BASELINE_PAGE_LIMIT && !rateLimited; page += 1) {
      const pageName = page === 1 ? 'moreinfo.html' : `${page}.html`;
      const url = `${GUONENG_EBID_BASE_URL}bidweb/${pageDefinition.path}/${pageName}`;
      try {
        const response = await request(url, {
          headers: { 'Referer': `${GUONENG_EBID_BASE_URL}bidweb/`, 'User-Agent': 'HCZ-ERP-Bid-Agent/1.0' },
        });
        if (!response) break;
        const candidates = parseGuonengEBidBaselineHtml(await response.text(), url, pageDefinition.label);
        for (const candidate of candidates) {
          stats.rawCount += 1;
          const published = timestampFor(candidate.published_at);
          if (Number.isFinite(published) && published < recentStart) {
            stats.staleCount = (stats.staleCount || 0) + 1;
            addExcludedNotice(excludedNotices, candidate, 'stale');
            continue;
          }
          baseline.push(candidate);
        }
        if (!candidates.length) break;
      } catch (error) {
        warnings.push(`国能E招${pageDefinition.label}读取异常：${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
  }

  for (const term of searchTerms) {
    for (let page = 0; page < (site.browserJourney?.maxPages || 2) && !rateLimited; page += 1) {
      const payload = {
        token: '', pn: page * BUSINESS_SEARCH_PAGE_SIZE, rn: BUSINESS_SEARCH_PAGE_SIZE,
        sdt: startDate, edt: endDate, wd: encodeURIComponent(term), inc_wd: '', exc_wd: '',
        fields: 'title;content', cnum: '', sort: '{"infodate":0}', ssort: 'title', cl: 500,
        terminal: '', condition: null, time: null, highlights: 'title;content', statistics: null,
        unionCondition: null, accuracy: '', noParticiple: '0', searchRange: null,
      };
      try {
        const response = await request(GUONENG_EBID_SEARCH_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Referer': 'https://www.chnenergybidding.com.cn/bidsearch/fullsearch.html',
            'User-Agent': 'HCZ-ERP-Bid-Agent/1.0',
          },
          body: JSON.stringify(payload),
        });
        if (!response) break;
        const body = await response.json().catch(() => null) as any;
        const rows = Array.isArray(body?.result?.records) ? body.result.records as Record<string, unknown>[] : [];
        for (const row of rows) {
          stats.rawCount += 1;
          const category = rowValue(row, ['categorynum']);
          const candidate = guonengEBidCandidateFromRow({ row, searchQuery: term });
          if (!candidate) continue;
          if (!GUONENG_EBID_ACTIVE_CATEGORY_PATTERN.test(category)) {
            stats.nonActionableCount += 1;
            addExcludedNotice(excludedNotices, candidate, 'non_actionable');
            continue;
          }
          const searchable = normalizeText(`${rowValue(row, ['title'])} ${rowValue(row, ['content'])}`).toLocaleLowerCase('zh-CN');
          if (!searchable.includes(term.toLocaleLowerCase('zh-CN'))) continue;
          const published = timestampFor(candidate.published_at);
          if (Number.isFinite(published) && published < recentStart) {
            stats.staleCount = (stats.staleCount || 0) + 1;
            addExcludedNotice(excludedNotices, candidate, 'stale');
            continue;
          }
          matched.push(candidate);
        }
        const total = Number(body?.result?.totalcount || 0);
        if ((page + 1) * BUSINESS_SEARCH_PAGE_SIZE >= total || rows.length < BUSINESS_SEARCH_PAGE_SIZE) break;
      } catch (error) {
        warnings.push(`国能E招全文检索异常：${term} ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
  }

  const seen = new Set<string>();
  const uniqueCandidates = [...matched, ...baseline].filter((candidate) => {
    const key = candidateKey(candidate.title, candidate.url, candidate.published_at);
    if (seen.has(key)) {
      stats.duplicateCount += 1;
      addExcludedNotice(excludedNotices, candidate, 'duplicate');
      return false;
    }
    seen.add(key);
    return true;
  });
  const candidates = uniqueCandidates.slice(0, site.maxCandidates || 140);
  for (const candidate of uniqueCandidates.slice(candidates.length)) {
    stats.truncatedCount += 1;
    addExcludedNotice(excludedNotices, candidate, 'candidate_limit');
  }
  const discoveryStats = discoveryStatsFor({ provider, stats, eligibleCount: candidates.length, warnings, excludedNotices });
  const summary = [
    `国能E招已扫描近期招标、非招标和变更公告，并全文检索 ${searchTerms.length} 个产品词`,
    `请求 ${stats.requests} 次，读取原始记录 ${stats.rawCount} 条`,
    `排除非采购阶段 ${stats.nonActionableCount} 条、陈旧 ${stats.staleCount || 0} 条，去重 ${stats.duplicateCount} 条，保留 ${candidates.length} 条交给 LLM 筛选。`,
  ].join('；');
  return {
    provider,
    status: candidates.length ? 'success' : warnings.length ? 'failed' : 'no_new',
    candidateBundle: candidates.length ? { source_name: task.sourceName, candidates } : null,
    artifacts: [publicSummaryArtifact({ task, provider, summary, searchTerms, stats, warnings, candidates })],
    warnings,
    summary,
    discoveryStats,
  };
};

const LONGDAO_LIST_FIELD_LABELS = [
  '采购品',
  '采购方式',
  '项目地区',
  '所属行业',
  '发布时间',
  '项目状态',
];

const longdaoListField = (plainText: string, label: string) => {
  const markerPattern = new RegExp(`${label}[：:]`);
  const marker = markerPattern.exec(plainText);
  if (!marker || marker.index === undefined) return '';
  const tail = plainText.slice(marker.index + marker[0].length).trim();
  const nextIndexes = LONGDAO_LIST_FIELD_LABELS
    .filter((candidate) => candidate !== label)
    .map((candidate) => {
      const next = new RegExp(`${candidate}[：:]`).exec(tail);
      return next?.index ?? -1;
    })
    .filter((index) => index >= 0);
  const end = nextIndexes.length ? Math.min(...nextIndexes) : tail.length;
  return tail.slice(0, end).replace(/等\s*\d+\s*种.*$/, '').trim();
};

const longdaoCandidatesFromHtml = ({
  html,
  searchQuery,
}: {
  html: string;
  searchQuery: string;
}): TenderCandidate[] => html
  .split(/<div\s+class=["']business-list--li\s+position-relative\s+inline-block\s+border-blue["']>/i)
  .slice(1)
  .map((block): TenderCandidate | null => {
    const titleMatch = block.match(/<h1\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>/i);
    if (!titleMatch) return null;
    const title = normalizeText(titleMatch[2]);
    const url = normalizeUrl(titleMatch[1], LONGDAO_SEARCH_ENDPOINT);
    const plainText = normalizeText(block);
    const buyerMatch = block.match(/<a\b[^>]*href=["'][^"']*gotoSite[^"']*["'][^>]*title=["']([^"']+)["']/i);
    const publishedAt = normalizeDate(longdaoListField(plainText, '发布时间'));
    const products = longdaoListField(plainText, '采购品');
    const purchaseMethod = longdaoListField(plainText, '采购方式');
    const region = longdaoListField(plainText, '项目地区');
    const industry = longdaoListField(plainText, '所属行业');
    const state = longdaoListField(plainText, '项目状态');
    return {
      title,
      url,
      published_at: publishedAt,
      deadline_at: '',
      buyer_name: normalizeText(buyerMatch?.[1] || ''),
      raw_text: normalizeText([
        title,
        products ? `采购品：${products}` : '',
        purchaseMethod ? `采购方式：${purchaseMethod}` : '',
        region ? `项目地区：${region}` : '',
        industry ? `所属行业：${industry}` : '',
        publishedAt ? `发布时间：${publishedAt}` : '',
        state ? `项目状态：${state}` : '',
        '来自站内产品检索',
      ].filter(Boolean).join(' ')),
      attachments: [],
      search_query: searchQuery,
      notice_type: purchaseMethod || '采购公告',
      opportunity_status: LONGDAO_ENDED_PATTERN.test(state) ? 'ended' : state ? 'active' : 'unknown',
    };
  })
  .filter((candidate): candidate is TenderCandidate => Boolean(candidate));

export const collectLongdaoPublicNotices = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:longdao-search';
  const site = definitionFor(task.sourceName);
  const searchTerms = businessSearchTermsFor(task, site.deepSearchTerms.length || BUSINESS_SEARCH_TERM_LIMIT);
  const recentDays = definitionFor(task.sourceName).browserJourney?.recentDays || 30;
  const recentStart = shanghaiDayStart(now, recentDays);
  const warnings: string[] = [];
  const stats: PublicCollectionStats = {
    requests: 0,
    successfulRequests: 0,
    rawCount: 0,
    expiredCount: 0,
    nonActionableCount: 0,
    duplicateCount: 0,
    truncatedCount: 0,
    endedCount: 0,
    staleCount: 0,
    resultCount: 0,
  };
  const excludedNotices: DiscoveryExcludedNotice[] = [];
  const candidates: TenderCandidate[] = [];
  const artifacts: CollectionArtifact[] = [];
  const seen = new Set<string>();
  let lastRequestAt = 0;

  for (const term of searchTerms) {
    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    const url = `${LONGDAO_SEARCH_ENDPOINT}?keyword=${encodeURIComponent(term)}`;
    try {
      const response = await fetchImpl(url, {
        headers: {
          'Referer': 'https://www.longdaoyun.com/',
          'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0',
        },
      });
      const html = await response.text();
      if (!response.ok) {
        warnings.push(`隆道云搜索“${term}”失败：HTTP ${response.status}`);
        continue;
      }
      stats.successfulRequests += 1;
      artifacts.push({
        artifact_type: 'network_response',
        title: `隆道云公开搜索 ${term}`,
        url,
        content: html.slice(0, 80_000),
        mime_type: 'text/html',
      });
      for (const candidate of longdaoCandidatesFromHtml({ html, searchQuery: term })) {
        stats.rawCount += 1;
        const published = timestampFor(candidate.published_at);
        const ended = candidate.opportunity_status === 'ended';
        const resultNotice = RESULT_NOTICE_PATTERN.test(candidate.title);
        const stale = Number.isFinite(published) && published < recentStart;
        if (resultNotice) {
          stats.resultCount = (stats.resultCount || 0) + 1;
          stats.nonActionableCount += 1;
          addExcludedNotice(excludedNotices, candidate, 'result');
          continue;
        }
        if (stale) {
          stats.staleCount = (stats.staleCount || 0) + 1;
          stats.nonActionableCount += 1;
          addExcludedNotice(excludedNotices, candidate, 'stale');
          continue;
        }
        if (ended) stats.endedCount = (stats.endedCount || 0) + 1;
        const key = candidateKey(candidate.title, candidate.url, candidate.published_at);
        if (seen.has(key)) {
          stats.duplicateCount += 1;
          addExcludedNotice(excludedNotices, candidate, 'duplicate');
          continue;
        }
        seen.add(key);
        candidates.push(candidate);
      }
    } catch (error) {
      warnings.push(`隆道云搜索“${term}”异常：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const limitedCandidates = candidates.slice(0, 100);
  stats.truncatedCount = Math.max(0, candidates.length - limitedCandidates.length);
  const summary = `隆道云公开搜索 ${searchTerms.length} 个产品词，读取 ${stats.rawCount} 条，保留近期已结束线索 ${stats.endedCount || 0} 条，排除日期过旧 ${stats.staleCount || 0} 条、结果公告 ${stats.resultCount || 0} 条、重复 ${stats.duplicateCount} 条，保留 ${limitedCandidates.length} 条交给 LLM。`;
  const discoveryStats = discoveryStatsFor({
    provider,
    stats,
    eligibleCount: limitedCandidates.length,
    warnings,
    excludedNotices,
  });
  artifacts.push(publicSummaryArtifact({
    task,
    provider,
    summary,
    searchTerms,
    stats,
    warnings,
    candidates: limitedCandidates,
  }));
  return {
    provider,
    status: limitedCandidates.length ? 'success' : stats.successfulRequests ? 'no_new' : 'failed',
    candidateBundle: limitedCandidates.length
      ? { source_name: task.sourceName, candidates: limitedCandidates }
      : null,
    artifacts,
    warnings,
    summary,
    discoveryStats,
  };
};

export const readLongdaoPublicCandidateDetail = async ({
  candidate,
  fetchImpl = fetch,
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  candidate: TenderCandidate;
  fetchImpl?: FetchLike;
  minimumIntervalMs?: number;
}): Promise<TenderCandidate> => {
  await waitForInterval(lastLongdaoDetailRequestAt, minimumIntervalMs);
  lastLongdaoDetailRequestAt = Date.now();
  const response = await fetchImpl(candidate.url, {
    headers: {
      'Referer': LONGDAO_SEARCH_ENDPOINT,
      'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0',
    },
  });
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`隆道云详情读取失败：HTTP ${response.status}`);
  }
  const plainText = normalizeText(html);
  const bodyStart = html.search(/<!--\s*正文内容\s*-->|一、采购品信息/i);
  const bodyEnd = html.search(/版权声明/i);
  const publicBody = normalizeText(bodyStart >= 0
    ? html.slice(bodyStart, bodyEnd > bodyStart ? bodyEnd : undefined)
    : html).slice(0, 20_000);
  const deadlineAt = deadlineDateFromText(plainText) || candidate.deadline_at;
  const requiresLogin = LONGDAO_LOGIN_REQUIRED_PATTERN.test(plainText);
  const evidence = normalizeText([
    publicBody,
    requiresLogin ? '完整公告需登录确认' : '',
  ].filter(Boolean).join(' '));
  return {
    ...candidate,
    deadline_at: deadlineAt,
    raw_text: normalizeText([
      candidate.raw_text,
      evidence ? `【公告网页正文】${evidence}` : '',
    ].filter(Boolean).join(' ')).slice(0, 30_000),
  };
};

const jinnengCandidateFromRow = (
  row: Record<string, unknown>,
  categoryLabel: string,
): TenderCandidate | null => {
  const id = rowValue(row, ['id']);
  const title = normalizeText(rowValue(row, ['title', 'purBidProjName']));
  if (!id || !title) return null;
  const publishedAt = normalizeDate(rowValue(row, ['actPublishDate']));
  const buyerName = normalizeText(rowValue(row, ['useDeptName'])) || '金能科技';
  const projectName = normalizeText(rowValue(row, ['purBidProjName']));
  const projectNumber = normalizeText(rowValue(row, ['purBidProjNo']));
  const flag = normalizeText(rowValue(row, ['flag'])) || categoryLabel;
  const state = normalizeText(rowValue(row, ['offerState']));
  return {
    title,
    url: `${JINNENG_BASE_URL}webportal/index/bidnotice/show/${encodeURIComponent(id)}.do`,
    published_at: publishedAt,
    deadline_at: '',
    buyer_name: buyerName,
    raw_text: normalizeText([
      title,
      projectName ? `项目名称：${projectName}` : '',
      projectNumber ? `项目编号：${projectNumber}` : '',
      `公告栏目：${flag}`,
      publishedAt ? `发布时间：${publishedAt}` : '',
      state ? `报价状态：${state}` : '',
    ].filter(Boolean).join(' ')),
    attachments: [],
    notice_type: flag,
    opportunity_status: JINNENG_ENDED_PATTERN.test(state) ? 'ended' : state ? 'active' : 'unknown',
  };
};

export const collectJinnengPublicNotices = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:jinneng-recent';
  const site = definitionFor(task.sourceName);
  const warnings: string[] = [];
  const stats: PublicCollectionStats = {
    requests: 0,
    successfulRequests: 0,
    rawCount: 0,
    expiredCount: 0,
    nonActionableCount: 0,
    duplicateCount: 0,
    truncatedCount: 0,
    endedCount: 0,
    staleCount: 0,
    resultCount: 0,
  };
  const candidates: TenderCandidate[] = [];
  const excludedNotices: DiscoveryExcludedNotice[] = [];
  const seen = new Set<string>();
  let lastRequestAt = 0;

  for (const category of JINNENG_CATEGORIES) {
    const recentStart = shanghaiDayStart(now, category.recentDays);
    for (let page = 1; page <= JINNENG_PAGE_LIMIT; page += 1) {
      await waitForInterval(lastRequestAt, minimumIntervalMs);
      lastRequestAt = Date.now();
      stats.requests += 1;
      let group: Record<string, any> | null = null;
      try {
        const response = await fetchImpl(JINNENG_NOTICE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Referer': JINNENG_BASE_URL,
            'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0',
          },
          body: new URLSearchParams({ kind: category.kind, pn: String(page), search: '' }).toString(),
        });
        const payload = await response.json().catch(() => null) as any;
        if (!response.ok || !Array.isArray(payload) || !payload[0]) {
          warnings.push(`金能${category.label}第 ${page} 页读取失败：HTTP ${response.status}`);
          break;
        }
        stats.successfulRequests += 1;
        group = payload[0] as Record<string, any>;
      } catch (error) {
        warnings.push(`金能${category.label}第 ${page} 页读取异常：${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      const rows = Array.isArray(group?.notices) ? group.notices as Record<string, unknown>[] : [];
      let hasRecentRow = false;
      for (const row of rows) {
        stats.rawCount += 1;
        const candidate = jinnengCandidateFromRow(row, category.label);
        if (!candidate) {
          stats.nonActionableCount += 1;
          continue;
        }
        const published = timestampFor(candidate.published_at);
        const stale = Number.isFinite(published) && published < recentStart;
        if (!stale) hasRecentRow = true;
        const stateText = `${candidate.title} ${candidate.notice_type || ''} ${rowValue(row, ['offerState'])}`;
        if (stale) {
          stats.staleCount = (stats.staleCount || 0) + 1;
          stats.nonActionableCount += 1;
          addExcludedNotice(excludedNotices, candidate, 'stale');
          continue;
        }
        if (RESULT_NOTICE_PATTERN.test(candidate.title)) {
          stats.resultCount = (stats.resultCount || 0) + 1;
          stats.nonActionableCount += 1;
          addExcludedNotice(excludedNotices, candidate, 'result');
          continue;
        }
        if (JINNENG_NON_GOODS_PATTERN.test(stateText)) {
          stats.nonActionableCount += 1;
          addExcludedNotice(excludedNotices, candidate, 'non_actionable');
          continue;
        }
        if (candidate.opportunity_status === 'ended') {
          stats.endedCount = (stats.endedCount || 0) + 1;
        }
        const key = candidateKey(candidate.title, candidate.url);
        if (seen.has(key)) {
          stats.duplicateCount += 1;
          addExcludedNotice(excludedNotices, candidate, 'duplicate');
          continue;
        }
        seen.add(key);
        candidates.push(candidate);
      }
      const totalPages = Math.max(1, Number(group?.allpn || 1));
      if (!rows.length || page >= totalPages || !hasRecentRow) break;
    }
  }

  const candidateLimit = site.maxCandidates || 160;
  const limitedCandidates = candidates.slice(0, candidateLimit);
  for (const candidate of candidates.slice(candidateLimit)) {
    stats.truncatedCount += 1;
    addExcludedNotice(excludedNotices, candidate, 'candidate_limit');
  }
  const summary = `金能四类公告读取 ${stats.rawCount} 条，保留近期已结束产品线索 ${stats.endedCount || 0} 条，排除日期过旧 ${stats.staleCount || 0} 条、结果 ${stats.resultCount || 0} 条、物流/服务/处置等 ${stats.nonActionableCount - (stats.staleCount || 0) - (stats.resultCount || 0)} 条、重复 ${stats.duplicateCount} 条，保留 ${limitedCandidates.length} 条交给 LLM。`;
  const discoveryStats = discoveryStatsFor({
    provider,
    stats,
    eligibleCount: limitedCandidates.length,
    warnings,
    excludedNotices,
  });
  const artifacts = [publicSummaryArtifact({
    task,
    provider,
    summary,
    searchTerms: [],
    stats,
    warnings,
    candidates: limitedCandidates,
  })];
  return {
    provider,
    status: limitedCandidates.length ? 'success' : stats.successfulRequests ? 'no_new' : 'failed',
    candidateBundle: limitedCandidates.length
      ? { source_name: task.sourceName, candidates: limitedCandidates }
      : null,
    artifacts,
    warnings,
    summary,
    discoveryStats,
  };
};

const publicAttachmentUrlsFromHtml = (html: string, baseUrl: string) => unique(
  [...html.matchAll(/\bhref=["']([^"']+)["']/gi)]
    .map((match) => normalizeUrl(match[1], baseUrl))
    .filter((url) => /\.(?:pdf|docx?|xlsx?|zip|rar)(?:[?#]|$)|\/(?:download|filedownload)(?:[/?#]|$)/i.test(url)),
).slice(0, 10);

export const readJinnengPublicCandidateDetail = async ({
  candidate,
  fetchImpl = fetch,
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  candidate: TenderCandidate;
  fetchImpl?: FetchLike;
  minimumIntervalMs?: number;
}): Promise<TenderCandidate> => {
  await waitForInterval(lastJinnengDetailRequestAt, minimumIntervalMs);
  lastJinnengDetailRequestAt = Date.now();
  const detailResponse = await fetchImpl(candidate.url, {
    headers: { 'Referer': JINNENG_BASE_URL, 'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0' },
  });
  const detailHtml = await detailResponse.text();
  if (!detailResponse.ok) throw new Error(`金能公告详情读取失败：HTTP ${detailResponse.status}`);
  const baseHref = detailHtml.match(/<base\b[^>]*href=["']([^"']+)["']/i)?.[1] || candidate.url;
  const iframeSrc = detailHtml.match(/<iframe\b[^>]*id=["']noticeframe["'][^>]*src=["']([^"']+)["']/i)?.[1]
    || detailHtml.match(/<iframe\b[^>]*src=["']([^"']*bidnotice\/content\/[^"']+)["']/i)?.[1]
    || '';
  let contentHtml = '';
  let contentUrl = '';
  if (iframeSrc) {
    contentUrl = normalizeUrl(iframeSrc, baseHref);
    await waitForInterval(lastJinnengDetailRequestAt, minimumIntervalMs);
    lastJinnengDetailRequestAt = Date.now();
    const contentResponse = await fetchImpl(contentUrl, {
      headers: { 'Referer': candidate.url, 'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0' },
    });
    contentHtml = await contentResponse.text();
    if (!contentResponse.ok) throw new Error(`金能公告正文读取失败：HTTP ${contentResponse.status}`);
  }
  const detailText = normalizeText(detailHtml);
  const publicContentHtml = contentHtml.match(/<div\b[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>\s*<script\b/i)?.[1]
    || contentHtml;
  const contentText = normalizeText(publicContentHtml);
  const combinedText = contentText || detailText;
  const deadlineAt = deadlineDateFromText(combinedText) || candidate.deadline_at;
  const attachments = unique([
    ...candidate.attachments,
    ...publicAttachmentUrlsFromHtml(detailHtml, candidate.url),
    ...publicAttachmentUrlsFromHtml(contentHtml, contentUrl || candidate.url),
  ]).slice(0, 10);
  const lockedFile = /(?:物资明细|采购明细).{0,20}详见招标文件|详见招标文件/.test(contentText)
    && attachments.length === 0;
  const evidence = normalizeText([
    combinedText,
    lockedFile ? '招标文件待登录读取' : '',
  ].filter(Boolean).join(' ')).slice(0, 20_000);
  return {
    ...candidate,
    deadline_at: deadlineAt,
    raw_text: normalizeText([
      candidate.raw_text,
      evidence ? `【公告网页正文】${evidence}` : '',
    ].filter(Boolean).join(' ')).slice(0, 30_000),
    attachments,
  };
};

const yanchangDetailUrl = ({
  id,
  detailType,
}: {
  id: string;
  detailType: number;
}) => {
  const param = Buffer.from(`se_d=pp&type=${detailType}&id=${id}`, 'utf8').toString('base64');
  return `https://zc.sxycpc.com/ebidPortal/tenderA-details.html?param=${encodeURIComponent(param)}`;
};

const yanchangCandidateFromRow = ({
  row,
  category,
}: {
  row: Record<string, unknown>;
  category: typeof YANCHANG_NOTICE_CATEGORIES[number];
}): TenderCandidate | null => {
  const id = rowValue(row, ['id']);
  const title = normalizeText(rowValue(row, ['projectName', 'noticename', 'title']));
  if (!id || !title) return null;
  const content = normalizeNoticeHtml(rowValue(row, ['noticeContent', 'content'])).slice(0, 24_000);
  const publishedAt = normalizeDate(rowValue(row, ['createDate', 'publishDate']));
  const deadlineAt = deadlineDateFromText(content);
  return {
    title,
    url: yanchangDetailUrl({ id, detailType: category.detailType }),
    published_at: publishedAt,
    deadline_at: deadlineAt,
    buyer_name: '陕西延长石油',
    raw_text: normalizeText([
      `延长石油${category.label}`,
      title,
      publishedAt ? `发布时间：${publishedAt}` : '',
      deadlineAt ? `截止时间：${deadlineAt}` : '',
      content ? `【公告网页正文】${content}` : '',
    ].filter(Boolean).join(' ')).slice(0, 30_000),
    attachments: [],
    notice_type: category.label,
  };
};

const yanchangSntbaSearchUrl = ({
  now,
  recentDays,
  page,
}: {
  now: Date;
  recentDays: number;
  page: number;
}) => {
  const searchStart = new Date(shanghaiDayStart(now, recentDays));
  const params = new URLSearchParams({
    searchDate: formatShanghaiDate(searchStart),
    dates: String(recentDays),
    categoryId: '88',
    page: String(page),
    showStatus: '1',
    // The public page decodes this parameter twice. A single pre-encode plus
    // URLSearchParams reproduces the browser request without page automation.
    word: encodeURIComponent('延长石油'),
  });
  return `${YANCHANG_SNTBA_SEARCH_ENDPOINT}?${params.toString()}`;
};

const yanchangSntbaCandidatesFromHtml = (html: string): TenderCandidate[] => (
  [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch): TenderCandidate | null => {
      const rowHtml = rowMatch[1];
      const link = rowHtml.match(/urlOpen\('([^']+)'\)[^>]*title=["']([^"']+)["']/i);
      if (!link) return null;
      const title = normalizeText(link[2]);
      if (!title || !YANCHANG_BUYER_PATTERN.test(title)) return null;
      const publishedAt = normalizeDate(
        rowHtml.match(/name=["']imgShow["'][^>]*\bid=["']([^"']+)["']/i)?.[1] || '',
      );
      const deadlineAt = normalizeDate(
        rowHtml.match(/name=["']openTime["'][^>]*\bid=["']([^"']+)["']/i)?.[1] || '',
      );
      const industry = normalizeText(rowHtml.match(/<span\b[^>]*title\s*=\s*["']([^"']+)["']/i)?.[1] || '');
      return {
        title,
        url: normalizeUrl(link[1], YANCHANG_SNTBA_SEARCH_ENDPOINT),
        published_at: publishedAt,
        deadline_at: deadlineAt,
        buyer_name: '陕西延长石油',
        raw_text: normalizeText([
          '陕西招标投标公共服务平台公开公告',
          title,
          industry ? `所属行业：${industry}` : '',
          publishedAt ? `发布时间：${publishedAt}` : '',
          deadlineAt ? `开标/截止时间：${deadlineAt}` : '',
        ].filter(Boolean).join(' ')),
        attachments: [],
        notice_type: '招标/采购公告（陕西招标投标公共服务平台）',
      };
    })
    .filter((candidate): candidate is TenderCandidate => Boolean(candidate))
);

const yanchangSntbaTotalPages = (html: string) => {
  const value = Number(html.match(/共\s*<label>\s*(\d+)\s*<\/label>\s*页/i)?.[1] || '1');
  return Number.isFinite(value) && value > 0 ? value : 1;
};

const decodeYanchangRegulationPayload = (text: string) => {
  const anchor = text.indexOf('-`-');
  if (anchor <= 0) throw new Error('陕西工信监管接口返回格式异常');
  const rotation = Number(text.slice(anchor + 3));
  const encoded = text.slice(0, anchor);
  if (!Number.isInteger(rotation) || rotation < 0 || rotation > encoded.length) {
    throw new Error('陕西工信监管接口返回偏移量异常');
  }
  const restored = `${encoded.slice(rotation)}${encoded.slice(0, rotation)}`;
  return JSON.parse(Buffer.from(restored, 'base64').toString('utf8')) as any;
};

const yanchangRegulationDetailUrl = (id: string) => {
  const query = Buffer.from(encodeURIComponent(`pk_id=${id}&type=N2`), 'utf8').toString('base64');
  return `http://61.185.253.156:18088/ztbView/detail.html?${query}`;
};

const yanchangRegulationCandidateFromRow = (row: Record<string, unknown>): TenderCandidate | null => {
  const id = rowValue(row, ['pk_id']);
  const title = normalizeText(rowValue(row, ['title']));
  const content = normalizeNoticeHtml(rowValue(row, ['content'])).slice(0, 24_000);
  if (!id || !title || !YANCHANG_BUYER_PATTERN.test(`${title} ${content}`)) return null;
  const publishedAt = normalizeDate(rowValue(row, ['publish_Time', 'publish_time']));
  const deadlineAt = deadlineDateFromText(content);
  return {
    title,
    url: yanchangRegulationDetailUrl(id),
    published_at: publishedAt,
    deadline_at: deadlineAt,
    buyer_name: '陕西延长石油',
    raw_text: normalizeText([
      '陕西工信招投标监管公开公告',
      title,
      publishedAt ? `发布时间：${publishedAt}` : '',
      deadlineAt ? `截止时间：${deadlineAt}` : '',
      content ? `【公告网页正文】${content}` : '',
    ].filter(Boolean).join(' ')).slice(0, 30_000),
    attachments: [],
    notice_type: '招标公告（陕西工信监管）',
  };
};

const decryptYanchangSntbaSecret = (ciphertext: string) => {
  const desKey = Buffer.from('Ctpsp@88', 'utf8');
  // DES-EDE3 with the same 8-byte key repeated is compatible with the public
  // page's CryptoJS DES-ECB operation and remains available in Node/OpenSSL 3.
  const decipher = createDecipheriv('des-ede3', Buffer.concat([desKey, desKey, desKey]), null);
  decipher.setAutoPadding(true);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

export const readYanchangPublicCandidateDetail = async ({
  candidate,
  fetchImpl = fetch,
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  candidate: TenderCandidate;
  fetchImpl?: FetchLike;
  minimumIntervalMs?: number;
}): Promise<TenderCandidate> => {
  let hostname = '';
  try {
    hostname = new URL(candidate.url).hostname;
  } catch {
    return candidate;
  }
  if (hostname !== 'bulletin.sntba.com') return candidate;

  await waitForInterval(lastYanchangDetailRequestAt, minimumIntervalMs);
  lastYanchangDetailRequestAt = Date.now();
  const detailResponse = await fetchImpl(candidate.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0' },
  });
  const detailHtml = await detailResponse.text();
  if (!detailResponse.ok) throw new Error(`陕西招标投标公告详情读取失败：HTTP ${detailResponse.status}`);
  const detailId = detailHtml.match(/class=["'][^"']*mian_list_03[^"']*["'][^>]*\bindex=["']([^"']+)["']/i)?.[1] || '';
  if (!detailId) throw new Error('陕西招标投标公告缺少 PDF 标识');

  await waitForInterval(lastYanchangDetailRequestAt, minimumIntervalMs);
  lastYanchangDetailRequestAt = Date.now();
  const secretResponse = await fetchImpl(YANCHANG_SNTBA_SECRET_ENDPOINT, {
    method: 'POST',
    headers: {
      'Referer': candidate.url,
      'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0',
    },
  });
  const secretText = await secretResponse.text();
  if (!secretResponse.ok) throw new Error(`陕西招标投标公告 PDF 授权读取失败：HTTP ${secretResponse.status}`);
  const cipherValue = (() => {
    try {
      const parsed = JSON.parse(secretText);
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return secretText.trim().replace(/^["']|["']$/g, '');
    }
  })();
  if (!cipherValue) throw new Error('陕西招标投标公告 PDF 授权为空');
  const secretPayload = JSON.parse(decryptYanchangSntbaSecret(cipherValue)) as { data?: string };
  if (!secretPayload.data) throw new Error('陕西招标投标公告 PDF 授权无效');
  const pdfUrl = `${YANCHANG_SNTBA_PDF_ENDPOINT}/${encodeURIComponent(secretPayload.data)}/${encodeURIComponent(detailId)}?file=notice.pdf`;
  return {
    ...candidate,
    attachments: unique([...candidate.attachments, pdfUrl]).slice(0, 10),
  };
};

export const collectYanchangPublicNotices = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
  minimumIntervalMs = DEFAULT_BUSINESS_QUERY_INTERVAL_MS,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:yanchang-notices';
  const recentDays = definitionFor(task.sourceName).browserJourney?.recentDays || 14;
  const recentStart = shanghaiDayStart(now, recentDays);
  const warnings: string[] = [];
  const stats: PublicCollectionStats = {
    requests: 0,
    successfulRequests: 0,
    rawCount: 0,
    expiredCount: 0,
    nonActionableCount: 0,
    duplicateCount: 0,
    truncatedCount: 0,
  };
  const excludedNotices: DiscoveryExcludedNotice[] = [];
  const candidates: TenderCandidate[] = [];
  const artifacts: CollectionArtifact[] = [];
  const seenTitles = new Set<string>();
  let lastRequestAt = 0;
  const sourceCounts: Record<string, { raw: number; eligible: number }> = {
    延长招采平台: { raw: 0, eligible: 0 },
    陕西工信监管: { raw: 0, eligible: 0 },
    陕西招标投标公共服务平台: { raw: 0, eligible: 0 },
  };
  const recordRaw = (source: keyof typeof sourceCounts, count = 1) => {
    stats.rawCount += count;
    sourceCounts[source].raw += count;
  };
  const acceptCandidate = (
    candidate: TenderCandidate | null,
    source: keyof typeof sourceCounts,
  ) => {
    if (!candidate) {
      stats.nonActionableCount += 1;
      return;
    }
    const deadline = timestampFor(candidate.deadline_at, true);
    if (Number.isFinite(deadline) && deadline < now.getTime()) {
      stats.expiredCount += 1;
      addExcludedNotice(excludedNotices, candidate, 'expired');
      return;
    }
    const published = timestampFor(candidate.published_at);
    const stale = Number.isFinite(published) && published < recentStart;
    if (stale || RESULT_NOTICE_PATTERN.test(candidate.title) || YANCHANG_NON_GOODS_PATTERN.test(candidate.title)) {
      stats.nonActionableCount += 1;
      addExcludedNotice(excludedNotices, candidate, 'non_actionable');
      return;
    }
    const titleKey = candidate.title.replace(/\s+/g, '');
    if (seenTitles.has(titleKey)) {
      stats.duplicateCount += 1;
      addExcludedNotice(excludedNotices, candidate, 'duplicate');
      return;
    }
    seenTitles.add(titleKey);
    sourceCounts[source].eligible += 1;
    candidates.push(candidate);
  };

  for (const category of YANCHANG_NOTICE_CATEGORIES) {
    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    try {
      const response = await fetchImpl(YANCHANG_NOTICE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://zc.sxycpc.com/ebidPortal/menu0001.html',
          'User-Agent': 'HCZ-ERP-Bid-Agent/1.0',
        },
        body: JSON.stringify({
          pageSize: BUSINESS_SEARCH_PAGE_SIZE,
          currentPage: 1,
          type: category.requestType,
        }),
      });
      const text = await response.text();
      artifacts.push({
        artifact_type: 'network_response',
        title: `延长石油${category.label}公开数据`,
        url: YANCHANG_NOTICE_ENDPOINT,
        content: text.slice(0, 80_000),
        mime_type: 'application/json',
      });
      const payload = JSON.parse(text || '{}') as any;
      if (!response.ok || String(payload?.code) !== '0' || !Array.isArray(payload?.data?.data)) {
        warnings.push(`延长石油${category.label}读取失败：HTTP ${response.status} / ${payload?.code || 'unknown'}`);
        continue;
      }
      stats.successfulRequests += 1;
      for (const row of payload.data.data as Record<string, unknown>[]) {
        recordRaw('延长招采平台');
        const candidate = yanchangCandidateFromRow({ row, category });
        acceptCandidate(candidate, '延长招采平台');
      }
    } catch (error) {
      warnings.push(`延长石油${category.label}读取异常：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    const scriptResponse = await fetchImpl(YANCHANG_REGULATION_SCRIPT_URL, {
      headers: {
        'Referer': YANCHANG_REGULATION_LIST_URL,
        'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0',
      },
    });
    const script = await scriptResponse.text();
    if (!scriptResponse.ok) throw new Error(`公开配置 HTTP ${scriptResponse.status}`);
    stats.successfulRequests += 1;
    const publicToken = script.match(/ztbSystem_getDataSign_token\s*=\s*["']([^"']+)["']/)?.[1] || '';
    if (!publicToken) throw new Error('公开配置中未找到请求令牌');

    await waitForInterval(lastRequestAt, minimumIntervalMs);
    lastRequestAt = Date.now();
    stats.requests += 1;
    const regulationResponse = await fetchImpl(YANCHANG_REGULATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Referer': YANCHANG_REGULATION_LIST_URL,
        'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0',
      },
      body: JSON.stringify({
        reqModel: 'getInformation',
        type: 'N2',
        limit: 'false',
        pk_id: null,
        page: 1,
        tokens: publicToken,
        pageSize: 100,
        title: '延长石油',
        time: `${formatShanghaiDate(new Date(recentStart))} - ${formatShanghaiDate(now)}`,
      }),
    });
    const regulationText = await regulationResponse.text();
    if (!regulationResponse.ok) throw new Error(`公告接口 HTTP ${regulationResponse.status}`);
    const payload = decodeYanchangRegulationPayload(regulationText);
    if (String(payload?.resultCode) !== '200' || !Array.isArray(payload?.data)) {
      throw new Error(`公告接口业务码 ${payload?.resultCode || 'unknown'}`);
    }
    stats.successfulRequests += 1;
    for (const row of payload.data as Record<string, unknown>[]) {
      recordRaw('陕西工信监管');
      acceptCandidate(yanchangRegulationCandidateFromRow(row), '陕西工信监管');
    }
    artifacts.push({
      artifact_type: 'network_response',
      title: '陕西工信招投标监管公开查询摘要',
      url: YANCHANG_REGULATION_LIST_URL,
      content: JSON.stringify({
        resultCode: payload.resultCode,
        count: payload.count,
        returned: payload.data.length,
        query: '延长石油',
        dateRange: `${formatShanghaiDate(new Date(recentStart))} - ${formatShanghaiDate(now)}`,
      }, null, 2),
      mime_type: 'application/json',
    });
  } catch (error) {
    warnings.push(`陕西工信监管补充源读取异常：${error instanceof Error ? error.message : String(error)}`);
  }

  let sntbaTotalPages = 1;
  for (let page = 1; page <= Math.min(sntbaTotalPages, YANCHANG_SNTBA_PAGE_LIMIT); page += 1) {
    await waitForInterval(lastRequestAt, Math.min(minimumIntervalMs, PUBLIC_SEARCH_QUERY_INTERVAL_MS));
    lastRequestAt = Date.now();
    stats.requests += 1;
    const url = yanchangSntbaSearchUrl({ now, recentDays, page });
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0' },
      });
      const html = await response.text();
      if (!response.ok) {
        warnings.push(`陕西招标投标公共服务平台第 ${page} 页读取失败：HTTP ${response.status}`);
        continue;
      }
      stats.successfulRequests += 1;
      if (page === 1) sntbaTotalPages = yanchangSntbaTotalPages(html);
      const rawRows = [...html.matchAll(/urlOpen\('([^']+)'\)[^>]*title=["']([^"']+)["']/gi)];
      const sourceCandidates = yanchangSntbaCandidatesFromHtml(html);
      recordRaw('陕西招标投标公共服务平台', rawRows.length);
      stats.nonActionableCount += Math.max(0, rawRows.length - sourceCandidates.length);
      for (const candidate of sourceCandidates) {
        acceptCandidate(candidate, '陕西招标投标公共服务平台');
      }
      if (page === 1) {
        artifacts.push({
          artifact_type: 'network_response',
          title: '陕西招标投标公共服务平台公开查询摘要',
          url,
          content: JSON.stringify({
            query: '延长石油',
            recentDays,
            totalPages: sntbaTotalPages,
            pageLimit: YANCHANG_SNTBA_PAGE_LIMIT,
            firstPageRows: rawRows.length,
          }, null, 2),
          mime_type: 'application/json',
        });
      }
    } catch (error) {
      warnings.push(`陕西招标投标公共服务平台第 ${page} 页读取异常：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (sntbaTotalPages > YANCHANG_SNTBA_PAGE_LIMIT) {
    warnings.push(`陕西招标投标公共服务平台共有 ${sntbaTotalPages} 页，本次按请求预算读取前 ${YANCHANG_SNTBA_PAGE_LIMIT} 页。`);
  }

  const limitedCandidates = candidates.slice(0, 100);
  stats.truncatedCount = Math.max(0, candidates.length - limitedCandidates.length);
  const summary = `延长石油三处公开来源共读取 ${stats.rawCount} 条（延长招采 ${sourceCounts.延长招采平台.raw}、陕西工信监管 ${sourceCounts.陕西工信监管.raw}、陕西招投标公共服务平台 ${sourceCounts.陕西招标投标公共服务平台.raw}），排除已截止 ${stats.expiredCount} 条、非延长/非货物/结果 ${stats.nonActionableCount} 条、重复 ${stats.duplicateCount} 条，保留 ${limitedCandidates.length} 条交给 LLM。`;
  const discoveryStats = discoveryStatsFor({
    provider,
    stats,
    eligibleCount: limitedCandidates.length,
    warnings,
    excludedNotices,
  });
  artifacts.push(publicSummaryArtifact({
    task,
    provider,
    summary,
    searchTerms: ['延长石油（买方词）'],
    stats,
    warnings,
    candidates: limitedCandidates,
  }));
  return {
    provider,
    status: limitedCandidates.length ? 'success' : stats.successfulRequests ? 'no_new' : 'failed',
    candidateBundle: limitedCandidates.length
      ? { source_name: task.sourceName, candidates: limitedCandidates }
      : null,
    artifacts,
    warnings,
    summary,
    discoveryStats,
  };
};

const htmlAttribute = (tag: string, name: string) => (
  tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || ''
);

const norincoBidCandidatesFromHtml = (html: string): TenderCandidate[] => (
  html.split(/<div\s+class=["']item["']\s*>/i).slice(1)
    .map((block): TenderCandidate | null => {
      const projectTag = block.match(/<a\b[^>]*class=["'][^"']*sldivTitle[^"']*["'][^>]*>/i)?.[0] || '';
      const buyerTag = block.match(/<a\b[^>]*class=["'][^"']*\btit\b[^"']*["'][^>]*>/i)?.[0] || '';
      const title = normalizeText(htmlAttribute(projectTag, 'title'));
      const url = normalizeUrl(htmlAttribute(projectTag, 'href'), NORINCO_BID_SEARCH_ENDPOINT);
      if (!title || !url) return null;
      const blockText = normalizeText(block);
      const buyerName = normalizeText(htmlAttribute(buyerTag, 'title'));
      const noticeType = normalizeText(block.match(/<em\b[^>]*class=["'][^"']*blue[^"']*["'][^>]*>([^<]+)<\/em>/i)?.[1] || '招标公告');
      const publishedAt = normalizeDate(blockText.match(/发布日期[：:]\s*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/i)?.[1] || '');
      const deadlineAt = normalizeDate(blockText.match(/文件购买截止时间[：:]?\s*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/i)?.[1] || '');
      const openAt = normalizeDate(blockText.match(/开标时间[：:]?\s*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/i)?.[1] || '');
      const code = normalizeText(blockText.match(/招标编号[：:]?\s*([^\s]+)/i)?.[1] || '');
      const industries = unique(
        [...block.matchAll(/<div\b[^>]*class=["'][^"']*trade[^"']*["'][^>]*title=["']([^"']+)["']/gi)]
          .map((match) => normalizeText(match[1])),
      );
      return {
        title,
        url,
        published_at: publishedAt,
        deadline_at: deadlineAt || openAt,
        buyer_name: buyerName,
        raw_text: normalizeText([
          '兵器网公开电子招投标公告',
          `公告类型：${noticeType}`,
          title,
          buyerName ? `采购/招标单位：${buyerName}` : '',
          code ? `招标编号：${code}` : '',
          industries.length ? `项目行业：${industries.join('、')}` : '',
          publishedAt ? `发布日期：${publishedAt}` : '',
          deadlineAt ? `文件购买截止时间：${deadlineAt}` : '',
          openAt ? `开标时间：${openAt}` : '',
        ].filter(Boolean).join(' ')),
        attachments: [],
        notice_type: noticeType,
      };
    })
    .filter((candidate): candidate is TenderCandidate => Boolean(candidate))
);

export const collectNorincoPublicNotices = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<SitePublicFeedResult> => {
  const provider = 'site-public-feed:norinco-bid-baseline';
  const recentDays = definitionFor(task.sourceName).browserJourney?.recentDays || 30;
  const recentStart = shanghaiDayStart(now, recentDays);
  const warnings: string[] = [];
  const excludedNotices: DiscoveryExcludedNotice[] = [];
  const stats: PublicCollectionStats = {
    requests: 1,
    successfulRequests: 0,
    rawCount: 0,
    expiredCount: 0,
    nonActionableCount: 0,
    duplicateCount: 0,
    truncatedCount: 0,
  };
  const candidates: TenderCandidate[] = [];
  try {
    const body = new URLSearchParams({
      fl: '1',
      hy: '',
      dq: '',
      es: '1',
      keyFlag: '',
      packtype: '',
      packtypeCode: '',
      packtypeValue: '',
      packtypeCodeValue: '',
      typflag: '1,2,14',
      fbdays: '4',
      esly: '',
      validityPeriodFlag: '1',
      flag1: '',
      orderby: '1',
    });
    const response = await fetchImpl(NORINCO_BID_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Referer': 'https://bid.norincogroup-ebuy.com/retrieve.do?typflag=1&es=1',
        'User-Agent': 'Mozilla/5.0 HCZ-ERP-Bid-Agent/1.0',
      },
      body: body.toString(),
    });
    const html = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    stats.successfulRequests = 1;
    const rows = norincoBidCandidatesFromHtml(html);
    stats.rawCount = rows.length;
    const seen = new Set<string>();
    for (const candidate of rows) {
      const deadline = timestampFor(candidate.deadline_at, true);
      if (Number.isFinite(deadline) && deadline < now.getTime()) {
        stats.expiredCount += 1;
        addExcludedNotice(excludedNotices, candidate, 'expired');
        continue;
      }
      const published = timestampFor(candidate.published_at);
      const stale = Number.isFinite(published) && published < recentStart;
      const text = `${candidate.title} ${candidate.raw_text}`;
      if (stale || RESULT_NOTICE_PATTERN.test(text) || NORINCO_NON_GOODS_PATTERN.test(text)) {
        stats.nonActionableCount += 1;
        addExcludedNotice(excludedNotices, candidate, 'non_actionable');
        continue;
      }
      const key = candidate.title.replace(/\s+/g, '');
      if (seen.has(key)) {
        stats.duplicateCount += 1;
        addExcludedNotice(excludedNotices, candidate, 'duplicate');
        continue;
      }
      seen.add(key);
      candidates.push(candidate);
    }
  } catch (error) {
    warnings.push(`兵器网公开招投标基线读取异常：${error instanceof Error ? error.message : String(error)}`);
  }
  const limitedCandidates = candidates.slice(0, 50);
  stats.truncatedCount = Math.max(0, candidates.length - limitedCandidates.length);
  const summary = `兵器网公开招投标基线读取 ${stats.rawCount} 条，排除已截止 ${stats.expiredCount} 条、工程服务/结果 ${stats.nonActionableCount} 条，保留 ${limitedCandidates.length} 条；商品询价继续在员工登录会话中按产品搜索。`;
  const discoveryStats = discoveryStatsFor({
    provider,
    stats,
    eligibleCount: limitedCandidates.length,
    warnings,
    excludedNotices,
  });
  return {
    provider,
    status: limitedCandidates.length ? 'success' : stats.successfulRequests ? 'no_new' : 'failed',
    candidateBundle: limitedCandidates.length
      ? { source_name: task.sourceName, candidates: limitedCandidates }
      : null,
    artifacts: [publicSummaryArtifact({
      task,
      provider,
      summary,
      searchTerms: [],
      stats,
      warnings,
      candidates: limitedCandidates,
    })],
    warnings,
    summary,
    discoveryStats,
  };
};

export const collectGuonengEgouFeeds = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
  minimumIntervalMs = GUONENG_QUERY_INTERVAL_MS,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SitePublicFeedResult> => {
  const latestCandidates: CandidateBundle['candidates'] = [];
  const searchCandidates: CandidateBundle['candidates'] = [];
  const artifacts: CollectionArtifact[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let lastSearchRequestAt = 0;
  let searchEndpointUnavailable = false;
  const addCandidate = (
    candidate: CandidateBundle['candidates'][number] | null,
    target: CandidateBundle['candidates'],
  ) => {
    if (!candidate) return;
    const key = candidateKey(candidate.title, candidate.url, candidate.published_at);
    if (seen.has(key)) return;
    seen.add(key);
    target.push(candidate);
  };

  for (const feed of GUONENG_EGOU_FEEDS) {
    try {
      const response = await fetchImpl(feed.url, {
        headers: { 'User-Agent': 'HCZ-ERP-Bid-Agent/1.0' },
      });
      const text = await response.text();
      artifacts.push({
        artifact_type: 'network_response',
        title: `${feed.name} feed`,
        url: feed.url,
        content: text.slice(0, 80_000),
        mime_type: 'application/json',
      });
      if (!response.ok) {
        warnings.push(`${feed.name} 读取失败：HTTP ${response.status}`);
        continue;
      }
      const payload = JSON.parse(text || '{}');
      for (const row of rowsFromPayload(payload)) {
        addCandidate(guonengEgouCandidateFromRow({
          row,
          sourceLabel: feed.name,
          baseUrl: feed.url,
        }), latestCandidates);
      }
    } catch (error) {
      warnings.push(`${feed.name} 读取异常：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const searchTerms = guonengEgouSearchTermsFor(task);
  for (const term of searchTerms) {
    if (searchEndpointUnavailable) break;
    for (const type of GUONENG_EGOU_SEARCH_NOTICE_TYPES) {
      await waitForInterval(lastSearchRequestAt, minimumIntervalMs);
      lastSearchRequestAt = Date.now();
      const params = new URLSearchParams({
        callback: 'hczErpBidAgent',
        quotDeadline: formatDateTimeForQuery(now),
        inquireName: term,
        publishArea: '',
        inquireCode: '',
        noticeType: String(type.noticeType),
        pageNo: '1',
        pageSize: String(PUBLIC_FEED_SEARCH_PAGE_SIZE),
        limit: String(PUBLIC_FEED_SEARCH_PAGE_SIZE),
        offset: '0',
      });
      const url = `${GUONENG_EGOU_SEARCH_ENDPOINT}?${params.toString()}`;
      try {
        const response = await fetchImpl(url, {
          headers: {
            'User-Agent': 'HCZ-ERP-Bid-Agent/1.0',
            'Referer': 'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireListOne/index.html',
          },
        });
        const text = await response.text();
        if (response.status === 405) {
          warnings.push('国能E购公开站内深搜接口当前不接受匿名请求，已停止深搜并保留公告源巡检结果');
          searchEndpointUnavailable = true;
          break;
        }
        if (!response.ok) {
          warnings.push(`国能E购站内深搜失败：${type.name}/${term} HTTP ${response.status}`);
          continue;
        }
        const payload = parseMaybeJsonp(text);
        const rows = rowsFromPayload(payload);
        if (rows.length) {
          artifacts.push({
            artifact_type: 'network_response',
            title: `国能E购站内深搜 ${type.name}/${term}`,
            url,
            content: text.slice(0, 80_000),
            mime_type: 'application/javascript',
          });
        }
        for (const row of rows) {
          addCandidate(guonengEgouCandidateFromRow({
            row,
            sourceLabel: `国能E购-${type.name}-站内深搜`,
            baseUrl: url,
          }), searchCandidates);
        }
      } catch (error) {
        warnings.push(`国能E购站内深搜异常：${type.name}/${term} ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const baselineCandidates = searchCandidates.length
    ? latestCandidates.slice(0, PUBLIC_FEED_BASELINE_LIMIT_AFTER_MATCH)
    : latestCandidates;
  const candidates = [...searchCandidates, ...baselineCandidates];
  return {
    provider: 'site-public-feed:guoneng-egou',
    status: candidates.length ? 'success' : warnings.length ? 'failed' : 'no_new',
    candidateBundle: candidates.length ? {
      source_name: task.sourceName,
      candidates,
    } : null,
    artifacts,
    warnings,
  };
};

export const collectSitePublicFeed = async ({
  task,
  fetchImpl = fetch,
}: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
}): Promise<SitePublicFeedResult> => {
  const collector = PUBLIC_FEED_COLLECTORS[task.sourceName];
  if (collector) return collector({ task, fetchImpl });
  return {
    provider: 'site-public-feed',
    status: 'unsupported',
    candidateBundle: null,
    artifacts: [],
    warnings: [],
  };
};

type RegisteredPublicFeedCollector = (input: {
  task: PublicCollectionTask;
  fetchImpl?: FetchLike;
}) => Promise<SitePublicFeedResult>;

const PUBLIC_FEED_COLLECTORS: Record<string, RegisteredPublicFeedCollector> = {
  易派克: ({ task, fetchImpl }) => collectSinopecPublicHtml({ task, fetchImpl }),
  国能E购: ({ task, fetchImpl }) => collectGuonengEgouFeeds({ task, fetchImpl }),
  国能E招: ({ task, fetchImpl }) => collectGuonengEBidPublicNotices({ task, fetchImpl }),
  中国海油供应链平台: ({ task, fetchImpl }) => collectCnoocPublicNotices({ task, fetchImpl }),
  中化采购供应链平台: ({ task, fetchImpl }) => collectSinochemPublicNotices({ task, fetchImpl }),
  云梦泽智慧平台: ({ task, fetchImpl }) => collectYmzPublicNotices({ task, fetchImpl }),
  延长石油招采网: ({ task, fetchImpl }) => collectYanchangPublicNotices({ task, fetchImpl }),
  隆道云: ({ task, fetchImpl }) => collectLongdaoPublicNotices({ task, fetchImpl }),
  金能科技采购平台: ({ task, fetchImpl }) => collectJinnengPublicNotices({ task, fetchImpl }),
  兵器网: ({ task, fetchImpl }) => collectNorincoPublicNotices({ task, fetchImpl }),
};

export type PublicDocumentEvidencePolicy = {
  enabled: boolean;
  candidateDetailReader?: PublicCandidateDetailReader;
  requireVerifiedDetail?: boolean;
};

const PUBLIC_DOCUMENT_EVIDENCE_POLICIES: Record<string, PublicDocumentEvidencePolicy> = {
  国能E招: { enabled: true, candidateDetailReader: readGuonengEBidPublicCandidateDetail },
  中国海油供应链平台: { enabled: true, candidateDetailReader: readCnoocPublicCandidateDetail },
  中化采购供应链平台: { enabled: true },
  云梦泽智慧平台: { enabled: true, candidateDetailReader: readYmzPublicCandidateDetail },
  延长石油招采网: { enabled: true, candidateDetailReader: readYanchangPublicCandidateDetail },
  隆道云: {
    enabled: true,
    candidateDetailReader: readLongdaoPublicCandidateDetail,
    requireVerifiedDetail: true,
  },
  金能科技采购平台: {
    enabled: true,
    candidateDetailReader: readJinnengPublicCandidateDetail,
    requireVerifiedDetail: true,
  },
};

export const publicDocumentEvidencePolicyFor = (sourceName: string): PublicDocumentEvidencePolicy => (
  PUBLIC_DOCUMENT_EVIDENCE_POLICIES[sourceName] || { enabled: false }
);
