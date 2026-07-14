import type { CandidateBundle, LocalHelperArtifact, LocalHelperTask } from './site-harness.ts';
import { siteCollectionSkillFor } from './site-skills.ts';

export type SitePublicFeedResult = {
  provider: string;
  status: 'unsupported' | 'success' | 'no_new' | 'failed';
  candidateBundle: CandidateBundle | null;
  artifacts: LocalHelperArtifact[];
  warnings: string[];
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
const GUONENG_EZHAO_NOTICE_URL = 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html';
const PUBLIC_HTML_CANDIDATE_LIMIT = 30;
const PUBLIC_FEED_SEARCH_TERM_LIMIT = 10;
const PUBLIC_FEED_SEARCH_PAGE_SIZE = 10;
const PUBLIC_FEED_BASELINE_LIMIT_AFTER_MATCH = 0;
const ACTIVE_NOTICE_PATTERN = /招标公告|采购公告|询价|询比|竞价|谈判|公开招标|邀请招标/;
const RESULT_NOTICE_PATTERN = /中标|成交|结果公告|结果公示|预成交|评标结果|流标|废标/;

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

const normalizeDate = (value = '') => {
  const raw = String(value || '').trim();
  if (/^\d{13}$/.test(raw)) {
    const date = new Date(Number(raw));
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

const candidateKey = (title = '', url = '') => `${title.replace(/\s+/g, '')}|${url}`;

const unique = <T>(items: T[]) => [...new Set(items.filter(Boolean))];

const splitSearchTerms = (value = '') => value
  .split(/[,\n，、;；\s]+/)
  .map((term) => term.trim())
  .filter(Boolean);

const formatDateTimeForQuery = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ` +
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
);

const parseMaybeJsonp = (text = '') => {
  const trimmed = text.trim();
  const jsonpMatch = trimmed.match(/^[\w.$]+\(([\s\S]*)\)\s*;?$/);
  return JSON.parse(jsonpMatch ? jsonpMatch[1] : trimmed || '{}');
};

const guonengEgouSearchTermsFor = (task: LocalHelperTask) => {
  const skill = siteCollectionSkillFor(task.sourceName);
  return unique([
    ...splitSearchTerms(task.searchTerms || ''),
    ...(skill.deepSearchTerms?.length ? skill.deepSearchTerms : skill.productFocus || []),
  ])
    .filter((term) => term.length >= 2)
    .filter((term) => !/^(国能|国能E购|询价|竞价|竞争性谈判|采购|公告|化工助剂)$/.test(term))
    .slice(0, PUBLIC_FEED_SEARCH_TERM_LIMIT);
};

const htmlAttribute = (tag = '', name = '') => {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
  return match?.[1] || '';
};

const collectPublicHtmlFeed = async ({
  task,
  feedName,
  url,
  parse,
  fetchImpl,
}: {
  task: LocalHelperTask;
  feedName: string;
  url: string;
  parse: (html: string, baseUrl: string) => CandidateBundle['candidates'];
  fetchImpl: FetchLike;
}): Promise<SitePublicFeedResult> => {
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'HCZ-Local-Bidding-Agent/1.0' },
    });
    const text = await response.text();
    const artifacts: LocalHelperArtifact[] = [{
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

const parseGuonengEzhaoPublicHtml = (
  html: string,
  baseUrl: string,
): CandidateBundle['candidates'] => {
  const candidates: CandidateBundle['candidates'] = [];
  const rowPattern = /<li\b[^>]*class=["'][^"']*right-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  for (const match of html.matchAll(rowPattern)) {
    const rowHtml = match[1] || '';
    const anchor = rowHtml.match(/<a\b(?=[^>]*class=["'][^"']*infolink[^"']*["'])[^>]*>/i)?.[0] || '';
    const href = htmlAttribute(anchor, 'href');
    const title = normalizeText(htmlAttribute(anchor, 'title'));
    if (!href || !title) continue;
    if (!shouldKeepPublicNotice(title)) continue;
    const publishedAt = normalizeDate(normalizeText(
      rowHtml.match(/<span\b[^>]*class=["'][^"']*\br\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '',
    ));
    candidates.push({
      title,
      url: normalizeUrl(href, baseUrl),
      published_at: publishedAt,
      deadline_at: '',
      buyer_name: '国家能源集团',
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
  task: LocalHelperTask;
  fetchImpl?: FetchLike;
}): Promise<SitePublicFeedResult> => collectPublicHtmlFeed({
  task,
  feedName: 'sinopec-public-html',
  url: task.entryUrl || SINOPEC_NOTICE_URL,
  parse: parseSinopecPublicHtml,
  fetchImpl,
});

export const collectGuonengEzhaoHtml = async ({
  task,
  fetchImpl = fetch,
}: {
  task: LocalHelperTask;
  fetchImpl?: FetchLike;
}): Promise<SitePublicFeedResult> => collectPublicHtmlFeed({
  task,
  feedName: 'guoneng-ezhao-html',
  url: task.entryUrl || GUONENG_EZHAO_NOTICE_URL,
  parse: parseGuonengEzhaoPublicHtml,
  fetchImpl,
});

export const collectGuonengEgouFeeds = async ({
  task,
  fetchImpl = fetch,
  now = new Date(),
}: {
  task: LocalHelperTask;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<SitePublicFeedResult> => {
  const latestCandidates: CandidateBundle['candidates'] = [];
  const searchCandidates: CandidateBundle['candidates'] = [];
  const artifacts: LocalHelperArtifact[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (
    candidate: CandidateBundle['candidates'][number] | null,
    target: CandidateBundle['candidates'],
  ) => {
    if (!candidate) return;
    const key = candidateKey(candidate.title, candidate.url);
    if (seen.has(key)) return;
    seen.add(key);
    target.push(candidate);
  };

  for (const feed of GUONENG_EGOU_FEEDS) {
    try {
      const response = await fetchImpl(feed.url, {
        headers: { 'User-Agent': 'HCZ-Local-Bidding-Agent/1.0' },
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
    for (const type of GUONENG_EGOU_SEARCH_NOTICE_TYPES) {
      const params = new URLSearchParams({
        callback: 'hczLocalHelper',
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
            'User-Agent': 'HCZ-Local-Bidding-Agent/1.0',
            'Referer': 'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireListOne/index.html',
          },
        });
        const text = await response.text();
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
            sourceLabel: `国能E购-${type.name}-站内深搜：${term}`,
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
  task: LocalHelperTask;
  fetchImpl?: FetchLike;
}): Promise<SitePublicFeedResult> => {
  if (task.sourceName === '易派克') {
    return collectSinopecPublicHtml({ task, fetchImpl });
  }
  if (task.sourceName === '国能E招' || task.sourceName === '国能网') {
    return collectGuonengEzhaoHtml({ task, fetchImpl });
  }
  if (task.sourceName === '国能E购') {
    return collectGuonengEgouFeeds({ task, fetchImpl });
  }
  return {
    provider: 'site-public-feed',
    status: 'unsupported',
    candidateBundle: null,
    artifacts: [],
    warnings: [],
  };
};
