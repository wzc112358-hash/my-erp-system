export const CLOUD_COLLECTION_PATHS = [
  'cloud_auto',
  'cloud_then_local',
  'local_helper',
  'manual_only',
];

export const phase3SourceMatrix = {
  中石油招投标网: {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '2026-06-02 实测：站点为 JS 单页应用，公共接口 baseUrl 指向内网 10.134.x，/cms 与 /api 返回 404/空响应，云端无法直采，转本地助手。',
  },
  云梦泽询价网: {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '资料明确需要账号密码登录，买标书和详情材料由员工本地协助获取。',
  },
  '能源一号（兰州恒化成）': {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '涉及公司账号和地区账号，优先走员工本地登录态。',
  },
  '能源一号（北京恒化成）': {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '涉及公司账号和地区账号，优先走员工本地登录态。',
  },
  '能源一号（天津宜远）': {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '涉及公司账号和地区账号，优先走员工本地登录态。',
  },
  华锦兵器网: {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '有账号和手机号；服务器访问出现空响应，优先使用员工本地浏览器环境。',
  },
  易派克: {
    collectionPath: 'cloud_then_local',
    recommendedCrawlStrategy: 'http_html',
    fallbackPath: 'local_helper',
    firstTool: 'http_html',
    tools: ['http_html', 'crawl4ai_markdown', 'scrapling_fetch', 'playwright_network'],
    reason: '2026-06-02 实测：ec.sinopec.com 首页服务端渲染公告列表，http_html 直采成功；代理商、8位码、指标和买标等详情需登录后转本地助手。',
  },
  延长石油: {
    collectionPath: 'cloud_then_local',
    recommendedCrawlStrategy: 'playwright_dom',
    fallbackPath: 'local_helper',
    firstTool: 'playwright_network',
    tools: ['playwright_network', 'crawl4ai_markdown', 'scrapling_fetch', 'local_playwright_cdp'],
    reason: '2026-06-02 实测：zc.sxycpc.com 列表由 tenderA.js 异步加载，静态 http_html 抓不到公告行；云端需 JS 渲染（playwright），失败转本地助手。',
  },
  中化: {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '2026-06-02 实测：Vue 单页应用，网关公告接口 notice/outer/page/queryPageList 直连返回 404（需应用上下文/令牌），云端暂不可直采，转本地助手。',
  },
  东华能源网: {
    collectionPath: 'manual_only',
    recommendedCrawlStrategy: 'manual_assist',
    fallbackPath: 'manual_only',
    firstTool: 'manual_text',
    tools: ['manual_text'],
    reason: '资料中未提供具体入口，先生成补充入口任务。',
  },
  国能网: {
    collectionPath: 'cloud_auto',
    recommendedCrawlStrategy: 'http_html',
    fallbackPath: 'local_helper',
    firstTool: 'http_html',
    tools: ['http_html', 'crawl4ai_markdown', 'scrapling_fetch'],
    reason: '国能E招/E购有明确公开列表页，优先云端自动采集。',
  },
  国能E招: {
    collectionPath: 'cloud_auto',
    recommendedCrawlStrategy: 'http_html',
    fallbackPath: 'local_helper',
    firstTool: 'http_html',
    tools: ['http_html', 'crawl4ai_markdown', 'scrapling_fetch'],
    reason: '有明确公开列表页，优先云端自动采集。',
  },
  国能E购: {
    collectionPath: 'cloud_auto',
    recommendedCrawlStrategy: 'http_json',
    fallbackPath: 'local_helper',
    firstTool: 'http_json',
    tools: ['http_json', 'http_html', 'playwright_network'],
    reason: '首页通过 OSS JSON 加载询价/竞价公告，优先直接抓 JSON。',
  },
  中海油: {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '2026-06-02 实测：JS 单页应用，businessannouncement/page 接口返回维护占位页，无公开 JSON，转本地助手。',
  },
  裕龙招投标网: {
    collectionPath: 'cloud_then_local',
    recommendedCrawlStrategy: 'playwright_network',
    fallbackPath: 'local_helper',
    firstTool: 'playwright_network',
    tools: ['playwright_network', 'http_html', 'crawl4ai_markdown', 'scrapling_fetch', 'local_playwright_cdp'],
    reason: '资料说明不需登录，但中国招标投标公共服务平台搜索链路出现安全验证；云端只保留接口试探，失败后转本地助手。',
  },
  隆道云: {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '资料明确登录后可看招标详细内容。',
  },
  金能招标网: {
    collectionPath: 'local_helper',
    recommendedCrawlStrategy: 'local_helper',
    fallbackPath: 'manual_only',
    firstTool: 'local_playwright_cdp',
    tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
    reason: '资料提供账号密码，需登录查看公开招标、采购、直接定价和竞价公告。',
  },
};

export const classifySourceForPhase3 = (source = {}) => {
  const configured = phase3SourceMatrix[source.source_name];
  if (configured) return {
    sourceName: source.source_name,
    ...configured,
  };

  if (!source.source_url && !source.category_urls) {
    return {
      sourceName: source.source_name || '',
      collectionPath: 'manual_only',
      recommendedCrawlStrategy: 'manual_assist',
      fallbackPath: 'manual_only',
      firstTool: 'manual_text',
      tools: ['manual_text'],
      reason: '缺少入口 URL，需员工补充网站入口和操作路径。',
    };
  }

  if (source.requires_login || source.may_have_captcha || source.login_type === 'account') {
    return {
      sourceName: source.source_name || '',
      collectionPath: 'local_helper',
      recommendedCrawlStrategy: 'local_helper',
      fallbackPath: 'manual_only',
      firstTool: 'local_playwright_cdp',
      tools: ['local_playwright_cdp', 'local_screenshot_ocr', 'manual_text'],
      reason: '需要登录或人工验证，优先使用 Windows 本地采集助手。',
    };
  }

  return {
    sourceName: source.source_name || '',
    collectionPath: 'cloud_then_local',
    recommendedCrawlStrategy: 'http_html',
    fallbackPath: 'local_helper',
    firstTool: 'http_html',
    tools: ['http_html', 'crawl4ai_markdown', 'scrapling_fetch', 'playwright_network'],
    reason: '有公开入口，先做云端采集试验，失败后转本地助手。',
  };
};

export const sitesByCollectionPath = () => {
  const grouped = Object.fromEntries(CLOUD_COLLECTION_PATHS.map((path) => [path, []]));
  for (const [siteName, strategy] of Object.entries(phase3SourceMatrix)) {
    grouped[strategy.collectionPath].push(siteName);
  }
  return grouped;
};
