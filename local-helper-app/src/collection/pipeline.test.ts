import assert from 'node:assert/strict';
import test from 'node:test';

import type { BrowserSession } from '../browser/types.ts';
import { runCollection } from './pipeline.ts';

const idleBrowser: BrowserSession = {
  engine: 'test',
  open: async () => ({ title: '', url: '', visibleText: '' }),
  observe: async () => ({ title: '', url: '', visibleText: '' }),
};

test('collection run completes authoritative public feeds through one path', async () => {
  const result = await runCollection({
    task: { id: 'task-1', sourceName: '国能E购', entryUrl: '', searchTerms: '阻聚剂' },
    browser: idleBrowser,
    publicFeedCollector: async () => ({
      provider: 'test-feed',
      status: 'success',
      warnings: [],
      artifacts: [],
      candidateBundle: {
        source_name: '国能E购',
        candidates: [{
          title: '循环水阻聚剂采购公告',
          url: 'https://example.com/1',
          published_at: '2026-07-14',
          deadline_at: '',
          buyer_name: '测试公司',
          raw_text: '采购阻聚剂',
          attachments: [],
        }],
      },
    }),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.notEqual(result.screenedNotices?.[0]?.recommendedAction, 'ignore');
});

test('collection run returns a real no-new conclusion from an authoritative feed', async () => {
  const result = await runCollection({
    task: { id: 'task-2', sourceName: '易派克', entryUrl: '' },
    browser: idleBrowser,
    publicFeedCollector: async () => ({
      provider: 'test-feed', status: 'no_new', warnings: [], artifacts: [], candidateBundle: null,
    }),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle, null);
  assert.match(result.resultSummary, /没有新公告/);
});

test('Yulong run triggers the scoped search so employees see the real search challenge', async () => {
  let screenshots = 0;
  const actions: Array<Record<string, unknown>> = [];
  const browser = {
    engine: 'test',
    open: async () => ({
      title: '全国招标公告公示搜索引擎',
      url: 'https://ctbpsp.com/#/bulletinList',
      visibleText: '加载中...',
      interactiveElements: [{ id: 'notice-1', role: 'link', text: '测试采购招标公告' }],
      networkResponses: [{
        url: 'https://ctbpsp.com/cutominfoapi/searchkeyword',
        status: 200,
        contentType: 'text/html',
        responseHeaders: { 'punish-type': 'sigchl' },
        challenge: true,
      }],
    }),
    observe: async () => ({ title: '', url: '', visibleText: '' }),
    act: async (action: Record<string, unknown>) => {
      actions.push(action);
      return {
        performed: true,
        observation: {
          title: '安全验证',
          url: 'https://ctbpsp.com/#/bulletinDetail?uuid=test',
          visibleText: '请完成滑块安全验证',
          networkResponses: [],
        },
      };
    },
    screenshot: async () => { screenshots += 1; return '/tmp/challenge.png'; },
  } as BrowserSession;
  const result = await runCollection({
    task: { id: 'task-yulong', sourceName: '裕龙招投标网', entryUrl: 'https://ctbpsp.com/' },
    browser,
    browserActionPlanner: async () => ({ type: 'click', elementId: 'notice-1' }),
  });
  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /验证页面已打开/);
  assert.deepEqual(actions, [{ type: 'search', query: '裕龙石化' }]);
  assert.equal(screenshots, 1);
});

test('Yulong falls back to a deterministic notice click when the LLM click does not navigate', async () => {
  const actions: Array<Record<string, unknown>> = [];
  const blockedList = {
    title: '全国招标公告公示搜索引擎',
    url: 'https://ctbpsp.com/#/bulletinList',
    visibleText: '测试采购招标公告',
    interactiveElements: [{ id: 'wrong-control', role: 'link', text: '筛选' }],
    networkResponses: [{
      url: 'https://ctbpsp.com/cutominfoapi/searchkeyword',
      status: 200,
      contentType: 'text/html',
      responseHeaders: { 'punish-type': 'sigchl' },
      challenge: true,
    }],
  };
  const browser = {
    engine: 'test',
    open: async () => blockedList,
    observe: async () => blockedList,
    act: async (action: Record<string, unknown>) => {
      actions.push(action);
      if (action.type === 'search' || action.type === 'click' || action.type === 'wait') {
        return { performed: true, observation: blockedList };
      }
      return {
        performed: true,
        observation: {
          title: '安全验证',
          url: 'https://ctbpsp.com/#/bulletinDetail?uuid=fallback',
          visibleText: '请完成滑块安全验证',
          networkResponses: [],
        },
      };
    },
    screenshot: async () => '/tmp/challenge.png',
  } as BrowserSession;

  const result = await runCollection({
    task: { id: 'task-yulong-fallback', sourceName: '裕龙招投标网', entryUrl: blockedList.url },
    browser,
    browserActionPlanner: async () => ({ type: 'click', elementId: 'wrong-control' }),
  });

  assert.equal(result.status, 'request_human');
  assert.equal(result.observation?.url, 'https://ctbpsp.com/#/bulletinDetail?uuid=fallback');
  assert.equal(actions[0]?.type, 'search');
  assert.ok(actions.some((action) => action.type === 'click'));
  assert.equal(actions.at(-1)?.type, 'click_first_notice');
});

test('Yulong daily collection consumes the verified latest page without opening broken history pagination', async () => {
  const actions: Array<Record<string, unknown>> = [];
  const searchPage = (page: number, title: string) => ({
    title: '全国招标公告公示搜索引擎',
    url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    visibleText: `${title}\n2026-07-15`,
    searchQuery: '裕龙石化',
    currentPage: page,
    totalPages: 2,
    networkResponses: [{
      url: `https://ctbpsp.com/cutominfoapi/searchkeyword?keyword=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96&CurrentPage=${page}`,
      status: 200,
      contentType: 'application/json',
      bodySnippet: JSON.stringify({ dataList: [{
        noticeName: title,
        noticeSendTime: '2026-07-15',
        buyerName: '山东裕龙石化有限公司',
        url: `https://ctbpsp.com/#/bulletinDetail?uuid=yulong-${page}`,
      }] }),
      challenge: false,
    }],
  });
  const browser = {
    engine: 'test',
    open: async () => ({ title: '', url: '', visibleText: '' }),
    observe: async () => searchPage(1, '裕龙石化阻聚剂采购招标公告'),
    act: async (action: Record<string, unknown>) => {
      actions.push(action);
      return { performed: true, observation: searchPage(2, '裕龙石化二甲基硅油采购公告') };
    },
  } as BrowserSession;

  const result = await runCollection({
    task: {
      id: 'task-yulong-resume',
      sourceName: '裕龙招投标网',
      entryUrl: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
      searchTerms: '阻聚剂,二甲基硅油',
    },
    browser,
    resume: true,
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.candidateBundle?.candidates.map((candidate) => candidate.title), [
    '裕龙石化阻聚剂采购招标公告',
  ]);
  assert.equal(actions.some((action) => (
    action.type === 'navigate' && String(action.url || '').includes('/bulletinList')
  )), false);
  assert.equal(actions.some((action) => action.type === 'next_page'), false);
  assert.ok(result.candidateBundle?.candidates.every((candidate) => candidate.url.includes('bulletinDetail')));
});

test('Yulong resume waits for the verified search response in the current page without navigating', async () => {
  const actions: Array<Record<string, unknown>> = [];
  const loading = {
    title: '全国招标公告公示搜索引擎',
    url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    visibleText: '加载中...',
    searchQuery: '裕龙石化',
    currentPage: 1,
    totalPages: 1,
    noticeType: 0,
    networkResponses: [],
  };
  const ready = {
    ...loading,
    visibleText: '裕龙石化阻聚剂采购招标公告',
    networkResponses: [{
      url: 'hcz://browser-state/yulong?page=1',
      status: 200,
      contentType: 'application/json',
      bodySnippet: JSON.stringify({ dataList: [{
        noticeName: '裕龙石化阻聚剂采购招标公告',
        bulletinTypeName: '招标公告',
        url: 'https://ctbpsp.com/#/bulletinDetail?uuid=ready-1',
      }] }),
      challenge: false,
    }],
  };
  const browser = {
    engine: 'test',
    open: async () => loading,
    observe: async () => loading,
    act: async (action: Record<string, unknown>) => {
      actions.push(action);
      return { performed: true, observation: action.type === 'wait' ? ready : loading };
    },
  } as BrowserSession;

  const result = await runCollection({
    task: {
      id: 'task-yulong-resume-loading',
      sourceName: '裕龙招投标网',
      entryUrl: loading.url,
      searchTerms: '阻聚剂',
    },
    browser,
    resume: true,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle?.candidates[0]?.title, '裕龙石化阻聚剂采购招标公告');
  assert.equal(actions.some((action) => (
    action.type === 'navigate' && String(action.url || '').includes('/bulletinList')
  )), false);
  assert.equal(actions[0]?.type, 'wait');
});

test('Yulong resumes a task stuck after page-two verification from its saved latest-page candidates', async () => {
  const detailUrl = 'https://ctbpsp.com/#/bulletinDetail?uuid=saved-page-1';
  const savedCandidate = {
    title: '裕龙石化磷酸三甲酯采购招标公告',
    url: detailUrl,
    published_at: '2026-07-13',
    deadline_at: '',
    buyer_name: '山东裕龙石化有限公司',
    raw_text: '磷酸三甲酯采购',
    attachments: [],
  };
  const stuckList = {
    title: '全国招标公告公示搜索引擎',
    url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    visibleText: '加载中...',
    searchQuery: '裕龙石化',
    currentPage: 2,
    totalPages: 140,
    noticeType: 0,
    humanChallengeVisible: true,
    networkResponses: [{
      url: 'https://ctbpsp.com/cutominfoapi/searchkeyword?CurrentPage=2&bulletinType=0',
      status: 200,
      contentType: 'application/json',
      bodySnippet: 'encrypted upstream error',
      challenge: false,
    }],
  };
  const detail = {
    title: savedCandidate.title,
    url: detailUrl,
    visibleText: '公告详情',
    humanChallengeVisible: false,
    networkResponses: [],
  };
  const actions: Array<Record<string, unknown>> = [];
  const browser = {
    engine: 'test',
    open: async () => stuckList,
    observe: async () => stuckList,
    act: async (action: Record<string, unknown>) => {
      actions.push(action);
      if (action.type === 'read_document') return {
        performed: true,
        observation: {
          ...detail,
          document: {
            title: savedCandidate.title,
            noticeType: '招标公告',
            buyerName: '山东裕龙石化有限公司',
            text: '磷酸三甲酯采购数量 100 吨。',
            attachmentUrls: [],
          },
        },
      };
      return { performed: true, observation: detail };
    },
  } as BrowserSession;

  const result = await runCollection({
    task: {
      id: 'task-yulong-resume-stuck-page-2',
      sourceName: '裕龙招投标网',
      entryUrl: stuckList.url,
      searchTerms: '磷酸三甲酯',
      lastCandidateBundle: {
        source_name: '裕龙招投标网',
        candidates: [savedCandidate],
      },
    },
    browser,
    resume: true,
    terms: [{ term: '磷酸三甲酯', weight: 10 }],
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(actions.map((action) => action.type), ['navigate', 'read_document']);
  assert.match(result.candidateBundle?.candidates[0]?.raw_text || '', /采购数量 100 吨/);
});

test('Yulong ignores background captcha SDK traffic after scoped search results have loaded', async () => {
  const actions: string[] = [];
  const detail = {
    title: '裕龙石化阻聚剂采购招标公告',
    url: 'https://ctbpsp.com/#/bulletinDetail?uuid=yulong-1',
    visibleText: '公告详情',
    networkResponses: [],
  };
  const browser = {
    engine: 'test',
    open: async () => ({
      title: '全国招标公告公示搜索引擎',
      url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
      visibleText: '裕龙石化阻聚剂采购招标公告',
      searchQuery: '裕龙石化',
      currentPage: 1,
      totalPages: 1,
      networkResponses: [{
        url: 'https://c.dun.163.com/api/v2/getconf',
        status: 200,
        contentType: 'application/javascript',
        bodySnippet: 'captcha SDK configuration',
        challenge: true,
      }, {
        url: 'https://ctbpsp.com/cutominfoapi/searchkeyword?keyword=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
        status: 200,
        contentType: 'text/html',
        responseHeaders: { 'punish-type': 'sigchl' },
        bodySnippet: '<!doctype html><title>sigchl</title>',
        challenge: true,
      }, {
        url: 'hcz://browser-state/yulong?page=1',
        status: 200,
        contentType: 'application/json',
        bodySnippet: JSON.stringify({ dataList: [{
          noticeName: '山东<em>裕龙石化</em>阻聚剂采购招标公告',
          noticeSendTime: '2026-07-15',
          buyerName: '山东裕龙石化有限公司',
          url: 'https://ctbpsp.com/#/bulletinDetail?uuid=yulong-1',
        }] }),
        challenge: false,
      }],
    }),
    observe: async () => ({ title: '', url: '', visibleText: '' }),
    act: async (action: Record<string, unknown>) => {
      actions.push(String(action.type));
      if (action.type === 'read_document') {
        return {
          performed: true,
          observation: {
            ...detail,
            document: {
              title: detail.title,
              noticeType: '招标公告',
              text: '采购阻聚剂',
              attachmentUrls: [],
            },
          },
        };
      }
      return { performed: true, observation: detail };
    },
  } as BrowserSession;

  const result = await runCollection({
    task: {
      id: 'task-yulong-background-sdk',
      sourceName: '裕龙招投标网',
      entryUrl: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
      searchTerms: '阻聚剂',
    },
    browser,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle?.candidates[0]?.title, '山东裕龙石化阻聚剂采购招标公告');
  assert.deepEqual(actions, ['navigate', 'read_document']);
});

test('collection run merges LLM page extraction with deterministic extraction', async () => {
  const steps: string[] = [];
  const browser: BrowserSession = {
    engine: 'test',
    open: async () => ({
      title: '裕龙采购平台',
      url: 'https://example.com/list',
      visibleText: '裕龙石化最新采购信息',
      links: [{ text: '采购详情', href: 'https://example.com/detail/1' }],
    }),
    observe: async () => ({ title: '', url: '', visibleText: '' }),
  };
  const result = await runCollection({
    task: { id: 'task-llm', sourceName: '测试站点', entryUrl: 'https://example.com/list', searchTerms: '硅油' },
    browser,
    llmCandidateExtractor: async () => ({
      source_name: '测试站点',
      candidates: [{
        title: '裕龙石化二甲基硅油采购招标公告',
        url: 'https://example.com/detail/1',
        published_at: '2026-07-14',
        deadline_at: '',
        buyer_name: '裕龙石化',
        raw_text: '二甲基硅油采购',
        attachments: [],
      }],
    }),
    recordStep: (step) => { steps.push(step.action); },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.candidateBundle?.candidates[0]?.title, '裕龙石化二甲基硅油采购招标公告');
  assert.ok(steps.includes('extract_candidates'));
});

test('configured browser journey searches and deep-reads a China Petroleum notice', async () => {
  const entryUrl = 'https://www.cnpcbidding.com/#/tenders';
  const list = {
    title: '中国石油招标投标网', url: entryUrl,
    visibleText: '吉林石化丁二烯阻聚剂采购公开招标公告 2026-07-15',
    searchQuery: '阻聚剂',
    listItems: [{
      title: '吉林石化丁二烯阻聚剂采购公开招标公告',
      elementId: 'hcz-12', publishedAt: '2026-07-15', noticeType: '招标公告',
    }],
  };
  const detailText = '招标条件：采购丁二烯阻聚剂20吨。接受代理商投标，投标截止时间2026-07-30。';
  const detail = { title: '吉林石化丁二烯阻聚剂采购公开招标公告', url: entryUrl, visibleText: detailText };
  const actions: string[] = [];
  const browser = {
    engine: 'test',
    open: async () => ({ title: '中国石油招标投标网', url: entryUrl, visibleText: '招标公告搜索' }),
    observe: async () => list,
    act: async (action: Record<string, any>) => {
      actions.push(action.type);
      if (action.type === 'search') return { performed: true, observation: list };
      if (action.type === 'click') return { performed: true, observation: detail };
      if (action.type === 'read_document') return {
        performed: true,
        observation: { ...detail, document: { title: detail.title, text: detailText, pageCount: 1 } },
      };
      return { performed: true, observation: detail };
    },
  } as BrowserSession;

  const result = await runCollection({
    task: {
      id: 'task-cnpc-journey', sourceName: '中国石油招标投标网', entryUrl,
      searchTerms: '阻聚剂',
    },
    browser,
    terms: [{ term: '阻聚剂', weight: 90 }],
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(actions, ['search', 'search', 'click', 'read_document']);
  assert.match(result.candidateBundle?.candidates[0]?.raw_text || '', /接受代理商/);
  assert.ok(result.screenedNotices?.[0]?.deepReadAt);
});

test('Yulong opens only a relevant tender detail and feeds PDF text into final screening', async () => {
  const actions: Array<Record<string, unknown>> = [];
  const list = {
    title: '全国招标公告公示搜索引擎',
    url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    visibleText: '裕龙石化阻聚剂采购招标公告',
    searchQuery: '裕龙石化',
    currentPage: 1,
    totalPages: 1,
    noticeType: 0,
    noticeTypes: ['招标公告'],
    networkResponses: [{
      url: 'hcz://browser-state/yulong?page=1',
      status: 200,
      contentType: 'application/json',
      bodySnippet: JSON.stringify({ dataList: [{
        noticeName: '裕龙石化阻聚剂采购招标公告',
        noticeSendTime: '2026-07-15',
        bulletinTypeName: '招标公告',
        buyerName: '山东裕龙石化有限公司',
        url: 'https://ctbpsp.com/#/bulletinDetail?uuid=detail-1',
      }] }),
      challenge: false,
    }],
  };
  const detail = {
    title: '裕龙石化阻聚剂采购招标公告',
    url: 'https://ctbpsp.com/#/bulletinDetail?uuid=detail-1',
    visibleText: '公告详情',
    networkResponses: [],
  };
  const browser = {
    engine: 'test',
    open: async () => list,
    observe: async () => list,
    act: async (action: Record<string, unknown>) => {
      actions.push(action);
      if (action.type === 'navigate') return { performed: true, observation: detail };
      if (action.type === 'read_document') {
        return {
          performed: true,
          observation: {
            ...detail,
            document: {
              title: detail.title,
              noticeType: '招标公告',
              buyerName: '山东裕龙石化有限公司',
              pdfUrl: 'https://ctbpsp.com/files/detail-1.pdf',
              attachmentUrls: ['https://ctbpsp.com/files/spec.docx'],
              text: '采购阻聚剂 20 吨，接受代理商投标，投标截止时间 2026-07-20。',
              pageCount: 2,
            },
          },
        };
      }
      return { performed: true, observation: detail };
    },
  } as BrowserSession;

  const result = await runCollection({
    task: {
      id: 'task-yulong-detail',
      sourceName: '裕龙招投标网',
      entryUrl: list.url,
      searchTerms: '阻聚剂',
    },
    browser,
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(actions.map((action) => action.type), ['navigate', 'read_document']);
  assert.match(result.candidateBundle?.candidates[0]?.raw_text || '', /采购阻聚剂 20 吨/);
  assert.deepEqual(result.candidateBundle?.candidates[0]?.attachments, [
    'https://ctbpsp.com/files/detail-1.pdf',
    'https://ctbpsp.com/files/spec.docx',
  ]);
  assert.match(result.screenedNotices?.[0]?.hardRequirements.join('\n') || '', /接受代理商投标/);
});

test('Yulong uses an OCR screenshot when the detail PDF URL resolves to the site homepage', async () => {
  const detailUrl = 'https://ctbpsp.com/#/bulletinDetail?uuid=ocr-shot';
  const list = {
    title: '搜索结果',
    url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    visibleText: '裕龙石化磷酸三甲酯采购招标公告',
    searchQuery: '裕龙石化', currentPage: 1, totalPages: 1, noticeType: 0,
    noticeTypes: ['招标公告'],
    networkResponses: [{
      url: 'hcz://browser-state/yulong?page=1', status: 200, contentType: 'application/json', challenge: false,
      bodySnippet: JSON.stringify({ dataList: [{
        noticeName: '裕龙石化磷酸三甲酯采购招标公告',
        bulletinTypeName: '招标公告',
        url: detailUrl,
      }] }),
    }],
  };
  const detail = {
    title: '裕龙石化磷酸三甲酯采购招标公告',
    url: detailUrl,
    visibleText: '公告详情',
    humanChallengeVisible: false,
    networkResponses: [],
    document: {
      title: '裕龙石化磷酸三甲酯采购招标公告',
      noticeType: '招标公告',
      pdfUrl: 'https://ctbpsp.com/',
      attachmentUrls: [],
      text: '',
    },
  };
  let screenshots = 0;
  const steps: Array<{ action: string; tool?: string }> = [];
  const browser = {
    engine: 'test',
    open: async () => list,
    observe: async () => list,
    act: async (action: Record<string, unknown>) => ({
      performed: true,
      observation: action.type === 'navigate' ? detail : detail,
    }),
    screenshot: async () => {
      screenshots += 1;
      return '/tmp/yulong-detail.png';
    },
  } as BrowserSession;

  const result = await runCollection({
    task: {
      id: 'task-yulong-ocr-shot', sourceName: '裕龙招投标网', entryUrl: list.url,
      searchTerms: '磷酸三甲酯',
    },
    browser,
    terms: [{ term: '磷酸三甲酯', weight: 10 }],
    ocrConfig: { enabled: true, provider: 'baidu', baiduApiKey: 'a', baiduSecretKey: 'b' },
    documentReader: async ({ observation }) => observation.downloadedFiles?.length
      ? [{
        title: '详情页截图', filePath: observation.downloadedFiles[0], contentType: 'image/png',
        text: '磷酸三甲酯采购100吨，投标截止时间2026年7月25日。', ocrProvider: 'baidu',
      }]
      : [{
        title: '错误首页', url: 'https://ctbpsp.com/', contentType: 'text/html', text: '',
        warning: '该链接返回的是站点页面，不是可识别的公告文档。',
      }],
    recordStep: (step) => { steps.push({ action: step.action, tool: step.tool }); },
  });

  assert.equal(result.status, 'completed');
  assert.equal(screenshots, 1);
  assert.match(result.candidateBundle?.candidates[0]?.raw_text || '', /投标截止时间2026年7月25日/);
  assert.equal(result.candidateBundle?.candidates[0]?.attachments.includes('https://ctbpsp.com/'), false);
  assert.equal(steps.find((step) => step.action === 'read_yulong_tender_detail')?.tool, 'test+ocr');
});

test('Yulong preserves list candidates when detail validation is required and resumes in place', async () => {
  let verified = false;
  const detailUrl = 'https://ctbpsp.com/#/bulletinDetail?uuid=detail-resume';
  const list = {
    title: '搜索结果',
    url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    visibleText: '裕龙石化二甲基硅油采购招标公告',
    searchQuery: '裕龙石化', currentPage: 1, totalPages: 1, noticeType: 0,
    noticeTypes: ['招标公告'],
    networkResponses: [{
      url: 'hcz://browser-state/yulong?page=1', status: 200, contentType: 'application/json', challenge: false,
      bodySnippet: JSON.stringify({ dataList: [{
        noticeName: '裕龙石化二甲基硅油采购招标公告',
        bulletinTypeName: '招标公告',
        url: detailUrl,
      }] }),
    }],
  };
  const challenge = {
    title: '安全验证', url: detailUrl, visibleText: '请绘制图中轨迹完成验证',
    humanChallengeVisible: true, networkResponses: [],
  };
  const readyDetail = {
    title: '裕龙石化二甲基硅油采购招标公告', url: detailUrl,
    visibleText: '公告详情', humanChallengeVisible: false, networkResponses: [],
  };
  const actions: string[] = [];
  const browser = {
    engine: 'test',
    open: async () => list,
    observe: async () => verified ? readyDetail : challenge,
    act: async (action: Record<string, unknown>) => {
      actions.push(String(action.type));
      if (action.type === 'navigate') return { performed: true, observation: challenge };
      if (action.type === 'read_document') {
        return {
          performed: true,
          observation: {
            ...readyDetail,
            document: {
              title: readyDetail.title,
              noticeType: '招标公告',
              pdfUrl: 'https://ctbpsp.com/files/resume.pdf',
              attachmentUrls: [],
              text: '二甲基硅油采购数量 5 吨。',
            },
          },
        };
      }
      return { performed: true, observation: readyDetail };
    },
    screenshot: async () => '/tmp/detail-challenge.png',
  } as BrowserSession;

  const first = await runCollection({
    task: { id: 'task-yulong-detail-resume', sourceName: '裕龙招投标网', entryUrl: list.url },
    browser,
  });
  assert.equal(first.status, 'request_human');
  assert.equal(first.candidateBundle?.candidates.length, 1);
  assert.equal(first.observation?.screenshotPath, '/tmp/detail-challenge.png');

  verified = true;
  actions.length = 0;
  const resumed = await runCollection({
    task: {
      id: 'task-yulong-detail-resume', sourceName: '裕龙招投标网', entryUrl: list.url,
      lastCandidateBundle: first.candidateBundle,
      lastScreenedNotices: first.screenedNotices,
    },
    browser,
    resume: true,
  });

  assert.equal(resumed.status, 'completed');
  assert.deepEqual(actions, ['read_document']);
  assert.match(resumed.candidateBundle?.candidates[0]?.raw_text || '', /采购数量 5 吨/);
});
