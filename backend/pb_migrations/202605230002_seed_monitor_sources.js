/// <reference path="../pb_data/types.d.ts" />

const sources = [
  {
    source_name: "国能网",
    owner_name: "小杨",
    source_url: "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html",
    login_type: "none",
    requires_login: false,
    may_have_captcha: false,
    category_names: "国能E招-招标公告,国能E招-非招标公告,国能E购-询价采购公告,国能E购-竞价公告,国能E购-竞争性谈判公告",
    category_urls: "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html,https://www.chnenergybidding.com.cn/bidweb/001/001003/moreinfo.html,https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireOne/index.json,https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireBidding/index.json,https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireSix/index.json",
    crawl_strategy: "http_html",
    site_search_behavior: "supplemental",
    manual_assist_reason: "",
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
