import type { SiteHarnessProfile } from './site-harness.ts';

// 第二批本地采集站点的 profile 注册表。这些站点都需要员工本机登录/验证码，
// harness 默认会在登录态暂停交人，登录后再把可见公告文本抽成 CandidateBundle。
// 绝大多数站点用默认规则即可，这里只补充每站的采购方提示等少量差异。
export const DEFAULT_SEARCH_TERMS = '缓蚀剂,阻垢剂,缓蚀阻垢剂,杀菌剂,絮凝剂,聚丙烯酰胺,破乳剂,消泡剂,焦亚硫酸钠,抗静电剂,阻聚剂,表面活性剂,水处理剂';

const DEFAULT_ACTION_STEPS = '完成登录/验证后，进入招标、询价、采购公告列表；按搜索词筛选，停留在结果列表或公告详情页后继续采集。';

export const SITE_PROFILES: Record<string, SiteHarnessProfile> = {
  中石油招投标网: {
    sourceName: '中石油招投标网',
    entryUrl: 'https://www.cnpcbidding.com/#/tenders',
    defaultSearchTerms: '缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,杀菌剂,水处理剂',
    defaultActionSteps: DEFAULT_ACTION_STEPS,
  },
  华锦兵器网: {
    sourceName: '华锦兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    defaultSearchTerms: '消泡剂,液氮,缓蚀剂,阻垢剂,水处理剂',
    defaultActionSteps: '完成登录后进入招标采购或询价交易列表；按搜索词筛选，停留在业务公告列表后继续采集。',
    buyerName: '华锦兵器网',
    buyerMatch: /华锦|兵器/,
    candidateLinePattern: /^商\S{4,}/,
    noisePattern: /平台公告|账号登录|端午节|假期公告|系统升级|运营管理|供应商履约监管|操作手册|注册指南|交易规则|业务一览|点击更多|央企消费帮扶|合作专栏|智慧物流|法律纠纷|七采云仓/,
  },
  华北兵器网: {
    sourceName: '华北兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    defaultSearchTerms: '消泡剂,液氮,缓蚀剂,阻垢剂,水处理剂',
    defaultActionSteps: '完成登录后进入招标采购或询价交易列表；按搜索词筛选，停留在业务公告列表后继续采集。',
    buyerName: '华锦兵器网',
    buyerMatch: /华锦|兵器/,
    candidateLinePattern: /^商\S{4,}/,
    noisePattern: /平台公告|账号登录|端午节|假期公告|系统升级|运营管理|供应商履约监管|操作手册|注册指南|交易规则|业务一览|点击更多|央企消费帮扶|合作专栏|智慧物流|法律纠纷|七采云仓/,
  },
  易派克: {
    sourceName: '易派克',
    entryUrl: 'https://ec.sinopec.com/supp/index.shtml',
    defaultSearchTerms: '缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,杀菌剂,水处理剂',
    defaultActionSteps: DEFAULT_ACTION_STEPS,
    buyerName: '中石化',
    buyerMatch: /石化|中石化|sinopec/i,
  },
  云梦泽询价网: {
    sourceName: '云梦泽询价网',
    entryUrl: 'https://www.ymzec.com/bid/web-outportal/index.html#/home--',
    defaultSearchTerms: '缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,水处理剂',
    defaultActionSteps: '完成账号登录后进入招标采购、非招标采购或询比采购列表；按搜索词筛选后继续采集。',
  },
  '能源一号（兰州恒化成）': {
    sourceName: '能源一号（兰州恒化成）',
    entryUrl: 'https://www.energyahead.com/',
    defaultSearchTerms: '恒化成,缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂',
    defaultActionSteps: '进入能源一号网或相关账号入口；按公司名称和产品关键词筛选，停留在公告列表或粘贴材料后继续采集。',
    buyerName: '能源一号',
    buyerMatch: /能源一号|恒化成|兰州/,
  },
  '能源一号（北京恒化成）': {
    sourceName: '能源一号（北京恒化成）',
    entryUrl: 'https://www.energyahead.com/',
    defaultSearchTerms: '北京恒化成,恒化成,缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂',
    defaultActionSteps: '进入能源一号网或相关账号入口；按公司名称和产品关键词筛选，停留在公告列表或粘贴材料后继续采集。',
    buyerName: '能源一号',
    buyerMatch: /能源一号|恒化成|北京/,
  },
  '能源一号（天津宜远）': {
    sourceName: '能源一号（天津宜远）',
    entryUrl: 'https://www.energyahead.com/',
    defaultSearchTerms: '天津宜远,宜远,缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂',
    defaultActionSteps: '进入能源一号网或相关账号入口；按公司名称和产品关键词筛选，停留在公告列表或粘贴材料后继续采集。',
    buyerName: '能源一号',
    buyerMatch: /能源一号|宜远|天津/,
  },
  隆道云: {
    sourceName: '隆道云',
    entryUrl: 'https://lap.longdao.com/',
    defaultSearchTerms: '缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,水处理剂',
    defaultActionSteps: DEFAULT_ACTION_STEPS,
  },
  金能招标网: {
    sourceName: '金能招标网',
    entryUrl: 'https://www.jnzbw.com/',
    defaultSearchTerms: '金能,缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,水处理剂',
    defaultActionSteps: DEFAULT_ACTION_STEPS,
    buyerName: '金能',
    buyerMatch: /金能/,
  },
  延长石油: {
    sourceName: '延长石油',
    entryUrl: 'https://zc.sxycpc.com/ebidPortal/menu0002.html',
    defaultSearchTerms: '延长石油,缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,水处理剂',
    defaultActionSteps: DEFAULT_ACTION_STEPS,
  },
  中化: {
    sourceName: '中化',
    entryUrl: 'https://scm.esinochem.com/',
    defaultSearchTerms: '中化,缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,水处理剂',
    defaultActionSteps: DEFAULT_ACTION_STEPS,
  },
  中海油: {
    sourceName: '中海油',
    entryUrl: 'https://bid.cnooc.com.cn/home/#/navigation',
    defaultSearchTerms: '中海油,缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,水处理剂',
    defaultActionSteps: DEFAULT_ACTION_STEPS,
  },
  裕龙招投标网: {
    sourceName: '裕龙招投标网',
    entryUrl: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    defaultSearchTerms: '裕龙石化,缓蚀剂,阻垢剂,缓蚀阻垢剂,聚丙烯酰胺,消泡剂,水处理剂',
    defaultActionSteps: '若出现安全验证，先人工完成验证；搜索裕龙石化和产品关键词，停留在搜索结果列表后继续采集。',
    buyerName: '裕龙石化',
    buyerMatch: /裕龙/,
  },
};

// 按任务来源名返回 profile；未注册的站点回落到只带来源名的通用 profile（沿用默认规则）。
export const profileFor = (sourceName = ''): SiteHarnessProfile =>
  SITE_PROFILES[sourceName] || { sourceName: sourceName || '本地采集站点' };

export const entryUrlForSourceName = (sourceName = '') =>
  profileFor(sourceName).entryUrl || '';

export const searchTermsForSourceName = (sourceName = '') =>
  profileFor(sourceName).defaultSearchTerms || DEFAULT_SEARCH_TERMS;

export const actionStepsForSourceName = (sourceName = '') =>
  profileFor(sourceName).defaultActionSteps || DEFAULT_ACTION_STEPS;
