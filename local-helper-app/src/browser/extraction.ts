import type {
  BrowserObservation,
  CandidateBundle,
  LocalHelperArtifact,
  LocalHelperTask,
  SiteHarnessProfile,
} from './types.ts';

export type {
  BrowserHarnessRuntime,
  BrowserLink,
  BrowserNetworkResponse,
  BrowserObservation,
  CandidateBundle,
  LocalHelperArtifact,
  LocalHelperTask,
  SiteHarnessProfile,
} from './types.ts';

export const DEFAULT_HUMAN_REQUIRED_PATTERN =
  /验证码|短信|手机验证码|安全验证|滑块|请先登录|未登录|登录超时|登录已失效|重新登录|CA证书|数字证书|access verification|slide to verify|not a robot|traceid|robot|(?:账号|用户名|手机号|邮箱).{0,20}密码|密码.{0,20}(?:账号|用户名|手机号|邮箱)/i;
export const STRONG_HUMAN_REQUIRED_PATTERN =
  /输入验证码|请输入验证码|填写验证码|安全验证|滑块|access verification|slide to verify|not a robot|traceid/i;
export const DEFAULT_EMPTY_PAGE_PATTERN =
  /页面无法访问|ERR_EMPTY_RESPONSE|无法打开|空白页|加载失败|bad gateway|(?:^|\s|http\s*)502(?:\s|$|bad gateway)|网关错误/i;
export const DEFAULT_NOTICE_TITLE_PATTERN = /公告|采购|询价|招标公告|招标项目|公开招标|邀请招标|竞价|谈判|公示|变更/;
export const DEFAULT_EXCLUDE_PATTERN = /登录|注册|首页|帮助|导航|验证码/;
export const DEFAULT_MAX_CANDIDATES = 30;

const DATE_PATTERN = /(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2})/;
const DEADLINE_HINT_PATTERN = /截止|递交|报价/;
const ATTACHMENT_LINK_PATTERN = /\.(?:pdf|doc|docx|xls|xlsx|zip|rar)(?:[?#].*)?$/i;
const ATTACHMENT_TEXT_PATTERN = /附件|下载|标书|采购文件|招标文件|询价文件/;
const NOTICE_NAV_TEXT_PATTERN = /^(招标公示\/公告|非招标公示\/公告|招标公告|投标邀请书|资格预审公告|外部招标机构公告|非招标公告|变更公告|候选人公示|中标公告|中标结果公告|终止公告|招标计划|招标文件公示|邀请招标事项公示|可不招标事项公示|谈判采购|竞价采购|询比采购|直接采购|拟成交结果公示|成交结果公告|公告信息|新闻动态|更多|查看全部)$/;
const NOTICE_NAV_TOKEN_PATTERN = /(招标公示\/公告|非招标公示\/公告|招标公告|投标邀请书|资格预审公告|外部招标机构公告|非招标公告|变更公告|候选人公示|中标公告|中标结果公告|终止公告|招标计划|招标文件公示|邀请招标事项公示|可不招标事项公示|谈判采购|竞价采购|询比采购|直接采购|拟成交结果公示|成交结果公告|公告信息|新闻动态|更多|查看全部)/g;
const PORTAL_CONTROL_TEXT_PATTERN = /^(全部)?招标人招标代理机构$|^搜索$|^搜标题$|^加载中\.{0,3}$|TenderSeek|全网标讯智能搜索引擎|招标计划资格预审公告招标公告|谈判采购竞价采购询比采购|培训通知|投标人培训|线上直播|操作实务|实战技能专项培训|系统发版|域名变更|平台升级|平台通知|新闻通知|操作指南|中国石油中国招标投标公共服务平台|中国招标投标公共服务平台|中国石油采购与招标网|全国企业采购交易|中国招标投标协会|国有企业采购供应信用管理平台|国家企业信用信息公示系统|采购与招标相关网站|典型招标文件|京ICP备|版权所有|法律声明|联系我们|网站使用帮助|客服咨询|客户服务|政策法规|操作说明|操作手册|常见问题|下载专区|用户手册|培训课件|工具下载|常用网站|集团公司网站|登录信息定制|开启更多服务|发布工具|发布媒介|问题清单|搜索引擎|增值服务|专栏首页/;
const NOTICE_FIELD_LABEL_PATTERN = /^(?:类型|公告类型|公告结束时间|发布时间|发布日期|开标时间|项目单位|招标编号|计划编号|招标人|采购人|截止时间|报价截止)[:：]/;
const NOTICE_CATEGORY_LABEL_PATTERN = /^(?:公开招标公告\/资格预审公告|邀请招标事项公示|可不招事项公示|中标候选人公示\/评标结果公示|中标结果公告)$/;
const ARTIFACT_TEXT_LIMIT = 120_000;
const NETWORK_RESPONSE_LIMIT = 20;
const NETWORK_TITLE_FIELDS = [
  'title',
  'noticeName',
  'noticeTitle',
  'bulletinTitle',
  'projectName',
  'enquiryOrderName',
  'bidName',
  'name',
];
const NETWORK_URL_FIELDS = [
  'url', 'link', 'href', 'noticeUrl', 'detailUrl', 'pdfUrl',
  'preSupFileId', 'aftSupFileId', 'systemSourceUrl',
];
const NETWORK_DATE_FIELDS = [
  'published_at', 'publishDate', 'publishTime', 'publishTimeStr', 'noticeSendTime',
  'createTime', 'createTimeStr', 'releaseTime', 'startTime', 'startTimeStr',
];
const NETWORK_DEADLINE_FIELDS = ['deadline_at', 'deadline', 'quotDeadline', 'endTime', 'endTimeStr', 'bidEndTime'];
const NETWORK_BUYER_FIELDS = [
  'buyer_name', 'buyerName', 'purchaseUnit', 'purchaseCompanyName', 'buName',
  'purchaser', 'tenderer', 'publishArea',
];

const visibleLines = (text = '') => text
  .split(/\n+/)
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const looksLikeNoticeTitle = (line: string, profile: SiteHarnessProfile) => {
  const noticePattern = profile.noticeTitlePattern || DEFAULT_NOTICE_TITLE_PATTERN;
  const excludePattern = profile.excludePattern || DEFAULT_EXCLUDE_PATTERN;
  const candidateLinePattern = profile.candidateLinePattern;
  const noisePattern = profile.noisePattern;
  const compactLine = line.replace(/\s+/g, '');
  if (NOTICE_NAV_TEXT_PATTERN.test(compactLine)) return false;
  if (compactLine === '全部招标采购非招标采购' ||
    NOTICE_FIELD_LABEL_PATTERN.test(line) ||
    NOTICE_CATEGORY_LABEL_PATTERN.test(line)) return false;
  if (PORTAL_CONTROL_TEXT_PATTERN.test(compactLine) || PORTAL_CONTROL_TEXT_PATTERN.test(line)) return false;
  if (!compactLine.replace(NOTICE_NAV_TOKEN_PATTERN, '')) return false;
  if (compactLine.length < 8 && !DATE_PATTERN.test(line)) return false;
  if (noisePattern?.test(line)) return false;
  return (noticePattern.test(line) || Boolean(candidateLinePattern?.test(line))) && !excludePattern.test(line);
};

const hasNoticeContent = (
  observation: BrowserObservation,
  profile: SiteHarnessProfile,
) => visibleLines(observation.visibleText).some((line) => looksLikeNoticeTitle(line, profile)) ||
  (observation.links || []).some((link) => looksLikeNoticeTitle(link.title || link.text || link.href, profile)) ||
  networkCandidatesFor(observation, profile).length > 0;

const isBlockingNetworkChallenge = (
  response: NonNullable<BrowserObservation['networkResponses']>[number],
  pageUrl: string,
) => {
  if (!response.challenge) return false;
  if (response.responseHeaders?.['punish-type']) return true;
  let pageHost = '';
  let responseHost = '';
  try {
    pageHost = new URL(pageUrl).hostname;
    responseHost = new URL(response.url).hostname;
  } catch {
    return /sigchl|punish-type|安全验证|访问验证|访问过于频繁/i.test(response.bodySnippet || '');
  }
  const sameSite = pageHost === responseHost ||
    pageHost.endsWith(`.${responseHost}`) ||
    responseHost.endsWith(`.${pageHost}`);
  if (sameSite) return true;
  // Third-party captcha SDK config and telemetry are present during successful
  // visits. They only block collection when they return an actual HTML
  // challenge document, not merely because the provider name contains captcha.
  return /text\/html/i.test(response.contentType || '') &&
    /sigchl|punish-type|安全验证|访问验证|访问过于频繁/i.test(response.bodySnippet || '');
};

export const analyzeObservation = (
  observation: BrowserObservation,
  profile: SiteHarnessProfile,
) => {
  const humanPattern = profile.humanRequiredPattern || DEFAULT_HUMAN_REQUIRED_PATTERN;
  const emptyPattern = profile.emptyPagePattern || DEFAULT_EMPTY_PAGE_PATTERN;
  const visibleText = observation.visibleText || '';
  const authText = `${observation.title}\n${visibleText}`;
  const pageText = `${authText}\n${observation.url}`;
  const networkChallenge = (observation.networkResponses || [])
    .find((response) => isBlockingNetworkChallenge(response, observation.url));
  if (networkChallenge) {
    return {
      status: 'request_human',
      reason: '站点搜索接口返回安全挑战，需要员工在当前浏览器完成验证后继续。',
    };
  }
  if (!visibleText.trim() || emptyPattern.test(pageText)) {
    return {
      status: 'request_human',
      reason: '页面为空或加载失败，需要员工确认网络、账号或站点可访问性。',
    };
  }
  if (STRONG_HUMAN_REQUIRED_PATTERN.test(authText)) {
    return {
      status: 'request_human',
      reason: '检测到强验证码或滑块验证，需要员工在本机浏览器接管。',
    };
  }
  if (humanPattern.test(authText) && !hasNoticeContent(observation, profile)) {
    return {
      status: 'request_human',
      reason: '检测到登录、验证码、短信、CA 或安全验证，需要员工在本机浏览器接管。',
    };
  }
  return {
    status: 'ready',
    reason: '',
  };
};

const normalizeDate = (value = '') => {
  const match = String(value || '').match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const candidateIdentityTitle = (title = '') => title
  .replace(DATE_PATTERN, '')
  .replace(/(?:报价)?截止.*$/g, '')
  .replace(/\s+/g, '')
  .trim();

const normalizeUrl = (href = '', baseUrl = '') => {
  try {
    return new URL(href, baseUrl || undefined).toString();
  } catch {
    return href;
  }
};

const trimArtifactContent = (value = '', limit = ARTIFACT_TEXT_LIMIT) => (
  value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value
);

const attachmentLinksFor = (observation: BrowserObservation) => (
  (observation.links || [])
    .filter((link) => {
      const label = (link.title || link.text || '').replace(/\s+/g, ' ').trim();
      return ATTACHMENT_LINK_PATTERN.test(link.href) ||
        (ATTACHMENT_TEXT_PATTERN.test(label) && !NOTICE_NAV_TEXT_PATTERN.test(label.replace(/\s+/g, '')));
    })
    .map((link) => normalizeUrl(link.href, observation.url))
    .filter(Boolean)
);

const linkCandidatesFor = (
  observation: BrowserObservation,
  profile: SiteHarnessProfile,
) => (observation.links || [])
  .map((link) => {
    const title = (link.title || link.text || '').replace(/\s+/g, ' ').trim();
    const attachmentOnly = ATTACHMENT_LINK_PATTERN.test(link.href) ||
      (/附件|下载|标书|文件/.test(title) && !/公告|项目|采购需求|询价单/.test(title));
    if (attachmentOnly) return null;
    if (!looksLikeNoticeTitle(title, profile)) return null;
    const href = normalizeUrl(link.href, observation.url);
    const publishedAt = normalizeDate(title.match(DATE_PATTERN)?.[1] || '');
    const buyerName = profile.buyerMatch
      ? (profile.buyerMatch.test(title) ? profile.buyerName || '' : '')
      : (profile.buyerName || '');
    return {
      title: title.slice(0, 180),
      url: href || observation.url,
      published_at: publishedAt,
      deadline_at: DEADLINE_HINT_PATTERN.test(title) ? publishedAt : '',
      buyer_name: buyerName,
      raw_text: title,
      attachments: attachmentLinksFor(observation),
    };
  })
  .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

const listItemCandidatesFor = (
  observation: BrowserObservation,
  profile: SiteHarnessProfile,
) => (observation.listItems || [])
  .map((item) => {
    const title = String(item.title || '').replace(/\s+/g, ' ').trim();
    if (!looksLikeNoticeTitle(title, profile)) return null;
    if (profile.noisePattern?.test(title + ' ' + (item.rawText || ''))) return null;
    const buyerName = item.buyerName || (profile.buyerMatch
      ? (profile.buyerMatch.test(`${title} ${item.rawText || ''}`) ? profile.buyerName || '' : '')
      : (profile.buyerName || ''));
    return {
      title: title.slice(0, 220),
      url: item.url ? normalizeUrl(item.url, observation.url) : observation.url,
      published_at: normalizeDate(item.publishedAt || ''),
      deadline_at: normalizeDate(item.deadlineAt || ''),
      buyer_name: buyerName,
      raw_text: String(item.rawText || title).trim().slice(0, 3000),
      attachments: attachmentLinksFor(observation),
      browser_ref: item.elementId || undefined,
      search_query: observation.searchQuery || undefined,
      notice_type: item.noticeType || undefined,
    };
  })
  .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

const fieldValue = (row: Record<string, unknown>, fields: string[]) => {
  for (const field of fields) {
    const value = row[field];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
};

const rowAttachmentUrls = (row: Record<string, unknown>, baseUrl: string) => {
  const direct = [
    row.pdfUrl, row.preSupFileId, row.aftSupFileId, row.preCaFileid, row.aftCaFileid,
  ];
  const nested = Array.isArray(row.attachmentsDTOs)
    ? row.attachmentsDTOs.flatMap((item) => item && typeof item === 'object'
      ? [item.url, item.fileUrl, item.downloadUrl, item.filePath]
      : [])
    : [];
  return [...direct, ...nested]
    .map((value) => normalizeUrl(String(value || ''), baseUrl))
    .filter((value) => /^https?:/i.test(value))
    .filter((value, index, all) => all.indexOf(value) === index);
};

const walkJsonRows = (value: unknown, rows: Record<string, unknown>[] = []) => {
  if (Array.isArray(value)) {
    for (const item of value) walkJsonRows(item, rows);
    return rows;
  }
  if (!value || typeof value !== 'object') return rows;
  const record = value as Record<string, unknown>;
  if (fieldValue(record, NETWORK_TITLE_FIELDS)) rows.push(record);
  for (const child of Object.values(record)) {
    if (Array.isArray(child) || (child && typeof child === 'object')) walkJsonRows(child, rows);
  }
  return rows;
};

const parseNetworkRows = (text = '') => {
  const cleaned = text.replace(/\n\.\.\.\[truncated\]$/g, '');
  try {
    return walkJsonRows(JSON.parse(cleaned));
  } catch {
    const rows: Record<string, unknown>[] = [];
    const titleMatches = cleaned.matchAll(/"(?:title|noticeName|noticeTitle|bulletinTitle|projectName|enquiryOrderName)"\s*:\s*"([^"]{4,220})"/g);
    for (const match of titleMatches) rows.push({ title: match[1] });
    return rows;
  }
};

const networkCandidatesFor = (
  observation: BrowserObservation,
  profile: SiteHarnessProfile,
) => {
  const pageAttachments = attachmentLinksFor(observation);
  return (observation.networkResponses || [])
    .flatMap((response) => parseNetworkRows(response.bodySnippet || '').map((row) => ({ row, response })))
    .map(({ row, response }) => {
      const title = fieldValue(row, NETWORK_TITLE_FIELDS).replace(/\s+/g, ' ').trim();
      if (!looksLikeNoticeTitle(title, profile)) return null;
      const url = normalizeUrl(fieldValue(row, NETWORK_URL_FIELDS), response.url || observation.url) || observation.url;
      const publishedAt = normalizeDate(fieldValue(row, NETWORK_DATE_FIELDS));
      const deadlineAt = normalizeDate(fieldValue(row, NETWORK_DEADLINE_FIELDS));
      const buyerName = fieldValue(row, NETWORK_BUYER_FIELDS) || (
        profile.buyerMatch
          ? (profile.buyerMatch.test(title) ? profile.buyerName || '' : '')
          : (profile.buyerName || '')
      );
      const rowAttachments = rowAttachmentUrls(row, response.url || observation.url);
      return {
        title: title.slice(0, 180),
        url,
        published_at: publishedAt,
        deadline_at: deadlineAt,
        buyer_name: buyerName,
        raw_text: JSON.stringify(row).slice(0, 5000),
        attachments: [...new Set([...rowAttachments, ...pageAttachments])],
        notice_type: fieldValue(row, ['noticeTypeName', 'plateTypeName', 'purchaseMethodDesc']) || undefined,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
};

export const buildObservationArtifacts = (
  observation: BrowserObservation,
  task: LocalHelperTask,
): LocalHelperArtifact[] => {
  const artifacts: LocalHelperArtifact[] = [];
  if (observation.domSnapshot) {
    artifacts.push({
      artifact_type: 'dom_snapshot',
      title: `${task.sourceName || '本地助手'} DOM 快照`,
      url: observation.url,
      content: trimArtifactContent(observation.domSnapshot),
      mime_type: 'text/html',
    });
  }
  const networkResponses = (observation.networkResponses || []).slice(-NETWORK_RESPONSE_LIMIT);
  if (networkResponses.length > 0) {
    artifacts.push({
      artifact_type: 'network_response',
      title: `${task.sourceName || '本地助手'} 网络响应摘要`,
      url: observation.url,
      content: trimArtifactContent(JSON.stringify(networkResponses, null, 2)),
      mime_type: 'application/json',
    });
  }
  for (const attachment of [
    ...attachmentLinksFor(observation),
    ...(observation.downloadedFiles || []),
  ]) {
    artifacts.push({
      artifact_type: 'attachment',
      title: `${task.sourceName || '本地助手'} 附件线索`,
      url: observation.url,
      content: attachment,
      mime_type: 'text/plain',
    });
  }
  return artifacts;
};

export const extractCandidateBundle = (
  observation: BrowserObservation,
  task: LocalHelperTask,
  profile: SiteHarnessProfile,
): CandidateBundle => {
  const maxCandidates = profile.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const lines = visibleLines(observation.visibleText);
  const globalAttachments = attachmentLinksFor(observation);
  const textCandidates = lines
    .map((line, index) => {
      if (!looksLikeNoticeTitle(line, profile)) return null;
      const nearbyText = [
        line,
        lines[index + 1] || '',
        lines[index + 2] || '',
        lines[index + 3] || '',
        lines[index + 4] || '',
      ].join(' ');
      const date = normalizeDate(nearbyText.match(DATE_PATTERN)?.[1] || '');
      const buyerName = profile.buyerMatch
        ? (profile.buyerMatch.test(line) ? profile.buyerName || '' : '')
        : (profile.buyerName || '');
      return {
        title: line.replace(/^商(?=\S{4,})/, '').slice(0, 180),
        url: observation.url,
        published_at: date,
        deadline_at: DEADLINE_HINT_PATTERN.test(nearbyText) ? date : '',
        buyer_name: buyerName,
        raw_text: nearbyText.trim(),
        attachments: globalAttachments,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  const listCandidates = listItemCandidatesFor(observation, profile);
  const hasStructuredList = (observation.listItems || []).length > 0;
  const networkCandidates = hasStructuredList ? [] : networkCandidatesFor(observation, profile);
  const fallbackCandidates = hasStructuredList || networkCandidates.length > 0
    ? []
    : [...linkCandidatesFor(observation, profile), ...textCandidates];
  const candidates = [
    ...listCandidates,
    ...networkCandidates,
    ...fallbackCandidates,
  ]
    .filter((candidate, index, all) => {
      const key = `${candidate.url || ''}|${candidate.title}`;
      const titleKey = candidateIdentityTitle(candidate.title);
      return index === all.findIndex((item) => `${item.url || ''}|${item.title}` === key) &&
        index === all.findIndex((item) => candidateIdentityTitle(item.title) === titleKey);
    })
    .slice(0, maxCandidates);

  return {
    source_name: task.sourceName || profile.sourceName,
    candidates,
  };
};
