/// <reference path="../pb_data/types.d.ts" />

const sources = [
  {
    source_name: "中石油招投标网",
    owner_name: "小陈",
    source_url: "https://www.cnpcbidding.com/#/tenders",
    login_type: "manual",
    requires_login: true,
    may_have_captcha: true,
    category_names: "招标公告,谈判采购公告,询价(竞价)采购公告",
    crawl_strategy: "playwright_network",
    site_search_behavior: "supplemental",
    manual_assist_reason: "公开入口为 JS 应用；登录详情、验证码、买标书或附件下载需要人工协助。",
  },
  {
    source_name: "云梦泽询价网",
    owner_name: "小陈",
    source_url: "https://www.ymzec.com/bid/web-outportal/index.html#/home--",
    login_type: "account",
    requires_login: true,
    may_have_captcha: false,
    category_names: "招标采购,非招标采购,谈判采购,询比采购",
    crawl_strategy: "manual_assist",
    site_search_behavior: "supplemental",
    manual_assist_reason: "需要账号登录，买标书和详情材料由员工协助获取。",
  },
  {
    source_name: "能源一号（兰州恒化成）",
    owner_name: "小陈",
    login_type: "account",
    requires_login: true,
    may_have_captcha: true,
    category_names: "群内招标信息,账号内招标信息",
    crawl_strategy: "manual_assist",
    site_search_behavior: "none",
    manual_assist_reason: "第一阶段不自动读取个人微信群；由员工粘贴或上传资料。",
  },
  {
    source_name: "华锦兵器网",
    owner_name: "小魏",
    source_url: "https://www.norincogroup-ebuy.com/",
    login_type: "manual",
    requires_login: true,
    may_have_captcha: true,
    category_names: "招标采购,询价交易",
    crawl_strategy: "playwright_network",
    site_search_behavior: "supplemental",
    manual_assist_reason: "公开列表优先自动发现；登录详情和附件由人工协助。",
  },
  {
    source_name: "易派克",
    owner_name: "小冯",
    source_url: "https://ec.sinopec.com/supp/index.shtml",
    login_type: "account",
    requires_login: true,
    may_have_captcha: true,
    category_names: "公开公告,询价公告,竞价公告",
    crawl_strategy: "playwright_network",
    site_search_behavior: "supplemental",
    manual_assist_reason: "账号内容、8位码和材料详情需要人工协助确认。",
  },
  {
    source_name: "延长石油",
    owner_name: "小杨",
    source_url: "https://zc.sxycpc.com/ebidPortal/menu0002.html",
    login_type: "manual",
    requires_login: false,
    may_have_captcha: false,
    category_names: "采购公告,竞价公告,招标公告",
    category_urls: "https://zc.sxycpc.com/ebidPortal/menu0002.html,http://bulletin.sntba.com/",
    crawl_strategy: "playwright_dom",
    site_search_behavior: "supplemental",
    manual_assist_reason: "部分入口不稳定，失败时保留错误证据并提醒负责人。",
  },
  {
    source_name: "能源一号（天津宜远）",
    owner_name: "小杨",
    login_type: "account",
    requires_login: true,
    may_have_captcha: true,
    category_names: "群内招标信息,账号内招标信息",
    crawl_strategy: "manual_assist",
    site_search_behavior: "none",
    manual_assist_reason: "第一阶段不自动读取个人微信群；由员工粘贴或上传资料。",
  },
  {
    source_name: "中化",
    owner_name: "小杨",
    source_url: "https://scm.esinochem.com/",
    login_type: "manual",
    requires_login: false,
    may_have_captcha: false,
    category_names: "招标公告,采购公告,竞价公告",
    crawl_strategy: "playwright_network",
    site_search_behavior: "supplemental",
    manual_assist_reason: "JS 应用优先发现网络接口；站内标题搜索只作补充。",
  },
  {
    source_name: "东华能源网",
    owner_name: "小杨",
    login_type: "manual",
    requires_login: false,
    may_have_captcha: false,
    category_names: "待确认",
    crawl_strategy: "manual_assist",
    site_search_behavior: "supplemental",
    manual_assist_reason: "资料中未提供具体入口，执行前需要人工确认。",
  },
  {
    source_name: "国能网",
    owner_name: "小杨",
    source_url: "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html",
    login_type: "manual",
    requires_login: false,
    may_have_captcha: false,
    category_names: "国能E招-招标公告,国能E招-非招标公告,国能E购-询价采购公告,国能E购-竞价公告,国能E购-竞争性谈判公告",
    category_urls: "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html,https://neep.shop/html/portal/index-Inquiries.html",
    crawl_strategy: "http_html",
    site_search_behavior: "supplemental",
    manual_assist_reason: "",
  },
  {
    source_name: "中海油",
    owner_name: "小杨",
    source_url: "https://bid.cnooc.com.cn/home/#/navigation",
    login_type: "manual",
    requires_login: true,
    may_have_captcha: true,
    category_names: "招标公告,非招标公告",
    crawl_strategy: "playwright_network",
    site_search_behavior: "supplemental",
    manual_assist_reason: "JS 应用；登录或附件详情需要人工协助。",
  },
  {
    source_name: "裕龙招投标网",
    owner_name: "小白",
    login_type: "none",
    requires_login: false,
    may_have_captcha: false,
    category_names: "中国招标投标公共服务平台-裕龙石化搜索",
    crawl_strategy: "http_html",
    site_search_behavior: "primary",
    manual_assist_reason: "",
  },
  {
    source_name: "能源一号（北京恒化成）",
    owner_name: "小白",
    login_type: "account",
    requires_login: true,
    may_have_captcha: true,
    category_names: "群内招标信息,账号内招标信息",
    crawl_strategy: "manual_assist",
    site_search_behavior: "none",
    manual_assist_reason: "第一阶段不自动读取个人微信群；由员工粘贴或上传资料。",
  },
];

migrate((app) => {
  const collection = app.findCollectionByNameOrId("monitor_sources");
  for (const source of sources) {
    const record = new Record(collection);
    record.set("source_name", source.source_name);
    record.set("owner_name", source.owner_name);
    record.set("source_url", source.source_url || "");
    record.set("login_type", source.login_type);
    record.set("requires_login", source.requires_login);
    record.set("may_have_captcha", source.may_have_captcha);
    record.set("schedule_times", "09:00,12:00,15:00,17:30");
    record.set("keywords", "缓蚀剂,阻垢剂,缓蚀阻垢剂,杀菌剂,絮凝剂,聚丙烯酰胺,破乳剂,消泡剂,焦亚硫酸钠,抗静电剂,阻聚剂,表面活性剂,紫外线吸收剂,硝化抑制剂,起泡剂,捕收剂,化工助剂,油田助剂,水处理剂");
    record.set("product_scope", "化工类助剂及公司常做产品；需要检查代理商投标、第三方检测、业绩、8位码、危化品资质等硬性要求。");
    record.set("category_names", source.category_names || "");
    record.set("category_urls", source.category_urls || "");
    record.set("crawl_strategy", source.crawl_strategy || "http_html");
    record.set("site_search_behavior", source.site_search_behavior || "supplemental");
    record.set("manual_assist_reason", source.manual_assist_reason || "");
    record.set("status", source.crawl_strategy === "manual_assist" ? "manual_required" : "active");
    app.save(record);
  }
}, (app) => {
  for (const source of sources) {
    try {
      const record = app.findFirstRecordByFilter("monitor_sources", `source_name = "${source.source_name}"`);
      if (record) app.delete(record);
    } catch {
      // already removed
    }
  }
});
