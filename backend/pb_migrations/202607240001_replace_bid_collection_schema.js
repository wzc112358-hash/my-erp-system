/// <reference path="../pb_data/types.d.ts" />

const idField = () => ({
  autogeneratePattern: "[a-z0-9]{15}", hidden: false, id: "text3208210256", max: 15, min: 15,
  name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true, required: true,
  system: true, type: "text",
});

const textField = (id, name, required = false) => ({
  autogeneratePattern: "", hidden: false, id, max: 0, min: 0, name, pattern: "",
  presentable: false, primaryKey: false, required, system: false, type: "text",
});

const boolField = (id, name) => ({
  hidden: false, id, name, presentable: false, required: false, system: false, type: "bool",
});

const numberField = (id, name) => ({
  hidden: false, id, max: null, min: null, name, onlyInt: true, presentable: false,
  required: false, system: false, type: "number",
});

const dateField = (id, name, required = false) => ({
  hidden: false, id, max: "", min: "", name, presentable: false, required, system: false, type: "date",
});

const selectField = (id, name, values, required = false) => ({
  hidden: false, id, maxSelect: 1, name, presentable: false, required, system: false, type: "select", values,
});

const relationField = (id, name, collectionId, required = false) => ({
  cascadeDelete: false, collectionId, hidden: false, id, maxSelect: 1, minSelect: required ? 1 : 0,
  name, presentable: false, required, system: false, type: "relation",
});

const createdField = () => ({
  hidden: false, id: "autodate2990389176", name: "created", onCreate: true, onUpdate: false,
  presentable: false, system: false, type: "autodate",
});

const updatedField = () => ({
  hidden: false, id: "autodate3332085495", name: "updated", onCreate: true, onUpdate: true,
  presentable: false, system: false, type: "autodate",
});

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

const SOURCE_SEEDS = [
  ["guoneng-egou", "国能E购", true],
  ["guoneng-ebid", "国能E招", true],
  ["cnooc", "中国海油供应链平台", true],
  ["epec", "易派克", true],
  ["sinochem", "中化采购供应链平台", true],
  ["ymz", "云梦泽智慧平台", true],
  ["yanchang", "延长石油招采网", true],
  ["longdao", "隆道云", true],
  ["jinneng", "金能科技采购平台", true],
  ["norinco-public", "兵器网", true],
  ["yulong", "裕龙招投标网", false],
  ["cnpc", "中国石油招标投标网", false],
];

migrate((app) => {
  // Old opportunity collections are empty and their employee review workflow
  // is intentionally replaced by the read-only bid information feed.
  [
    "opportunity_reviews",
    "bid_documents",
    "bid_opportunities",
    "monitor_runs",
    "monitor_sources",
    "product_terms",
  ].forEach((name) => deleteCollectionIfExists(app, name));

  const sources = new Collection({
    id: "pbc_bid_sources",
    name: "bid_sources",
    type: "base",
    system: false,
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX idx_bid_sources_key ON bid_sources (source_key)",
      "CREATE UNIQUE INDEX idx_bid_sources_name ON bid_sources (source_name)",
    ],
    fields: [
      idField(),
      textField("text_bid_source_key", "source_key", true),
      textField("text_bid_source_name", "source_name", true),
      boolField("bool_bid_source_enabled", "enabled"),
      textField("text_bid_schedule", "schedule_time", true),
      dateField("date_bid_source_last_run", "last_run_at"),
      selectField("select_bid_source_status", "last_status", ["never", "running", "success", "partial", "failed"], true),
      textField("text_bid_source_error", "last_error"),
      createdField(),
      updatedField(),
    ],
  });
  app.save(sources);

  const runs = new Collection({
    id: "pbc_bid_runs_v2",
    name: "bid_collection_runs",
    type: "base",
    system: false,
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX idx_bid_runs_key ON bid_collection_runs (run_key)",
      "CREATE INDEX idx_bid_runs_date ON bid_collection_runs (run_date)",
    ],
    fields: [
      idField(),
      textField("text_bid_run_key", "run_key", true),
      relationField("relation_bid_run_source", "source", sources.id, true),
      textField("text_bid_run_source_key", "source_key", true),
      textField("text_bid_run_source_name", "source_name", true),
      dateField("date_bid_run_date", "run_date", true),
      dateField("date_bid_run_started", "started_at"),
      dateField("date_bid_run_finished", "finished_at"),
      selectField("select_bid_run_status", "status", ["running", "success", "no_new", "partial", "failed"], true),
      numberField("number_bid_run_raw", "raw_count"),
      numberField("number_bid_run_eligible", "eligible_count"),
      numberField("number_bid_run_current", "current_count"),
      numberField("number_bid_run_attention", "attention_count"),
      numberField("number_bid_run_new", "new_count"),
      numberField("number_bid_run_updated", "updated_count"),
      numberField("number_bid_run_duplicate", "duplicate_count"),
      numberField("number_bid_run_excluded", "excluded_count"),
      textField("text_bid_run_summary", "summary"),
      textField("text_bid_run_discovery", "discovery_stats"),
      textField("text_bid_run_error", "error_message"),
      createdField(),
      updatedField(),
    ],
  });
  app.save(runs);

  const notices = new Collection({
    id: "pbc_bid_notices",
    name: "bid_notices",
    type: "base",
    system: false,
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX idx_bid_notices_fingerprint ON bid_notices (fingerprint)",
      "CREATE INDEX idx_bid_notices_kind ON bid_notices (kind)",
      "CREATE INDEX idx_bid_notices_source ON bid_notices (source_key)",
      "CREATE INDEX idx_bid_notices_first_seen ON bid_notices (first_seen_at)",
      "CREATE INDEX idx_bid_notices_last_seen ON bid_notices (last_seen_at)",
    ],
    fields: [
      idField(),
      relationField("relation_bid_notice_source", "source", sources.id, true),
      textField("text_bid_notice_source_key", "source_key", true),
      textField("text_bid_notice_source_name", "source_name", true),
      textField("text_bid_notice_fingerprint", "fingerprint", true),
      textField("text_bid_notice_content_hash", "content_hash", true),
      textField("text_bid_notice_external_id", "external_id"),
      selectField("select_bid_notice_kind", "kind", ["current", "attention"], true),
      textField("text_bid_notice_title", "title", true),
      textField("text_bid_notice_url", "url", true),
      textField("text_bid_notice_canonical_url", "canonical_url", true),
      textField("text_bid_notice_buyer", "buyer_name"),
      dateField("date_bid_notice_published", "published_at"),
      dateField("date_bid_notice_deadline", "deadline_at"),
      textField("text_bid_notice_products", "matched_products"),
      textField("text_bid_notice_judgment", "judgment"),
      textField("text_bid_notice_requirements", "requirements"),
      textField("text_bid_notice_missing", "missing_info"),
      textField("text_bid_notice_evidence", "evidence"),
      textField("text_bid_notice_read_method", "detail_read_method"),
      textField("text_bid_notice_attachments", "attachment_urls"),
      dateField("date_bid_notice_first_seen", "first_seen_at", true),
      dateField("date_bid_notice_last_seen", "last_seen_at", true),
      dateField("date_bid_notice_last_changed", "last_changed_at", true),
      createdField(),
      updatedField(),
    ],
  });
  app.save(notices);

  for (const [sourceKey, sourceName, enabled] of SOURCE_SEEDS) {
    const source = new Record(sources);
    source.set("source_key", sourceKey);
    source.set("source_name", sourceName);
    source.set("enabled", enabled);
    source.set("schedule_time", "08:00");
    source.set("last_status", "never");
    app.save(source);
  }
}, (app) => {
  ["bid_notices", "bid_collection_runs", "bid_sources"].forEach((name) => deleteCollectionIfExists(app, name));
  // The removed employee-review schema is intentionally not recreated by the
  // down migration. Production data is backed up before applying this change.
});
