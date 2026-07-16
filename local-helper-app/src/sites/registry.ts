import type { SiteExtractionProfile } from '../browser/types.ts';
import {
  buildProductQueryPlan,
  productFocusTerms,
} from '../domain/product-query-plan.ts';

export type SiteCollectionMode = 'public-feed' | 'browser-agent';
export type SiteBrowserEngine = 'playwright' | 'electron-cdp';

export type SiteBrowserJourney = {
  strategy: 'keyword' | 'latest';
  queryTerms: string[];
  maxPages: number;
  maxDetails: number;
  recentDays: number;
};

export type SiteDefinition = SiteExtractionProfile & {
  owner: string;
  collectionMode: SiteCollectionMode;
  browserEngine: SiteBrowserEngine;
  productFocus: string[];
  deepSearchTerms: string[];
  collectionInstructions: string[];
  llmExtractionHint: string;
  browserJourney?: SiteBrowserJourney;
};

const PRODUCT_FOCUS = productFocusTerms();
const DEFAULT_PRODUCT_QUERIES = buildProductQueryPlan({
  preferredTerms: ['阻聚剂', '白油', '凡士林脂', 'EDTA', '抗静电剂', '抗氧剂', '四氯乙烯', '硅油', '硫酸亚铁', '引发剂'],
  limit: 12,
});

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
    productFocus: PRODUCT_FOCUS,
    deepSearchTerms: ['白油', '凡士林脂', '阻聚剂', '抗氧剂168', '抗氧剂618', '硅油', '消泡剂', '分散剂', '四氯乙烯'],
    defaultSearchTerms: `中石化,易派克,${PRODUCT_FOCUS.join(',')}`,
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
    productFocus: PRODUCT_FOCUS,
    deepSearchTerms: ['裕龙石化', '白油', '凡士林脂', '阻聚剂', '抗氧剂', '硅油', '消泡剂', '分散剂', '四氯乙烯', '催化剂'],
    defaultSearchTerms: `裕龙石化,${PRODUCT_FOCUS.join(',')},化工助剂`,
    defaultActionSteps: '出现网易盾、安全验证或访问挑战时由员工完成验证；验证后停留在“裕龙石化”结果列表并继续采集。',
    collectionInstructions: ['打开裕龙石化搜索结果', '安全挑战立即交给员工', '验证后读取结果列表和搜索接口响应'],
    llmExtractionHint: '只提取裕龙石化当前仍可参与的化工产品采购；忽略平台广告、机构主页、中标结果、维修服务和工程项目。',
    humanRequiredPattern: /网易盾|安全验证|访问验证|滑块|captcha|访问过于频繁|sigchl|punish-type|traceid|ERR_CONNECTION_CLOSED/i,
    candidateLinePattern: /裕龙.*(?:公告|采购|招标)|(?:白油|凡士林|阻聚剂|抗氧剂|四氯乙烯|硅油|EDTA|抗静电剂|催化剂|化工助剂|消泡剂).*(?:公告|采购|招标)/,
    noisePattern: /中标候选人公示|中标结果|成交结果|废\S*处置|机构主页|企业产品专区|增值服务|TenderSeek|登录信息定制|标书编制|合规审查/,
    maxCandidates: 100,
    buyerName: '裕龙石化',
    buyerMatch: /裕龙/,
  },
  中国石油招标投标网: {
    sourceName: '中国石油招标投标网',
    owner: '小陈',
    entryUrl: 'https://www.cnpcbidding.com/#/tenders',
    collectionMode: 'browser-agent',
    browserEngine: 'playwright',
    productFocus: PRODUCT_FOCUS,
    deepSearchTerms: DEFAULT_PRODUCT_QUERIES,
    defaultSearchTerms: DEFAULT_PRODUCT_QUERIES.join(','),
    defaultActionSteps: '按重点产品逐项搜索招标公告，只查看近期新公告；命中后读取公告全文、截止时间和投标人资格要求。',
    collectionInstructions: ['逐项搜索重点产品', '仅保留近期招标公告', '打开相关详情并读取资质和截止时间'],
    llmExtractionHint: '关注中国石油体系的化工原料和助剂。重点提取数量、最高限价、交货期、代理商/制造商、同类业绩、供应商准入、危化运输、标书费、保证金和投标截止时间。',
    browserJourney: {
      strategy: 'keyword',
      queryTerms: DEFAULT_PRODUCT_QUERIES,
      maxPages: 1,
      maxDetails: 6,
      recentDays: 30,
    },
    noisePattern: /结果公示|中标|成交|失信公告|供应商新增准入|承包商新增准入/,
    maxCandidates: 80,
    buyerName: '中国石油',
    buyerMatch: /中石油|中国石油|石化|油田/,
  },
  中化采购供应链平台: {
    sourceName: '中化采购供应链平台',
    owner: '小杨',
    entryUrl: 'https://scm.esinochem.com/#/home',
    collectionMode: 'browser-agent',
    browserEngine: 'playwright',
    productFocus: PRODUCT_FOCUS,
    deepSearchTerms: [],
    defaultSearchTerms: PRODUCT_FOCUS.join(','),
    defaultActionSteps: '读取首页当天及近期招标、非招采购和竞价公告；只对相关产品打开详情 PDF。',
    collectionInstructions: ['读取公开最新公告', '保留招标和非招采购', '相关公告进入 PDF/OCR'],
    llmExtractionHint: '识别中化体系正在采购的化工产品，区分采购公告与结果公告；详情优先读取公告 PDF，提取截止时间、数量、技术标准和供应商资格。',
    browserJourney: {
      strategy: 'latest',
      queryTerms: [],
      maxPages: 1,
      maxDetails: 6,
      recentDays: 14,
    },
    noisePattern: /候选人|中标|成交结果|评审结果|结果公告|结果公示/,
    maxCandidates: 80,
    buyerName: '中化',
    buyerMatch: /中化|sinochem/i,
  },
  云梦泽智慧平台: {
    sourceName: '云梦泽智慧平台',
    owner: '小陈',
    entryUrl: 'https://www.ymzec.com/bid/web-outportal/index.html#/home',
    collectionMode: 'browser-agent',
    browserEngine: 'playwright',
    productFocus: PRODUCT_FOCUS,
    deepSearchTerms: DEFAULT_PRODUCT_QUERIES,
    defaultSearchTerms: DEFAULT_PRODUCT_QUERIES.join(','),
    defaultActionSteps: '按重点产品搜索招标和非招采购，限定近期公告，排除候选人、成交结果和已截止项目；相关公告继续读取 PDF 和附件。',
    collectionInstructions: ['逐项搜索重点产品', '同时覆盖招标与非招采购', '排除结果和过期公告', '读取详情 PDF 与附件'],
    llmExtractionHint: '云梦泽结果混合招标、询比、竞价、候选人、成交结果和招标计划。只保留仍可参与的采购公告，并提取采购方式、数量、标准、准入状态、业绩和截止时间。',
    browserJourney: {
      strategy: 'keyword',
      queryTerms: DEFAULT_PRODUCT_QUERIES,
      maxPages: 1,
      maxDetails: 6,
      recentDays: 30,
    },
    noisePattern: /候选人公示|拟成交|成交结果|中标结果|招标计划|已截止/,
    maxCandidates: 100,
    buyerName: '中国石油',
    buyerMatch: /中石油|中国石油|石化|油田/,
  },
};

export const PILOT_SITE_NAMES = Object.freeze(Object.keys(SITE_DEFINITIONS));

export const definitionFor = (sourceName = ''): SiteDefinition => SITE_DEFINITIONS[sourceName] || {
  sourceName: sourceName || '本地采集站点',
  owner: '',
  collectionMode: 'browser-agent',
  browserEngine: 'playwright',
  productFocus: PRODUCT_FOCUS,
  deepSearchTerms: DEFAULT_PRODUCT_QUERIES,
  defaultSearchTerms: DEFAULT_PRODUCT_QUERIES.join(','),
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
