import type { SiteExtractionProfile } from '../browser/types.ts';

export type SiteCollectionMode = 'public-feed' | 'browser-agent';
export type SiteBrowserEngine = 'playwright' | 'electron-cdp';

export type SiteDefinition = SiteExtractionProfile & {
  owner: string;
  collectionMode: SiteCollectionMode;
  browserEngine: SiteBrowserEngine;
  productFocus: string[];
  deepSearchTerms: string[];
  collectionInstructions: string[];
  llmExtractionHint: string;
};

const PETROCHEMICAL_PRODUCTS = [
  '凡士林脂', '凡士林油', '白油', '工业白油', '食品级白油', 'TCP', 'TCP2',
  '抗氧剂168', '抗氧剂618', '阻聚剂', '丁二烯阻聚剂', 'B596', 'B596W',
  'S600', 'S620', 'MEHQ', '对苯二酚', '四氯乙烯', '全氯乙烯', '硅油',
  '二甲基硅油', 'EDTA', '抗静电剂', '消泡剂', '分散剂', '硫酸亚铁',
  '硫酸羟胺', '焦亚硫酸钠', '亚硫酸钠', '起泡剂', '捕收剂', '催化剂',
];

const DEFAULT_ACTION_STEPS = '完成登录或安全验证后，停留在公告结果列表；系统会继续读取当前页面和网络响应。';

export const SITE_DEFINITIONS: Record<string, SiteDefinition> = {
  国能E购: {
    sourceName: '国能E购',
    owner: '小杨/小陈',
    entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
    collectionMode: 'public-feed',
    browserEngine: 'playwright',
    productFocus: ['焦亚硫酸钠', '亚硫酸钠', '起泡剂', '捕收剂', '消泡剂', '阻聚剂', '抗静电剂', '化工助剂'],
    deepSearchTerms: ['焦亚硫酸钠', '亚硫酸钠', '消泡剂', '阻聚剂', '抗静电剂', '起泡剂', '捕收剂', '硫酸亚铁'],
    defaultSearchTerms: '焦亚硫酸钠,亚硫酸钠,起泡剂,捕收剂,消泡剂,阻聚剂,抗静电剂,化工助剂',
    defaultActionSteps: '读取询价采购、竞价、竞争性谈判和紧急采购公开数据；命中产品后判断当前是否仍可报价。',
    collectionInstructions: ['优先读取公开 JSON/feed', '按产品词站内深搜', '排除销售、处置和结果公告'],
    llmExtractionHint: '关注货物类化工原料和助剂；不要把煤炭销售、设备、工程或结果公告作为机会。',
    buyerName: '国家能源集团',
  },
  易派克: {
    sourceName: '易派克',
    owner: '小冯',
    entryUrl: 'https://ec.sinopec.com/supp/index.shtml',
    collectionMode: 'public-feed',
    browserEngine: 'playwright',
    productFocus: [...PETROCHEMICAL_PRODUCTS, '基础油', 'PAO'],
    deepSearchTerms: ['白油', '凡士林脂', '阻聚剂', '抗氧剂168', '抗氧剂618', '硅油', '消泡剂', '分散剂', '四氯乙烯'],
    defaultSearchTerms: `中石化,易派克,${PETROCHEMICAL_PRODUCTS.join(',')},基础油,PAO`,
    defaultActionSteps: '读取公开采购公告；命中营业范围内产品后，继续确认是否接受代理商、规格和资质要求。',
    collectionInstructions: ['读取公开采购公告', '按产品名称和采购单位筛选', '排除结果公告'],
    llmExtractionHint: '识别中石化正在采购的化工产品，并提取代理商、制造商、业绩、8位码、检测和危化要求。',
    buyerName: '中石化',
    buyerMatch: /石化|中石化|sinopec/i,
    noisePattern: /评标结果|招标结果|中标候选|中标结果|成交结果|采购结果|入围结果|结果公示/,
  },
  裕龙招投标网: {
    sourceName: '裕龙招投标网',
    owner: '小白',
    entryUrl: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    collectionMode: 'browser-agent',
    browserEngine: 'electron-cdp',
    productFocus: [...PETROCHEMICAL_PRODUCTS, '化工助剂'],
    deepSearchTerms: ['裕龙石化', '白油', '凡士林脂', '阻聚剂', '抗氧剂', '硅油', '消泡剂', '分散剂', '四氯乙烯', '催化剂'],
    defaultSearchTerms: `裕龙石化,${PETROCHEMICAL_PRODUCTS.join(',')},化工助剂`,
    defaultActionSteps: '出现网易盾、安全验证或访问挑战时由员工完成验证；验证后停留在“裕龙石化”结果列表并继续采集。',
    collectionInstructions: ['打开裕龙石化搜索结果', '安全挑战立即交给员工', '验证后读取结果列表和搜索接口响应'],
    llmExtractionHint: '只提取裕龙石化当前仍可参与的化工产品采购；忽略平台广告、机构主页、中标结果、维修服务和工程项目。',
    humanRequiredPattern: /网易盾|安全验证|访问验证|滑块|captcha|访问过于频繁|sigchl|punish-type|traceid|ERR_CONNECTION_CLOSED/i,
    candidateLinePattern: /裕龙.*(?:公告|采购|招标)|(?:白油|凡士林|阻聚剂|抗氧剂|四氯乙烯|硅油|EDTA|抗静电剂|催化剂|化工助剂|消泡剂).*(?:公告|采购|招标)/,
    noisePattern: /中标候选人公示|中标结果|成交结果|废\S*处置|机构主页|企业产品专区|增值服务|TenderSeek|登录信息定制|标书编制|合规审查/,
    buyerName: '裕龙石化',
    buyerMatch: /裕龙/,
  },
};

export const PILOT_SITE_NAMES = Object.freeze(Object.keys(SITE_DEFINITIONS));

export const definitionFor = (sourceName = ''): SiteDefinition => SITE_DEFINITIONS[sourceName] || {
  sourceName: sourceName || '本地采集站点',
  owner: '',
  collectionMode: 'browser-agent',
  browserEngine: 'playwright',
  productFocus: PETROCHEMICAL_PRODUCTS,
  deepSearchTerms: PETROCHEMICAL_PRODUCTS,
  defaultSearchTerms: PETROCHEMICAL_PRODUCTS.join(','),
  defaultActionSteps: DEFAULT_ACTION_STEPS,
  collectionInstructions: ['打开公告列表', '按产品词筛选', '验证或登录时交给员工'],
  llmExtractionHint: '提取当前仍可参与的化工产品采购，并保留原文证据。',
};

export const profileFor = definitionFor;
export const entryUrlForSourceName = (sourceName = '') => definitionFor(sourceName).entryUrl || '';
export const searchTermsForSourceName = (sourceName = '') => definitionFor(sourceName).defaultSearchTerms || '';
export const actionStepsForSourceName = (sourceName = '') => definitionFor(sourceName).defaultActionSteps || DEFAULT_ACTION_STEPS;

export const sitePromptFor = (sourceName = '') => {
  const site = definitionFor(sourceName);
  return [
    `站点：${site.sourceName}`,
    `负责人：${site.owner || '未指定'}`,
    `采集方式：${site.collectionMode}`,
    `搜索步骤：${site.collectionInstructions.join('；')}`,
    `重点产品：${site.productFocus.join('、')}`,
    `页面抽取提示：${site.llmExtractionHint}`,
  ].join('\n');
};
