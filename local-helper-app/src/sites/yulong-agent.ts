import type {
  BrowserAction,
  BrowserObservation,
  BrowserSession,
  LocalHelperTask,
} from '../browser/types.ts';
import {
  planBrowserActionWithLLM,
  type BrowserActionPlanner,
} from '../llm/browser-action-planner.ts';
import type { LocalLLMConfig } from '../llm/client.ts';

export const YULONG_QUERY = '裕龙石化';
const VISIBLE_CHALLENGE_PATTERN = /安全验证|滑块|验证码|网易易盾|VAPTCHA|请完成验证|访问验证|请拖动|向右滑动|not a robot/i;

export const rewriteYulongSearchRequestUrl = (value: string) => {
  try {
    const url = new URL(value);
    if ((url.hostname === 'ctbpsp.com' || url.hostname.endsWith('.ctbpsp.com')) &&
      /\/cutominfoapi\/(?:searchkeyword|searchkeywordTitle)/i.test(url.pathname)) {
      url.searchParams.set('bulletinType', '0');
      return url.toString();
    }
  } catch {
    // Non-URL traffic is outside this site adapter.
  }
  return value;
};

export type YulongBrowserAgentResult = {
  status: 'ready' | 'request_human' | 'scope_failed';
  observation: BrowserObservation;
  humanReason: string;
  searchCompleted: boolean;
  collectedPages: number;
};

const hasNetworkChallenge = (observation: BrowserObservation) => (
  (observation.networkResponses || []).some((response) => {
    if (!response.challenge) return false;
    let hostname = '';
    try {
      hostname = new URL(response.url).hostname;
    } catch {
      return false;
    }
    // The search page always loads NetEase captcha SDK configuration in the
    // background. That is telemetry, not a blocking challenge. Only a blocked
    // response from the tender site itself should trigger human takeover;
    // an actual NetEase widget is detected from the visible page instead.
    if (hostname !== 'ctbpsp.com' && !hostname.endsWith('.ctbpsp.com')) return false;
    const headers = response.responseHeaders || {};
    return Boolean(headers['punish-type']) ||
      /sigchl|punish-type|安全验证|访问验证|访问过于频繁|<!doctype\s+html/i.test(response.bodySnippet || '') ||
      /text\/html/i.test(response.contentType || '');
  })
);

const hasVisibleChallenge = (observation: BrowserObservation) => (
  Boolean(observation.humanChallengeVisible) ||
  VISIBLE_CHALLENGE_PATTERN.test(`${observation.title}\n${observation.visibleText}\n${observation.url}`)
);

const hasSuccessfulSearchEvidence = (observation: BrowserObservation) => (
  (observation.networkResponses || []).some((response) => {
    if (response.challenge) return false;
    if (response.url.startsWith('hcz://browser-state/yulong')) return true;
    if (!response.url.includes('/cutominfoapi/searchkeyword?')) return false;
    return !/text\/html/i.test(response.contentType || '') && !/^\s*<!doctype html/i.test(response.bodySnippet || '');
  })
);

export const isScopedYulongSearch = (observation: BrowserObservation) => {
  const decodedUrl = decodeURIComponent(observation.url || '');
  return decodedUrl.includes('/bulletinList') &&
    (observation.searchQuery || '').replace(/\s+/g, '').includes(YULONG_QUERY) &&
    (observation.noticeType === undefined || observation.noticeType === 0) &&
    !(observation.noticeTypes || []).some((type) => type && !/招标公告/.test(type)) &&
    hasSuccessfulSearchEvidence(observation);
};

const waitForSearchResult = async (
  browser: BrowserSession,
  first: BrowserObservation,
  attempts = 5,
) => {
  let current = first;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (isScopedYulongSearch(current) || hasVisibleChallenge(current)) return current;
    if (!browser.act) return current;
    current = (await browser.act({ type: 'wait', milliseconds: 900 })).observation;
  }
  return current;
};

const combineObservations = (observations: BrowserObservation[]): BrowserObservation => {
  const last = observations.at(-1) || { title: '', url: '', visibleText: '' };
  const links = observations.flatMap((observation) => observation.links || []);
  const responses = observations.flatMap((observation) => observation.networkResponses || []);
  return {
    ...last,
    visibleText: observations.map((observation, index) => (
      `【搜索结果第 ${observation.currentPage || index + 1} 页】\n${observation.visibleText}`
    )).join('\n\n').slice(0, 240_000),
    links: links.filter((link, index, all) => (
      index === all.findIndex((item) => `${item.href}|${item.text}` === `${link.href}|${link.text}`)
    )),
    networkResponses: responses,
  };
};

const exposeVisibleChallenge = async ({
  browser,
  task,
  observation,
  config,
  planner,
}: {
  browser: BrowserSession;
  task: LocalHelperTask;
  observation: BrowserObservation;
  config?: LocalLLMConfig | null;
  planner: BrowserActionPlanner;
}): Promise<YulongBrowserAgentResult> => {
  if (hasVisibleChallenge(observation)) {
    return {
      status: 'request_human',
      observation,
      humanReason: '人机验证页面已打开，请完成验证后点击“继续采集”；系统会恢复“裕龙石化”搜索。',
      searchCompleted: false,
      collectedPages: 0,
    };
  }
  if (!browser.act) {
    return {
      status: 'request_human',
      observation,
      humanReason: '检测到站点安全挑战，但当前浏览器不支持自动打开验证页面。',
      searchCompleted: false,
      collectedPages: 0,
    };
  }

  const tryClick = async (current: BrowserObservation) => {
    const planned = await planner({
      goal: 'expose_human_challenge',
      task,
      observation: current,
      config,
    }).catch(() => null);
    const action: BrowserAction = planned || { type: 'click_first_notice' };
    const plannedResult = await browser.act?.(action);
    const plannedObservation = plannedResult?.observation || current;
    const plannedReachedDetail = decodeURIComponent(plannedObservation.url || '').includes('/bulletinDetail');
    if (hasVisibleChallenge(plannedObservation) || plannedReachedDetail || action.type === 'click_first_notice') {
      return plannedResult;
    }
    // LLM choices are grounded to observed IDs, but reactive pages may rerender
    // or the chosen control may not navigate. Retry with the site-specific title
    // selector before asking an employee to intervene.
    return browser.act?.({ type: 'click_first_notice' });
  };

  let clicked = await tryClick(observation);
  let current = clicked?.observation || observation;
  let detailOpened = decodeURIComponent(current.url || '').includes('/bulletinDetail');
  if (!hasVisibleChallenge(current) && !detailOpened) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      current = (await browser.act({ type: 'wait', milliseconds: 900 })).observation;
      if (hasVisibleChallenge(current)) break;
      clicked = await tryClick(current);
      current = clicked?.observation || current;
      detailOpened = decodeURIComponent(current.url || '').includes('/bulletinDetail');
      if (hasVisibleChallenge(current) || detailOpened) break;
    }
  }
  if (clicked?.performed && (hasVisibleChallenge(current) || detailOpened)) {
    return {
      status: 'request_human',
      observation: current,
      humanReason: '验证页面已打开，请只完成人机验证；完成后点击“继续采集”，系统会恢复“裕龙石化”搜索。',
      searchCompleted: false,
      collectedPages: 0,
    };
  }
  return {
    status: 'request_human',
    observation: current,
    humanReason: '检测到安全挑战，但暂未找到可自动点击的公告。请保留窗口，稍后重试。',
    searchCompleted: false,
    collectedPages: 0,
  };
};

const collectPages = async (
  browser: BrowserSession,
  first: BrowserObservation,
  maxPages: number,
): Promise<YulongBrowserAgentResult> => {
  const observations = [first];
  let current = first;
  const requestedPages = Math.min(maxPages, Math.max(1, first.totalPages || maxPages));
  while (observations.length < requestedPages && browser.act) {
    const next = await browser.act({ type: 'next_page' });
    if (!next.performed) break;
    current = next.observation;
    if (hasVisibleChallenge(current) || (hasNetworkChallenge(current) && !isScopedYulongSearch(current))) {
      return {
        status: 'request_human',
        observation: combineObservations([...observations, current]),
        humanReason: `采集到第 ${observations.length} 页后再次出现人机验证，请完成验证后继续。`,
        searchCompleted: false,
        collectedPages: observations.length,
      };
    }
    const previousPage = observations.at(-1)?.currentPage || observations.length;
    const currentPage = current.currentPage || previousPage + 1;
    if (!isScopedYulongSearch(current)) {
      if (currentPage > previousPage) {
        return {
          status: 'request_human',
          observation: combineObservations([...observations, current]),
          humanReason: `第 ${currentPage} 页正在等待站点验证，请完成验证后点击“继续采集”。`,
          searchCompleted: false,
          collectedPages: observations.length,
        };
      }
      break;
    }
    if (currentPage <= previousPage) break;
    observations.push(current);
  }
  return {
    status: 'ready',
    observation: combineObservations(observations),
    humanReason: '',
    searchCompleted: true,
    collectedPages: observations.length,
  };
};

export const runYulongBrowserAgent = async ({
  browser,
  task,
  resume,
  config = null,
  planner = planBrowserActionWithLLM,
  maxPages = 1,
}: {
  browser: BrowserSession;
  task: LocalHelperTask;
  resume: boolean;
  config?: LocalLLMConfig | null;
  planner?: BrowserActionPlanner;
  maxPages?: number;
}): Promise<YulongBrowserAgentResult> => {
  let observation: BrowserObservation;
  observation = resume ? await browser.observe() : await browser.open(task.entryUrl);

  if (resume) {
    observation = await waitForSearchResult(browser, observation);
    const onDetailPage = decodeURIComponent(observation.url || '').includes('/bulletinDetail');
    if (onDetailPage && !hasVisibleChallenge(observation) && browser.act) {
      observation = (await browser.act({ type: 'back' })).observation;
      observation = await waitForSearchResult(browser, observation);
    }
  }

  if (hasVisibleChallenge(observation)) {
    return exposeVisibleChallenge({ browser, task, observation, config, planner });
  }
  if (isScopedYulongSearch(observation)) {
    return collectPages(browser, observation, maxPages);
  }
  if (!isScopedYulongSearch(observation) && browser.act) {
    const searched = await browser.act({ type: 'search', query: YULONG_QUERY });
    observation = await waitForSearchResult(browser, searched.observation);
    if (hasVisibleChallenge(observation)) {
      return exposeVisibleChallenge({ browser, task, observation, config, planner });
    }
    if (isScopedYulongSearch(observation)) {
      return collectPages(browser, observation, maxPages);
    }
    if (hasNetworkChallenge(observation)) {
      return exposeVisibleChallenge({ browser, task, observation, config, planner });
    }
  }
  if (hasNetworkChallenge(observation)) {
    return exposeVisibleChallenge({ browser, task, observation, config, planner });
  }
  if (!isScopedYulongSearch(observation)) {
    return {
      status: 'scope_failed',
      observation,
      humanReason: '没有确认到“裕龙石化”搜索结果，系统拒绝把平台主页公告当成裕龙结果。',
      searchCompleted: false,
      collectedPages: 0,
    };
  }
  return collectPages(browser, observation, maxPages);
};
