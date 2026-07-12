export type SiteCollectionSkill = {
  sourceName: string;
  owner: string;
  access: 'public' | 'login_required' | 'public_then_login' | 'missing_entry';
  primaryTool: 'local_browser' | 'public_search' | 'public_json' | 'manual';
  searchPlan: string[];
  columnsToCheck: string[];
  humanBarriers: string[];
  productFocus: string[];
  searchDomains?: string[];
  deepSearchTerms?: string[];
  deepSearchQueries?: string[];
  browserSearchHints?: string[];
  requiredExtraction: string[];
  finishCriteria: string[];
  fallbackPlan: string;
};

const COMMON_REQUIRED_EXTRACTION = [
  '标题、采购方、详情链接、发布日期、报价/投标截止时间、开标时间',
  '产品名称、规格型号、数量、包装、交货地点、交货期、是否分批',
  '是否接受代理商、是否限制生产商/制造商、是否需要授权',
  '第三方检测、质检单、业绩、8 位码/准入、危化资质、运输和包装回收要求',
  '标书费、保证金、服务费、付款方式、质保金',
  '历史中标人、历史价格、我司是否做过、之前报价或排名',
  '缺失信息和需要问王总/同事确认的问题',
];

const COMMON_FINISH = [
  '已提取候选公告并能生成商机卡片',
  '强相关产品已进入详情或附件深读',
  '遇登录、验证码、短信、CA 或安全验证时立即 request_human',
  '没有新信息也要生成站点巡检结论',
];

const petrochemicalFocus = ['白油', '凡士林脂', 'TCP2', '阻聚剂', '抗氧剂', '四氯乙烯', '硅油', 'EDTA', '抗静电剂', '基础油', 'PAO'];
const broadFocus = [...petrochemicalFocus, '消泡剂', '分散剂', '硫酸亚铁', '硫酸羟胺', '亚硫酸钠', '焦亚硫酸钠', '起泡剂', '捕收剂', '催化剂'];
const publicPetrochemicalSearchTerms = ['白油', '凡士林脂', '阻聚剂', '抗氧剂168', '抗氧剂618', '硅油', '消泡剂', '分散剂', '四氯乙烯'];
const guonengSearchTerms = ['焦亚硫酸钠', '亚硫酸钠', '消泡剂', '阻聚剂', '抗静电剂', '起泡剂', '捕收剂', '硫酸亚铁'];

export const SITE_COLLECTION_SKILLS: Record<string, SiteCollectionSkill> = {
  中石油招投标网: {
    sourceName: '中石油招投标网',
    owner: '小陈',
    access: 'login_required',
    primaryTool: 'local_browser',
    searchPlan: ['按日期查看最新公告', '关键词搜索历史重点产品', '分别检查招标公告、谈判采购公告、询价/竞价采购公告'],
    columnsToCheck: ['招标公告', '谈判采购公告', '询价(竞价)采购公告'],
    humanBarriers: ['SPA 页面', '登录态', '验证码', 'CA/账号验证', '公共接口不可直采'],
    productFocus: petrochemicalFocus,
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '公开搜索失败时打开入口，等待员工登录并进入对应公告列表后继续观察。',
  },
  云梦泽询价网: {
    sourceName: '云梦泽询价网',
    owner: '小陈/小白',
    access: 'login_required',
    primaryTool: 'local_browser',
    searchPlan: ['登录后查看招标采购和非招标采购', '非招采购需包含谈判采购和询比采购', '按化工助剂和历史产品关键词搜索'],
    columnsToCheck: ['招标采购', '非招标采购', '谈判采购', '询比采购'],
    humanBarriers: ['账号密码登录', '买标书确认', '详情/物料需登录'],
    productFocus: petrochemicalFocus,
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '识别到买标书、账号登录或详情无权限时 request_human。',
  },
  易派克: {
    sourceName: '易派克',
    owner: '小冯',
    access: 'public_then_login',
    primaryTool: 'public_search',
    searchPlan: ['先采公开招标公告列表', '按产品名称和招标单位筛选', '营业执照相关产品命中后进入详情确认代理商要求'],
    columnsToCheck: ['招标公告更多', '采购公告', '询价/询比/竞价类公告'],
    humanBarriers: ['详情、8 位码、买标和部分附件需要登录'],
    productFocus: [...petrochemicalFocus, '消泡剂', '分散剂'],
    searchDomains: ['ec.sinopec.com'],
    deepSearchTerms: publicPetrochemicalSearchTerms,
    deepSearchQueries: [
      'site:ec.sinopec.com/supp {terms} 招标公告 采购公告',
      'site:ec.sinopec.com/f/supp/notice {terms} 招标公告',
    ],
    browserSearchHints: ['公开首页可采最新公告；若全低相关，再按产品词搜索公开详情页或登录后站内检索。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '公开列表能采则先完成候选；详情需要登录时保留链接并 request_human。',
  },
  延长石油: {
    sourceName: '延长石油',
    owner: '小杨/小冯',
    access: 'public_then_login',
    primaryTool: 'local_browser',
    searchPlan: ['优先主站采购公告和非招业务', '用关键词或公司名称查找', '多入口失败时逐个入口尝试'],
    columnsToCheck: ['采购公告', '预审公告', '非招业务', '通知公告'],
    humanBarriers: ['主站登录', 'JS 渲染列表', '非招业务详情权限'],
    productFocus: ['白油', '凡士林脂', '抗静电剂', '阻聚剂', 'EDTA', '硅油'],
    searchDomains: ['zc.sxycpc.com', 'bulletin.sntba.com', 'ynhdzjj.ycynh.com'],
    deepSearchTerms: ['榆林延长', '白油', '凡士林脂', '抗静电剂', '阻聚剂', '硅油'],
    deepSearchQueries: [
      'site:zc.sxycpc.com 榆林延长 {terms} 采购 公告',
      'site:bulletin.sntba.com 延长石油 {terms} 招标 公告',
    ],
    browserSearchHints: ['静态入口多为 JS 列表；优先观察网络响应，失败后员工登录并进入非招业务/通知公告。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: 'JS 渲染无列表时观察网络响应；仍无候选则要求员工进入正确列表。',
  },
  华锦兵器网: {
    sourceName: '华锦兵器网',
    owner: '小魏',
    access: 'login_required',
    primaryTool: 'local_browser',
    searchPlan: ['登录后查招标采购和询价交易', '按日期和关键词筛选', '过滤平台公告和操作手册噪声'],
    columnsToCheck: ['招标采购', '询价交易'],
    humanBarriers: ['账号登录', '短信/验证码', '详情权限'],
    productFocus: ['消泡剂', '硅油', '四氯乙烯', '矿物油', '引发剂', '液氮', '阻聚剂', '抗静电剂'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '只看到平台公告/账号登录时 request_human；看到业务行再提取候选。',
  },
  隆道云: {
    sourceName: '隆道云',
    owner: '小魏',
    access: 'login_required',
    primaryTool: 'local_browser',
    searchPlan: ['登录后点击搜索/放大镜', '按关键词搜索招标/采购项目', '进入详情读取完整内容'],
    columnsToCheck: ['采购项目', '招标公告', '询价公告'],
    humanBarriers: ['登录后才可看详细内容'],
    productFocus: broadFocus,
    searchDomains: ['longdaoyun.com', 'ecg.longdaoyun.com', 'search-plus.longdaoyun.com'],
    deepSearchTerms: broadFocus,
    deepSearchQueries: [
      'site:ecg.longdaoyun.com {terms} 采购公告 招标公告',
      'site:longdaoyun.com {terms} 采购项目 公告',
    ],
    browserSearchHints: ['隆道公开搜索可能直达集团子站分页；登录后再确认详情、附件和供应商资格。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '未登录或详情不可见时 request_human。',
  },
  金能招标网: {
    sourceName: '金能招标网',
    owner: '小魏',
    access: 'login_required',
    primaryTool: 'local_browser',
    searchPlan: ['四类栏目都要看', '按日期优先，再按关键词复查', '一般相关较少，避免把公告噪声当商机'],
    columnsToCheck: ['公开招标', '招标采购', '直接定价', '竞价公告'],
    humanBarriers: ['登录', '内网页面异常'],
    productFocus: broadFocus,
    searchDomains: ['jinnengtech.com'],
    deepSearchTerms: broadFocus,
    deepSearchQueries: [
      'site:jinnengtech.com:6789/webportal/index/bidnotice/show {terms} 招标采购公告',
      'site:jinnengtech.com:6789 {terms} 公开招标 采购公告',
    ],
    browserSearchHints: ['金能公开搜索可直达 show/*.do 详情；需排除处置、再生、销售类项目。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '四类栏目均无命中时生成无新增结论。',
  },
  中化: {
    sourceName: '中化',
    owner: '小杨/小魏',
    access: 'login_required',
    primaryTool: 'local_browser',
    searchPlan: ['查看招标公告、采购公告、竞价公告', '标题输入关键词或按时间查看', '进入详情/附件确认硬性要求'],
    columnsToCheck: ['招标公告', '采购公告', '竞价公告'],
    humanBarriers: ['Vue SPA', '登录上下文', '网关接口直连失败'],
    productFocus: broadFocus,
    searchDomains: ['scm.esinochem.com'],
    deepSearchTerms: broadFocus,
    deepSearchQueries: [
      'site:scm.esinochem.com {terms} 招标公告 采购公告',
      'site:scm.esinochem.com {terms} 竞价 公告',
    ],
    browserSearchHints: ['Vue SPA 需要本地浏览器；公共搜索只作为入口发现，详情以登录态为准。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '公共采集失败时转本地浏览器登录态。',
  },
  中海油: {
    sourceName: '中海油',
    owner: '小杨/小陈',
    access: 'login_required',
    primaryTool: 'local_browser',
    searchPlan: ['查看招标公告和非招标公告', '筛选油田/炼化助剂和历史产品', '附件中硬性条件优先深读'],
    columnsToCheck: ['招标公告', '非招标公告'],
    humanBarriers: ['SPA', '维护占位页', '登录/详情权限'],
    productFocus: [...petrochemicalFocus, '焦亚硫酸钠', '亚硫酸钠'],
    searchDomains: ['bid.cnooc.com.cn'],
    deepSearchTerms: [...petrochemicalFocus, '焦亚硫酸钠', '亚硫酸钠'],
    deepSearchQueries: [
      'site:bid.cnooc.com.cn {terms} 招标公告 非招标公告',
      'site:bid.cnooc.com.cn {terms} 采购 公告',
    ],
    browserSearchHints: ['公共页面可能返回维护占位；员工网络能打开时优先在本地浏览器看招标/非招标公告。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '公共接口返回维护页时直接使用本地浏览器。',
  },
  国能E招: {
    sourceName: '国能E招',
    owner: '小杨/小陈',
    access: 'public',
    primaryTool: 'public_search',
    searchPlan: ['采公开招标公告和非招标公告', '优先货物类和化工/煤化工相关公告', '弱通用词必须进详情确认'],
    columnsToCheck: ['招标公告', '非招标公告'],
    humanBarriers: ['详情页异常', '附件下载限制'],
    productFocus: ['焦亚硫酸钠', '亚硫酸钠', '起泡剂', '捕收剂', '消泡剂', '阻聚剂', '抗静电剂', '硫酸亚铁', '水处理剂'],
    searchDomains: ['chnenergybidding.com.cn'],
    deepSearchTerms: guonengSearchTerms,
    deepSearchQueries: [
      'site:chnenergybidding.com.cn/bidweb {terms} 招标公告 采购公告',
      'site:chnenergybidding.com.cn/bidweb {terms} 非招标公告 询价 竞价',
    ],
    browserSearchHints: ['公开列表只代表最新公告；全低相关时必须按产品词查历史/详情，并排除竞价销售和中标公示。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '公开列表可用时不要求登录；详情失败再转本地助手。',
  },
  国能E购: {
    sourceName: '国能E购',
    owner: '小杨/小陈',
    access: 'public',
    primaryTool: 'public_json',
    searchPlan: ['优先读公开 JSON/feed', '查看询价采购、竞价、竞争性谈判', '抽发布时间、报价截止和采购区域'],
    columnsToCheck: ['询价采购公告', '竞价公告', '竞争性谈判公告'],
    humanBarriers: ['详情页异常', '附件下载限制'],
    productFocus: ['焦亚硫酸钠', '亚硫酸钠', '起泡剂', '捕收剂', '消泡剂', '阻聚剂', '抗静电剂', '化工助剂'],
    searchDomains: ['neep.shop', 'gd-prod.cn-beijing.oss.aliyuncs.com'],
    deepSearchTerms: guonengSearchTerms,
    deepSearchQueries: [
      'site:gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/article {terms} 询价采购',
      'site:neep.shop {terms} 询价 竞价 竞争性谈判',
    ],
    browserSearchHints: ['公开 OSS JSON 只给最新 10 条/栏目；全低相关时查 OSS article 历史页或登录后站内搜索。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: 'JSON/feed 无数据时打开页面观察渲染结果。',
  },
  国能网: {
    sourceName: '国能网',
    owner: '小杨',
    access: 'public',
    primaryTool: 'public_search',
    searchPlan: ['覆盖国能E招和国能E购', '按公告类型进入对应列表', '生成分来源结论'],
    columnsToCheck: ['国能E招', '国能E购'],
    humanBarriers: ['详情页异常', '附件限制'],
    productFocus: ['焦亚硫酸钠', '亚硫酸钠', '起泡剂', '捕收剂', '消泡剂', '阻聚剂', '抗静电剂', '硫酸亚铁', '化工助剂'],
    searchDomains: ['chnenergybidding.com.cn', 'neep.shop', 'gd-prod.cn-beijing.oss.aliyuncs.com'],
    deepSearchTerms: guonengSearchTerms,
    deepSearchQueries: [
      'site:chnenergybidding.com.cn/bidweb {terms} 招标公告 非招标公告',
      'site:gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/article {terms} 询价采购 竞价',
    ],
    browserSearchHints: ['国能网应拆 E招/E购两条链路；不能用一个首页最新列表代表全部结果。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '无法判断来源时拆成国能E招和国能E购两个任务。',
  },
  裕龙招投标网: {
    sourceName: '裕龙招投标网',
    owner: '小白',
    access: 'public_then_login',
    primaryTool: 'local_browser',
    searchPlan: ['优先打开中国招标投标公共服务平台裕龙石化搜索页', '出现网易盾/访问验证时 request_human', '员工验证后在可见列表中按裕龙石化和产品关键词筛选', '进入详情确认公告正文、附件和供应商资格'],
    columnsToCheck: ['搜索结果', '招标公告', '采购公告', '详情页'],
    humanBarriers: ['网易安全验证', '阿里前端反爬脚本', '搜索接口 DES 加密响应', '直连接口返回反爬 HTML'],
    productFocus: [...petrochemicalFocus, '催化剂', '化工助剂'],
    searchDomains: ['ctbpsp.com', 'bulletin.cebpubservice.com'],
    deepSearchTerms: ['裕龙石化', ...publicPetrochemicalSearchTerms, '催化剂', '化工助剂'],
    deepSearchQueries: [
      'site:ctbpsp.com 裕龙石化 {terms} 招标公告',
      'site:bulletin.cebpubservice.com 裕龙石化 {terms} 招标公告',
      'site:ctbpsp.com 裕龙石化 {terms} 采购 公告',
    ],
    browserSearchHints: [
      '公开搜索通常无索引，不能把无结果当无新增。',
      '站点前端接口为 /cutominfoapi/searchkeyword?关键词，响应由 DES-ECB key=1qaz@wsx3e 加密；直连常返回反爬 HTML。',
      '员工完成网易盾/访问验证后，保留在搜索结果页，优先读取 noticeName、bulletinSource、noticeSendTime、bulletinID 字段或页面可见列表。',
    ],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '不能把平台首页噪声当无新增；公开搜索或直连接口失败后必须转本地浏览器并在安全验证处 request_human。',
  },
  东华能源网: {
    sourceName: '东华能源网',
    owner: '小杨',
    access: 'missing_entry',
    primaryTool: 'manual',
    searchPlan: ['当前资料缺入口 URL', '需要员工补充网址或手动打开公告页'],
    columnsToCheck: ['待补充'],
    humanBarriers: ['入口缺失'],
    productFocus: petrochemicalFocus,
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: ['补齐入口后再执行站点采集', ...COMMON_FINISH],
    fallbackPlan: '创建任务时提示补充 URL，不进行空 URL 导航。',
  },
};

export const siteCollectionSkillFor = (sourceName = ''): SiteCollectionSkill => (
  SITE_COLLECTION_SKILLS[sourceName] || {
    sourceName: sourceName || '本地采集站点',
    owner: '未指定',
    access: 'login_required',
    primaryTool: 'local_browser',
    searchPlan: ['按站点入口打开', '按搜索词查公告列表', '进入详情或附件确认硬性要求'],
    columnsToCheck: ['招标公告', '采购公告', '询价公告'],
    humanBarriers: ['登录', '验证码', '短信', 'CA', '详情权限'],
    productFocus: broadFocus,
    deepSearchTerms: broadFocus,
    browserSearchHints: ['通用策略：先公开搜索，再本地浏览器按产品词搜索，无法进入详情时 request_human。'],
    requiredExtraction: COMMON_REQUIRED_EXTRACTION,
    finishCriteria: COMMON_FINISH,
    fallbackPlan: '通用站点：公开入口失败或无候选时要求员工进入正确列表后继续。',
  }
);

export const siteCollectionSkillPromptFor = (sourceName = '') => {
  const skill = siteCollectionSkillFor(sourceName);
  return [
    `站点：${skill.sourceName}`,
    `负责人：${skill.owner}`,
    `访问方式：${skill.access}；优先工具：${skill.primaryTool}`,
    `要看栏目：${skill.columnsToCheck.join('、')}`,
    `搜索计划：${skill.searchPlan.join('；')}`,
    `重点产品：${skill.productFocus.join('、')}`,
    skill.deepSearchTerms?.length ? `深搜关键词：${skill.deepSearchTerms.join('、')}` : '',
    skill.deepSearchQueries?.length ? `深搜模板：${skill.deepSearchQueries.join('；')}` : '',
    skill.browserSearchHints?.length ? `浏览器搜索提示：${skill.browserSearchHints.join('；')}` : '',
    `人工接管触发：${skill.humanBarriers.join('、')}`,
    `必须抽取：${skill.requiredExtraction.join('；')}`,
    `完成标准：${skill.finishCriteria.join('；')}`,
    `失败兜底：${skill.fallbackPlan}`,
  ].join('\n');
};
