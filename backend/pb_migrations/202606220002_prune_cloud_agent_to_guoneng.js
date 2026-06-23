/// <reference path="../pb_data/types.d.ts" />

const GUONENG_SOURCE_NAMES = ["国能网", "国能E招", "国能E购"];
const GUONENG_CATEGORY_NAMES = "国能E招-招标公告,国能E招-非招标公告,国能E购-询价采购公告,国能E购-竞价公告,国能E购-竞争性谈判公告";
const GUONENG_CATEGORY_URLS = [
  "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html",
  "https://www.chnenergybidding.com.cn/bidweb/001/001003/moreinfo.html",
  "https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireOne/index.json",
  "https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireBidding/index.json",
  "https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireSix/index.json",
].join(",");

const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
};

const deleteCollectionIfExists = (app, name) => {
  const collection = findCollection(app, name);
  if (collection) app.delete(collection);
};

const deleteRecordsByFilter = (app, collectionName, filter) => {
  if (!findCollection(app, collectionName)) return;
  while (true) {
    const records = app.findRecordsByFilter(collectionName, filter, "", 100, 0);
    if (!records.length) break;
    for (const record of records) {
      app.delete(record);
    }
  }
};

const isGuonengName = (value) => GUONENG_SOURCE_NAMES.includes(String(value || ""));

const pruneNonGuonengDocuments = (app) => {
  if (!findCollection(app, "bid_documents") || !findCollection(app, "bid_opportunities")) return;
  const removable = [];
  let offset = 0;
  while (true) {
    const records = app.findRecordsByFilter("bid_documents", 'id != ""', "", 100, offset);
    if (!records.length) break;
    for (const record of records) {
      const opportunityId = record.getString("opportunity");
      if (!opportunityId) {
        removable.push(record);
        continue;
      }
      try {
        const opportunity = app.findRecordById("bid_opportunities", opportunityId);
        if (!isGuonengName(opportunity.getString("source_name"))) removable.push(record);
      } catch {
        removable.push(record);
      }
    }
    offset += records.length;
  }
  for (const record of removable) {
    app.delete(record);
  }
};

const updateGuonengSources = (app) => {
  if (!findCollection(app, "monitor_sources")) return;
  const sources = app.findRecordsByFilter("monitor_sources", 'source_name = "国能网" || source_name = "国能E招" || source_name = "国能E购"', "", 100, 0);
  for (const source of sources) {
    source.set("source_url", "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html");
    source.set("login_type", "none");
    source.set("requires_login", false);
    source.set("may_have_captcha", false);
    source.set("category_names", GUONENG_CATEGORY_NAMES);
    source.set("category_urls", GUONENG_CATEGORY_URLS);
    source.set("crawl_strategy", "http_html");
    source.set("site_search_behavior", "supplemental");
    source.set("manual_assist_reason", "");
    source.set("status", "active");
    app.save(source);
  }
};

migrate((app) => {
  pruneNonGuonengDocuments(app);
  deleteRecordsByFilter(app, "bid_opportunities", 'source_name != "国能网" && source_name != "国能E招" && source_name != "国能E购"');
  deleteRecordsByFilter(app, "monitor_runs", 'source_name != "国能网" && source_name != "国能E招" && source_name != "国能E购"');
  deleteRecordsByFilter(app, "monitor_sources", 'source_name != "国能网" && source_name != "国能E招" && source_name != "国能E购"');
  updateGuonengSources(app);

  [
    "agent_artifacts",
    "local_agent_steps",
    "local_helper_runs",
    "agent_tasks",
    "local_helper_devices",
    "agent_login_sessions",
  ].forEach((name) => deleteCollectionIfExists(app, name));
}, (app) => {
  // The cleanup is intentionally not reversible: removed cloud-assist data was
  // old operational noise and production databases are backed up before deploy.
  updateGuonengSources(app);
});
