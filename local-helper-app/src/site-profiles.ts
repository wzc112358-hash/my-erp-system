import type { SiteHarnessProfile } from './site-harness.ts';

// 第二批本地采集站点的 profile 注册表。这些站点都需要员工本机登录/验证码，
// harness 默认会在登录态暂停交人，登录后再把可见公告文本抽成 CandidateBundle。
// 绝大多数站点用默认规则即可，这里只补充每站的采购方提示等少量差异。
export const SITE_PROFILES: Record<string, SiteHarnessProfile> = {
  中石油招投标网: {
    sourceName: '中石油招投标网',
    entryUrl: 'https://www.cnpcbidding.com/#/tenders',
  },
  华锦兵器网: {
    sourceName: '华锦兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    buyerName: '华锦兵器网',
    buyerMatch: /华锦|兵器/,
    candidateLinePattern: /^商\S{4,}/,
    noisePattern: /平台公告|账号登录|端午节|假期公告|系统升级|运营管理|供应商履约监管|操作手册|注册指南|交易规则|业务一览|点击更多|央企消费帮扶|合作专栏|智慧物流|法律纠纷|七采云仓/,
  },
  华北兵器网: {
    sourceName: '华北兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
    buyerName: '华锦兵器网',
    buyerMatch: /华锦|兵器/,
    candidateLinePattern: /^商\S{4,}/,
    noisePattern: /平台公告|账号登录|端午节|假期公告|系统升级|运营管理|供应商履约监管|操作手册|注册指南|交易规则|业务一览|点击更多|央企消费帮扶|合作专栏|智慧物流|法律纠纷|七采云仓/,
  },
  易派克: {
    sourceName: '易派克',
    entryUrl: 'https://ec.sinopec.com/supp/index.shtml',
    buyerName: '中石化',
    buyerMatch: /石化|中石化|sinopec/i,
  },
  云梦泽询价网: {
    sourceName: '云梦泽询价网',
    entryUrl: 'https://www.ymzec.com/bid/web-outportal/index.html#/home--',
  },
  '能源一号（兰州恒化成）': {
    sourceName: '能源一号（兰州恒化成）',
    buyerName: '能源一号',
    buyerMatch: /能源一号|恒化成|兰州/,
  },
  '能源一号（北京恒化成）': {
    sourceName: '能源一号（北京恒化成）',
    buyerName: '能源一号',
    buyerMatch: /能源一号|恒化成|北京/,
  },
  '能源一号（天津宜远）': {
    sourceName: '能源一号（天津宜远）',
    buyerName: '能源一号',
    buyerMatch: /能源一号|宜远|天津/,
  },
  隆道云: {
    sourceName: '隆道云',
    entryUrl: 'https://lap.longdao.com/',
  },
  金能招标网: {
    sourceName: '金能招标网',
    entryUrl: 'https://www.jnzbw.com/',
    buyerName: '金能',
    buyerMatch: /金能/,
  },
  延长石油: {
    sourceName: '延长石油',
    entryUrl: 'https://zc.sxycpc.com/ebidPortal/menu0002.html',
  },
  中化: {
    sourceName: '中化',
    entryUrl: 'https://scm.esinochem.com/',
  },
  中海油: {
    sourceName: '中海油',
    entryUrl: 'https://bid.cnooc.com.cn/home/#/navigation',
  },
  裕龙招投标网: {
    sourceName: '裕龙招投标网',
    entryUrl: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
    buyerName: '裕龙石化',
    buyerMatch: /裕龙/,
  },
};

// 按任务来源名返回 profile；未注册的站点回落到只带来源名的通用 profile（沿用默认规则）。
export const profileFor = (sourceName = ''): SiteHarnessProfile =>
  SITE_PROFILES[sourceName] || { sourceName: sourceName || '本地采集站点' };

export const entryUrlForSourceName = (sourceName = '') =>
  profileFor(sourceName).entryUrl || '';
