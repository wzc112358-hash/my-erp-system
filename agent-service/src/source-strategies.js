import { classifySourceForPhase3 } from './source-classification.js';

export const CRAWL_STRATEGIES = {
  HTTP_HTML: 'http_html',
  HTTP_JSON: 'http_json',
  PLAYWRIGHT_DOM: 'playwright_dom',
  PLAYWRIGHT_NETWORK: 'playwright_network',
  MANUAL_ASSIST: 'manual_assist',
  LOCAL_HELPER: 'local_helper',
};

export const SITE_SEARCH_BEHAVIORS = {
  NONE: 'none',
  SUPPLEMENTAL: 'supplemental',
  PRIMARY: 'primary',
};

export const SOURCE_STRATEGIES = {
  中石油招投标网: {
    categoryNames: ['招标公告', '谈判采购公告', '询价(竞价)采购公告'],
    crawlStrategy: CRAWL_STRATEGIES.LOCAL_HELPER,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: 'JS 单页应用，公共接口指向内网、/cms 与 /api 不可用，需在员工本地浏览器登录后采集。',
  },
  云梦泽询价网: {
    categoryNames: ['招标采购', '非招标采购', '谈判采购', '询比采购'],
    crawlStrategy: CRAWL_STRATEGIES.MANUAL_ASSIST,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '需要账号登录，买标书和详情材料由员工协助获取。',
  },
  华锦兵器网: {
    categoryNames: ['招标采购', '询价交易'],
    crawlStrategy: CRAWL_STRATEGIES.LOCAL_HELPER,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '公开列表优先自动发现；登录详情和附件由人工协助。',
  },
  易派克: {
    categoryNames: ['公开公告', '询价公告', '竞价公告'],
    categoryUrls: ['https://ec.sinopec.com/supp/index.shtml'],
    crawlStrategy: CRAWL_STRATEGIES.HTTP_HTML,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '首页公告列表云端 http_html 直采；账号内容、8位码和材料详情需要人工协助确认。',
  },
  延长石油: {
    categoryNames: ['采购公告', '竞价公告', '招标公告'],
    categoryUrls: ['https://zc.sxycpc.com/ebidPortal/menu0002.html', 'http://bulletin.sntba.com/'],
    crawlStrategy: CRAWL_STRATEGIES.PLAYWRIGHT_DOM,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '列表由 tenderA.js 异步加载，静态抓取无公告行，需 JS 渲染；失败时保留错误证据并转本地助手。',
  },
  中化: {
    categoryNames: ['招标公告', '采购公告', '竞价公告'],
    crawlStrategy: CRAWL_STRATEGIES.LOCAL_HELPER,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: 'Vue 单页应用，公开网关公告接口直连 404，需登录上下文，转员工本地浏览器采集。',
  },
  国能网: {
    categoryNames: ['国能E招-招标公告', '国能E招-非招标公告', '国能E购-询价采购公告', '国能E购-竞价公告', '国能E购-竞争性谈判公告'],
    categoryUrls: [
      'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html',
      'https://www.chnenergybidding.com.cn/bidweb/001/001003/moreinfo.html',
      'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireOne/index.json',
      'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireBidding/index.json',
    ],
    crawlStrategy: CRAWL_STRATEGIES.HTTP_HTML,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '',
  },
  中海油: {
    categoryNames: ['招标公告', '非招标公告'],
    crawlStrategy: CRAWL_STRATEGIES.LOCAL_HELPER,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: 'JS 单页应用，公告接口返回维护占位页、无公开 JSON，需员工本地浏览器采集。',
  },
  国能E招: {
    categoryNames: ['招标公告', '非招标公告'],
    categoryUrls: ['https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html'],
    crawlStrategy: CRAWL_STRATEGIES.HTTP_HTML,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '',
  },
  国能E购: {
    categoryNames: ['询价采购公告', '竞价公告', '竞争性谈判公告'],
    categoryUrls: [
      'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireOne/index.json',
      'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireBidding/index.json',
      'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireSix/index.json',
    ],
    crawlStrategy: CRAWL_STRATEGIES.HTTP_JSON,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '',
  },
  裕龙招投标网: {
    categoryNames: ['中国招标投标公共服务平台-裕龙石化搜索'],
    categoryUrls: ['https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96'],
    crawlStrategy: CRAWL_STRATEGIES.PLAYWRIGHT_NETWORK,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.PRIMARY,
    manualAssistReason: '中国招标投标公共服务平台搜索链路可能出现网易安全验证，云端失败后转本地助手。',
  },
  东华能源网: {
    categoryNames: ['待确认'],
    crawlStrategy: CRAWL_STRATEGIES.MANUAL_ASSIST,
    siteSearchBehavior: SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '资料中未提供具体入口，执行前需要人工确认。',
  },
};

export const resolveSourceStrategy = (source) => {
  const configured = SOURCE_STRATEGIES[source.source_name] || {};
  const phase3 = classifySourceForPhase3(source);
  const requiresManual = source.status === 'manual_required' ||
    source.requires_login ||
    source.may_have_captcha ||
    source.login_type === 'account';
  const crawlStrategy = source.crawl_strategy ||
    phase3.recommendedCrawlStrategy ||
    configured.crawlStrategy ||
    (requiresManual ? CRAWL_STRATEGIES.MANUAL_ASSIST : CRAWL_STRATEGIES.HTTP_HTML);

  return {
    categoryNames: String(source.category_names || configured.categoryNames?.join(',') || '')
      .split(/[,，\n]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    categoryUrls: String(source.category_urls || configured.categoryUrls?.join(',') || source.source_url || '')
      .split(/[,，\n]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    crawlStrategy,
    collectionPath: phase3.collectionPath,
    fallbackPath: phase3.fallbackPath,
    firstTool: phase3.firstTool,
    tools: phase3.tools,
    siteSearchBehavior: source.site_search_behavior || configured.siteSearchBehavior || SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: source.manual_assist_reason || configured.manualAssistReason || phase3.reason || '',
    requiresManualAssist: crawlStrategy === CRAWL_STRATEGIES.MANUAL_ASSIST ||
      crawlStrategy === CRAWL_STRATEGIES.LOCAL_HELPER ||
      requiresManual,
  };
};
