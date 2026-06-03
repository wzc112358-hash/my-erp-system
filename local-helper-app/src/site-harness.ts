// 通用的本地采集 harness：把原先写死在华锦的逻辑抽成"按站点配置"的形式，
// 第二批站点（云梦泽、能源一号、隆道云、金能、易派克等）只需提供一个 profile 即可复用。

export type BrowserObservation = {
  title: string;
  url: string;
  visibleText: string;
  screenshotPath?: string;
};

export type BrowserHarnessRuntime = {
  open(url: string): Promise<BrowserObservation>;
  observe(): Promise<BrowserObservation>;
  screenshot?(): Promise<string>;
};

export type LocalHelperTask = {
  id: string;
  sourceName: string;
  entryUrl: string;
  searchTerms?: string;
};

export type CandidateBundle = {
  source_name: string;
  candidates: Array<{
    title: string;
    url: string;
    published_at: string;
    deadline_at: string;
    buyer_name: string;
    raw_text: string;
    attachments: string[];
  }>;
};

export type SiteHarnessProfile = {
  sourceName: string;
  // 出现登录/验证码/CA/短信等时暂停交人；默认覆盖大多数登录站点。
  humanRequiredPattern?: RegExp;
  // 空白页/加载失败时也交人确认。
  emptyPagePattern?: RegExp;
  // 命中即视为公告标题。
  noticeTitlePattern?: RegExp;
  // 命中即排除（导航/登录等噪声行）。
  excludePattern?: RegExp;
  // 采购方名称：buyerMatch 命中该行时附加 buyerName；buyerMatch 缺省时始终附加 buyerName。
  buyerName?: string;
  buyerMatch?: RegExp;
  // 单次最多提取的候选数。
  maxCandidates?: number;
};

export const DEFAULT_HUMAN_REQUIRED_PATTERN =
  /登录|账号|密码|验证码|短信|手机验证码|安全验证|CA|证书|滑块|请先登录/i;
export const DEFAULT_EMPTY_PAGE_PATTERN =
  /页面无法访问|ERR_EMPTY_RESPONSE|无法打开|空白页|加载失败/i;
export const DEFAULT_NOTICE_TITLE_PATTERN = /公告|采购|询价|招标|竞价|谈判|公示|变更/;
export const DEFAULT_EXCLUDE_PATTERN = /登录|注册|首页|帮助|导航|验证码/;
export const DEFAULT_MAX_CANDIDATES = 30;

const DATE_PATTERN = /(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2})/;
const DEADLINE_HINT_PATTERN = /截止|递交|报价/;

export const analyzeObservation = (
  observation: BrowserObservation,
  profile: SiteHarnessProfile,
) => {
  const humanPattern = profile.humanRequiredPattern || DEFAULT_HUMAN_REQUIRED_PATTERN;
  const emptyPattern = profile.emptyPagePattern || DEFAULT_EMPTY_PAGE_PATTERN;
  const text = `${observation.title}\n${observation.url}\n${observation.visibleText}`;
  if (humanPattern.test(text)) {
    return {
      status: 'request_human',
      reason: '检测到登录、验证码、短信、CA 或安全验证，需要员工在本机浏览器接管。',
    };
  }
  if (!observation.visibleText.trim() || emptyPattern.test(text)) {
    return {
      status: 'request_human',
      reason: '页面为空或加载失败，需要员工确认网络、账号或站点可访问性。',
    };
  }
  return {
    status: 'ready',
    reason: '',
  };
};

const normalizeDate = (value = '') => {
  const raw = value
    .replace(/[年月/.]/g, '-')
    .replace(/日/g, '')
    .replace(/--+/g, '-')
    .replace(/-$/g, '');
  if (!raw) return '';
  const [year, month, day] = raw.split('-');
  if (!year || !month || !day) return '';
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const looksLikeNoticeTitle = (line: string, profile: SiteHarnessProfile) => {
  const noticePattern = profile.noticeTitlePattern || DEFAULT_NOTICE_TITLE_PATTERN;
  const excludePattern = profile.excludePattern || DEFAULT_EXCLUDE_PATTERN;
  return noticePattern.test(line) && !excludePattern.test(line);
};

export const extractCandidateBundle = (
  observation: BrowserObservation,
  task: LocalHelperTask,
  profile: SiteHarnessProfile,
): CandidateBundle => {
  const maxCandidates = profile.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const lines = observation.visibleText
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const candidates = lines
    .filter((line) => looksLikeNoticeTitle(line, profile))
    .slice(0, maxCandidates)
    .map((line) => {
      const date = normalizeDate(line.match(DATE_PATTERN)?.[1] || '');
      const buyerName = profile.buyerMatch
        ? (profile.buyerMatch.test(line) ? profile.buyerName || '' : '')
        : (profile.buyerName || '');
      return {
        title: line.slice(0, 180),
        url: observation.url,
        published_at: date,
        deadline_at: DEADLINE_HINT_PATTERN.test(line) ? date : '',
        buyer_name: buyerName,
        raw_text: line,
        attachments: [],
      };
    });

  return {
    source_name: task.sourceName || profile.sourceName,
    candidates,
  };
};

export const createSiteHarness = ({
  browser,
  profile,
}: {
  browser: BrowserHarnessRuntime;
  profile: SiteHarnessProfile;
}) => ({
  async openTask(task: LocalHelperTask) {
    const observation = await browser.open(task.entryUrl);
    const analysis = analyzeObservation(observation, profile);
    if (analysis.status === 'request_human') {
      return {
        status: 'request_human',
        observation,
        humanReason: analysis.reason,
        candidateBundle: null,
      };
    }
    return {
      status: 'ready',
      observation,
      humanReason: '',
      candidateBundle: extractCandidateBundle(observation, task, profile),
    };
  },

  async continueTask(task: LocalHelperTask) {
    const observation = await browser.observe();
    const analysis = analyzeObservation(observation, profile);
    if (analysis.status === 'request_human') {
      return {
        status: 'request_human',
        observation,
        humanReason: analysis.reason,
        candidateBundle: null,
      };
    }
    return {
      status: 'completed',
      observation,
      humanReason: '',
      candidateBundle: extractCandidateBundle(observation, task, profile),
    };
  },
});
