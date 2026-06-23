export const CRAWL_STRATEGIES = {
  HTTP_HTML: 'http_html',
  HTTP_JSON: 'http_json',
};

export const SITE_SEARCH_BEHAVIORS = {
  NONE: 'none',
  SUPPLEMENTAL: 'supplemental',
  PRIMARY: 'primary',
};

export const CLOUD_SOURCE_NAMES = new Set(['国能网', '国能E招', '国能E购']);

export const GUONENG_CATEGORY_URLS = [
  'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html',
  'https://www.chnenergybidding.com.cn/bidweb/001/001003/moreinfo.html',
  'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireOne/index.json',
  'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireBidding/index.json',
  'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireSix/index.json',
];

export const GUONENG_CATEGORY_NAMES = [
  '国能E招-招标公告',
  '国能E招-非招标公告',
  '国能E购-询价采购公告',
  '国能E购-竞价公告',
  '国能E购-竞争性谈判公告',
];

export const isCloudManagedSource = (source = {}) => CLOUD_SOURCE_NAMES.has(source.source_name);

export const resolveSourceStrategy = (source = {}) => {
  const isGuoneng = isCloudManagedSource(source);
  const categoryNames = String(isGuoneng ? GUONENG_CATEGORY_NAMES.join(',') : source.category_names || '')
    .split(/[,，\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const categoryUrls = String(isGuoneng ? GUONENG_CATEGORY_URLS.join(',') : source.category_urls || source.source_url || '')
    .split(/[,，\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    categoryNames,
    categoryUrls,
    crawlStrategy: isGuoneng ? (source.crawl_strategy || CRAWL_STRATEGIES.HTTP_HTML) : '',
    collectionPath: isGuoneng ? 'cloud_auto' : 'disabled',
    fallbackPath: '',
    firstTool: isGuoneng ? 'collector-service' : '',
    tools: isGuoneng ? ['collector-service', 'http_html', 'http_json'] : [],
    siteSearchBehavior: source.site_search_behavior || SITE_SEARCH_BEHAVIORS.SUPPLEMENTAL,
    manualAssistReason: '',
    requiresManualAssist: false,
  };
};
