import { productFocusTerms } from '../domain/product-query-plan.ts';
import {
  buildSiteSearchScope,
  CHEMICAL_EXPLORATORY_TERMS,
  searchScopeText,
  type SiteSearchScope,
} from '../domain/site-search-scope.ts';
import type { PublicCollectionTask, PublicSiteDefinition } from '../domain/collection.ts';

export type BidSourceDefinition = PublicSiteDefinition & {
  collectionMode: 'scheduled' | 'local_helper';
};

const ALL_PRODUCTS = productFocusTerms();
const fullScope = ALL_PRODUCTS.join(',');

const NEW_PRODUCTS = [
  '磷酸三钙', '抗氧剂618', '亚磷酸酯', 'ABS树脂', '过氧化物',
  '二乙基羟胺', '异丙基羟胺', '异十二烷', '壬酸', '丙醛',
];
const COMMON_FAMILIES = [
  '化工原料', '化学品', '化工助剂', '添加剂', '油品', '有机酸',
  '酯类', '羟胺', '醛类', '烃类溶剂', '水处理剂', '树脂原料',
];
const ENERGY_FAMILIES = [
  '化工原料', '化学品', '化工助剂', '油品', '水处理剂', '添加剂',
  '有机酸', '酯类', '羟胺', '醛类',
];
const PETRO_FAMILIES = [
  '化工原料', '化学品', '化工助剂', '油品', '润滑油', '添加剂',
  '有机酸', '酯类', '羟胺', '醛类', '烃类溶剂',
];

const COMMON = [
  '阻聚剂', '白油', '凡士林脂', 'EDTA', '抗静电剂', '抗氧剂',
  '四氯乙烯', '硅油', '硫酸亚铁', '引发剂', 'TCP2', '基础油',
  'BHT', 'TBEC', '单乙醇胺', '分散剂', '消泡剂', '催化剂',
];

const ENERGY = [
  '焦亚硫酸钠', '亚硫酸钠', '起泡剂', '捕收剂', '消泡剂', '阻聚剂',
  '抗静电剂', '硫酸亚铁', '白油', '凡士林脂', '基础油', '四氯乙烯',
  'EDTA', '抗氧剂', '硅油', '分散剂', '引发剂', '单乙醇胺',
  '催化剂', '表面活性剂', '碳酸二甲酯', '碳酸氢钠', 'PAO', '硫酸羟胺',
];

const PETRO = [
  '白油', '阻聚剂', '消泡剂', '催化剂', '抗氧剂', '硅油', '分散剂',
  '抗静电剂', 'EDTA', '四氯乙烯', '基础油', '表面活性剂', '单乙醇胺',
  '硫酸亚铁', '引发剂', '凡士林脂', 'TCP2', 'PAO', '碳酸二甲酯',
  '二甲基二硫', '硫酸羟胺',
];

const scope = (
  preferredProductTerms: string[],
  productLimit: number,
  familyTerms: string[],
  familyLimit = 6,
  exploratoryTerms: readonly string[] = CHEMICAL_EXPLORATORY_TERMS,
): SiteSearchScope => buildSiteSearchScope({
  preferredProductTerms: [...preferredProductTerms, ...NEW_PRODUCTS],
  productLimit,
  familyTerms,
  familyLimit,
  exploratoryTerms,
});

const COMMON_SCOPE = scope(COMMON, 30, COMMON_FAMILIES);
const ENERGY_SCOPE = scope(ENERGY, 34, ENERGY_FAMILIES);
const PETRO_SCOPE = scope(PETRO, 32, PETRO_FAMILIES);
const YMZ_SCOPE = scope([...COMMON, '焦亚硫酸钠', '亚硫酸钠', '二甲基二硫'], 34, PETRO_FAMILIES);
const LONGDAO_SCOPE = scope([...COMMON, 'AMSD', '2-硝基二苯胺', 'DMPP'], 32, COMMON_FAMILIES);
const CNPC_SCOPE = scope(PETRO, 32, PETRO_FAMILIES, 6, []);

const source = (
  sourceKey: string,
  sourceName: string,
  entryUrl: string,
  searchScope: SiteSearchScope | null,
  llmExtractionHint: string,
  recentDays = 30,
  maxDetails = 6,
  maxCandidates = 160,
  collectionMode: BidSourceDefinition['collectionMode'] = 'scheduled',
): BidSourceDefinition => ({
  sourceKey,
  sourceName,
  entryUrl,
  deepSearchTerms: searchScope?.productTerms || [],
  searchScope: searchScope || undefined,
  defaultSearchTerms: searchScope ? searchScopeText(searchScope, sourceName) : fullScope,
  llmExtractionHint,
  maxCandidates,
  browserJourney: { recentDays, maxDetails },
  collectionMode,
});

export const PUBLIC_SITES: readonly BidSourceDefinition[] = [
  source('guoneng-egou', '国能E购', 'https://neep.shop/html/portal/index-Inquiries.html', ENERGY_SCOPE, '关注国家能源集团正在采购的化工原料、油品、药剂和助剂；排除销售、处置、工程和结果公告。'),
  source('guoneng-ebid', '国能E招', 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html', ENERGY_SCOPE, '提取化工产品的数量、技术指标、代理商或制造商限制、业绩及投标截止时间。'),
  source('cnooc', '中国海油供应链平台', 'https://bid.cnooc.com.cn/home/#/navigation', PETRO_SCOPE, '关注中国海油体系采购的化工原料、溶剂、油品、催化剂和助剂，也保留规则外的新化工产品。'),
  source('epec', '易派克', 'https://bidding.epec.com/tenderInfoOne', PETRO_SCOPE, '扫描中国石化 EPEC 化工原料、化工辅料等公开采购公告；重点提取代理商、制造商、业绩、准入、检测和危化要求。', 14, 6, 180),
  source('cncec', '中国化学电子招标投标平台', 'https://bid.cncecyc.com/cms/channel/ywgg1hw/index.htm', COMMON_SCOPE, '同时扫描货物招标、询比/询价和竞判公告；识别化工原料、油品、助剂及规则外新化工品，提取数量、规格、付款、平台准入、业绩、保证金和截止时间。', 14, 6, 180),
  source('sinochem', '中化采购供应链平台', 'https://scm.esinochem.com/#/home', COMMON_SCOPE, '识别中化体系采购的化工产品，区分采购公告与结果公告，提取截止时间、数量、技术标准和供应商资格。', 14, 6, 100),
  source('ymz', '云梦泽智慧平台', 'https://www.ymzec.com/bid/web-outportal/index.html#/home', YMZ_SCOPE, '同时关注招标、谈判和询比采购；只保留仍可参与的采购公告，并提取采购方式、数量、标准、准入、业绩和截止时间。'),
  source('yanchang', '延长石油招采网', 'https://zc.sxycpc.com/ebidPortal/menu0001.html', null, '合并三个公开来源，识别延长石油体系的化工原料和助剂采购，排除工程服务、结果和过期公告。', 14, 6, 120),
  source('longdao', '隆道云', 'https://search-plus.longdaoyun.com/query/bulletin/list', LONGDAO_SCOPE, '识别化工原料和助剂采购；列表状态仅作线索，以详情截止时间为准，公开正文不完整时明确标记待确认。'),
  source('jinneng', '金能科技采购平台', 'http://www.jinnengtech.com:6789/webportal/index.do', null, '关注金能化学采购的化工原料、油品、助剂、催化剂及规则外新化工品。', 30, 6, 240),
  source('norinco-public', '兵器网', 'https://bid.norincogroup-ebuy.com/retrieve.do', null, '只采集无需登录的公开招标和采购公告，关注兵器、华锦体系化工原料、油品和助剂，排除设备、工程、废旧处置和结果。'),
] as const;

export const HUMAN_ASSISTED_SITES: readonly BidSourceDefinition[] = [
  source(
    'cnpc',
    '中国石油招标投标网',
    'https://www.cnpcbidding.com/#/tenders',
    CNPC_SCOPE,
    '本地助手完成人机验证和当前结果采集后，由云端 Agent 复核化工产品、数量、规格、交货、限价、保证金、贸易商/制造商限制、同类业绩、平台准入和危化要求。',
    30,
    6,
    100,
    'local_helper',
  ),
  source(
    'yulong',
    '裕龙招投标网',
    'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    null,
    '本地助手完成安全验证并读取裕龙石化公告后，由云端 Agent 复核产品、数量、规格/纯度/包装、截止时间、供应商资格、代理商限制及附件证据；排除候选人和结果公示。',
    30,
    6,
    100,
    'local_helper',
  ),
] as const;

export const BID_SITES: readonly BidSourceDefinition[] = [
  ...PUBLIC_SITES,
  ...HUMAN_ASSISTED_SITES,
];

const byName = new Map(BID_SITES.map((item) => [item.sourceName, item]));
const byKey = new Map(BID_SITES.map((item) => [item.sourceKey, item]));

export const definitionFor = (sourceName: string): PublicSiteDefinition => {
  const definition = byName.get(sourceName);
  if (!definition) throw new Error(`Unsupported public bid source: ${sourceName}`);
  return definition;
};

export const definitionForKey = (sourceKey: string): PublicSiteDefinition => {
  const definition = byKey.get(sourceKey);
  if (!definition) throw new Error(`Unsupported public bid source key: ${sourceKey}`);
  return definition;
};

export const taskForSite = (
  site: PublicSiteDefinition,
  searchScope = site.searchScope,
): PublicCollectionTask => ({
  id: `scheduled-${site.sourceKey}`,
  sourceName: site.sourceName,
  entryUrl: site.entryUrl,
  searchTerms: searchScope ? searchScopeText(searchScope, site.sourceName) : site.defaultSearchTerms,
  searchScope,
});
