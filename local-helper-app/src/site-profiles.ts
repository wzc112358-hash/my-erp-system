import type { SiteHarnessProfile } from './site-harness.ts';

// 第二批本地采集站点的 profile 注册表。这些站点都需要员工本机登录/验证码，
// harness 默认会在登录态暂停交人，登录后再把可见公告文本抽成 CandidateBundle。
// 绝大多数站点用默认规则即可，这里只补充每站的采购方提示等少量差异。
export const SITE_PROFILES: Record<string, SiteHarnessProfile> = {
  华锦兵器网: {
    sourceName: '华锦兵器网',
    buyerName: '华锦兵器网',
    buyerMatch: /华锦|兵器/,
  },
  易派克: {
    sourceName: '易派克',
    buyerName: '中石化',
    buyerMatch: /石化|中石化|sinopec/i,
  },
  云梦泽询价网: {
    sourceName: '云梦泽询价网',
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
  },
  金能招标网: {
    sourceName: '金能招标网',
    buyerName: '金能',
    buyerMatch: /金能/,
  },
};

// 按任务来源名返回 profile；未注册的站点回落到只带来源名的通用 profile（沿用默认规则）。
export const profileFor = (sourceName = ''): SiteHarnessProfile =>
  SITE_PROFILES[sourceName] || { sourceName: sourceName || '本地采集站点' };
