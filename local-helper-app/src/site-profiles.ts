import type { SiteHarnessProfile } from './site-harness.ts';

// 第二批本地采集站点的 profile 注册表。这些站点都需要员工本机登录/验证码，
// harness 默认会在登录态暂停交人，登录后再把可见公告文本抽成 CandidateBundle。
// 绝大多数站点用默认规则即可，这里只补充每站的采购方提示等少量差异。
const DEFAULT_ACTION_STEPS = '完成登录/验证后，进入招标、询价、采购公告列表；按搜索词筛选，停留在结果列表或公告详情页后继续采集。';
const CORE_HISTORY_TERMS = '凡士林脂,凡士林油,白油,工业白油,68号工业白油,TCP,TCP2,TCP-2,抗氧剂168,抗氧剂618,阻聚剂,丁二烯阻聚剂,B596,B596W,S600,S620,协同阻聚剂,MEHQ,对苯二酚,四氯乙烯,全氯乙烯,硅油,二甲基硅油,EDTA,乙二胺四乙酸二钠,乙二胺四乙酸四钠,抗静电剂,消泡剂,分散剂,硫酸亚铁,硫酸羟胺,AMSD,单乙醇胺,焦亚硫酸钠,亚硫酸钠,起泡剂,捕收剂,催化剂,化工助剂';
const PETROCHEMICAL_TERMS = '白油,凡士林脂,TCP2,阻聚剂,丁二烯阻聚剂,抗氧剂168,抗氧剂618,四氯乙烯,全氯乙烯,硅油,EDTA,抗静电剂,基础油,PAO';
const NORINCO_TERMS = '消泡剂,硅油,四氯乙烯,矿物油,引发剂,液氮,阻聚剂,抗静电剂';
export const DEFAULT_SEARCH_TERMS = CORE_HISTORY_TERMS;

export const SITE_PROFILES: Record<string, SiteHarnessProfile> = {
  中石油招投标网: {
    sourceName: '中石油招投标网',
    entryUrl: 'https://www.cnpcbidding.com/#/tenders',
    defaultSearchTerms: PETROCHEMICAL_TERMS,
    defaultActionSteps: '查看招标公告、谈判采购公告、询价(竞价)采购公告；优先按历史产品关键词和发布日期筛选，停留在列表或详情页后继续采集。',
  },
  华锦兵器网: {
    sourceName: '华锦兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    defaultSearchTerms: NORINCO_TERMS,
    defaultActionSteps: '完成登录后进入招标采购或询价交易列表；按搜索词筛选，停留在业务公告列表后继续采集。',
    buyerName: '华锦兵器网',
    buyerMatch: /华锦|兵器/,
    candidateLinePattern: /^商\S{4,}/,
    noisePattern: /平台公告|账号登录|端午节|假期公告|系统升级|运营管理|供应商履约监管|操作手册|注册指南|交易规则|业务一览|点击更多|央企消费帮扶|合作专栏|智慧物流|法律纠纷|七采云仓/,
  },
  华北兵器网: {
    sourceName: '华北兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    defaultSearchTerms: NORINCO_TERMS,
    defaultActionSteps: '完成登录后进入招标采购或询价交易列表；按搜索词筛选，停留在业务公告列表后继续采集。',
    buyerName: '华锦兵器网',
    buyerMatch: /华锦|兵器/,
    candidateLinePattern: /^商\S{4,}/,
    noisePattern: /平台公告|账号登录|端午节|假期公告|系统升级|运营管理|供应商履约监管|操作手册|注册指南|交易规则|业务一览|点击更多|央企消费帮扶|合作专栏|智慧物流|法律纠纷|七采云仓/,
  },
  易派克: {
    sourceName: '易派克',
    entryUrl: 'https://ec.sinopec.com/supp/index.shtml',
    defaultSearchTerms: `中石化,易派客,${PETROCHEMICAL_TERMS},消泡剂,分散剂`,
    defaultActionSteps: '可先不登录搜索公开采购信息；按产品名称、公司营业范围和发布日期筛选，确认是否接受代理商后继续采集。',
    buyerName: '中石化',
    buyerMatch: /石化|中石化|sinopec/i,
  },
  云梦泽询价网: {
    sourceName: '云梦泽询价网',
    entryUrl: 'https://www.ymzec.com/bid/web-outportal/index.html#/home--',
    defaultSearchTerms: PETROCHEMICAL_TERMS,
    defaultActionSteps: '查看招标采购和非招标采购，非招包含谈判采购、询比采购；按历史产品关键词筛选，需要买标书时先停下交人确认。',
  },
  '能源一号（兰州恒化成）': {
    sourceName: '能源一号（兰州恒化成）',
    entryUrl: 'https://www.energyahead.com/',
    defaultSearchTerms: `兰州恒化成,恒化成,${PETROCHEMICAL_TERMS}`,
    defaultActionSteps: '进入能源一号网或相关账号入口；按公司名称和产品关键词筛选，停留在公告列表或粘贴材料后继续采集。',
    buyerName: '能源一号',
    buyerMatch: /能源一号|恒化成|兰州/,
  },
  '能源一号（北京恒化成）': {
    sourceName: '能源一号（北京恒化成）',
    entryUrl: 'https://www.energyahead.com/',
    defaultSearchTerms: `北京恒化成,恒化成,${PETROCHEMICAL_TERMS}`,
    defaultActionSteps: '进入能源一号网或相关账号入口；按公司名称和产品关键词筛选，停留在公告列表或粘贴材料后继续采集。',
    buyerName: '能源一号',
    buyerMatch: /能源一号|恒化成|北京/,
  },
  '能源一号（天津宜远）': {
    sourceName: '能源一号（天津宜远）',
    entryUrl: 'https://www.energyahead.com/',
    defaultSearchTerms: `天津宜远,宜远,${PETROCHEMICAL_TERMS}`,
    defaultActionSteps: '进入能源一号网或相关账号入口；按公司名称和产品关键词筛选，停留在公告列表或粘贴材料后继续采集。',
    buyerName: '能源一号',
    buyerMatch: /能源一号|宜远|天津/,
  },
  隆道云: {
    sourceName: '隆道云',
    entryUrl: 'https://www.longdaoyun.com/',
    defaultSearchTerms: CORE_HISTORY_TERMS,
    defaultActionSteps: '点击站内放大镜或进入公告/采购项目搜索；按历史产品关键词筛选，登录后查看详情并继续采集。',
  },
  金能招标网: {
    sourceName: '金能招标网',
    entryUrl: 'http://www.jinnengtech.com:6789/',
    defaultSearchTerms: `金能,${CORE_HISTORY_TERMS}`,
    defaultActionSteps: '依次查看公开招标、招标采购、直接定价、竞价公告；命中历史产品或化工助剂后进入详情继续采集。',
    buyerName: '金能',
    buyerMatch: /金能/,
  },
  延长石油: {
    sourceName: '延长石油',
    entryUrl: 'https://zc.sxycpc.com/ebidPortal/menu0002.html',
    defaultSearchTerms: '延长石油,榆林延长,白油,凡士林脂,抗静电剂,阻聚剂,硅油,消泡剂',
    defaultActionSteps: '查看采购公告和预审公告；重点搜索白油、凡士林脂、抗静电剂等延长历史相关产品，停留在列表或详情后继续采集。',
  },
  中化: {
    sourceName: '中化',
    entryUrl: 'https://scm.esinochem.com/',
    defaultSearchTerms: `中化,${CORE_HISTORY_TERMS}`,
    defaultActionSteps: '查看招标公告、采购公告、竞价公告；可按标题关键词或发布日期筛选，命中后进入详情/附件继续采集。',
  },
  中海油: {
    sourceName: '中海油',
    entryUrl: 'https://bid.cnooc.com.cn/home/#/navigation',
    defaultSearchTerms: `中海油,${PETROCHEMICAL_TERMS},焦亚硫酸钠,亚硫酸钠`,
    defaultActionSteps: '查看招标公告和非招标公告；优先筛选历史产品、油田/炼化助剂和附件中的硬性条件。',
  },
  国能E招: {
    sourceName: '国能E招',
    entryUrl: 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html',
    defaultSearchTerms: '国能,焦亚硫酸钠,亚硫酸钠,起泡剂,捕收剂,消泡剂,阻聚剂,抗静电剂,硫酸亚铁,化工助剂,水处理剂',
    defaultActionSteps: '查看招标公告和非招标公告；优先货物类和化工/煤化工相关公告，弱通用词需进入详情或附件确认。',
  },
  国能E购: {
    sourceName: '国能E购',
    entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
    defaultSearchTerms: '国能,询价,竞价,竞争性谈判,焦亚硫酸钠,亚硫酸钠,起泡剂,捕收剂,消泡剂,阻聚剂,抗静电剂,化工助剂',
    defaultActionSteps: '查看询价采购公告、竞价公告、竞争性谈判公告；命中化工助剂或历史产品后进入详情继续采集。',
  },
  国能网: {
    sourceName: '国能网',
    entryUrl: 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html',
    defaultSearchTerms: '国能,焦亚硫酸钠,亚硫酸钠,起泡剂,捕收剂,消泡剂,阻聚剂,抗静电剂,硫酸亚铁,化工助剂,水处理剂',
    defaultActionSteps: '覆盖国能E招和国能E购公开公告；按公告类型进入对应列表后继续采集。',
  },
  东华能源网: {
    sourceName: '东华能源网',
    defaultSearchTerms: `东华能源,${PETROCHEMICAL_TERMS}`,
    defaultActionSteps: '当前资料未提供入口 URL；请先补充网址或手动打开东华能源采购公告页，再停留在列表或详情页继续采集。',
  },
  裕龙招投标网: {
    sourceName: '裕龙招投标网',
    entryUrl: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    defaultSearchTerms: `裕龙石化,${PETROCHEMICAL_TERMS},催化剂,化工助剂`,
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
