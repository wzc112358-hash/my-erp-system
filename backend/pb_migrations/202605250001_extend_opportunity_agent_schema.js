/// <reference path="../pb_data/types.d.ts" />

const textField = (name, required = false) => new Field({
  name,
  type: "text",
  required,
});

const boolField = (name) => new Field({
  name,
  type: "bool",
});

const numberField = (name) => new Field({
  name,
  type: "number",
  onlyInt: false,
});

const dateField = (name) => new Field({
  name,
  type: "date",
});

const selectField = (name, values, required = false) => new Field({
  name,
  type: "select",
  maxSelect: 1,
  values,
  required,
});

const relationField = (name, collectionId, required = false) => new Field({
  name,
  type: "relation",
  collectionId,
  maxSelect: 1,
  minSelect: 0,
  cascadeDelete: false,
  required,
});

const addFieldIfMissing = (collection, field) => {
  if (!collection.fields.getByName(field.name)) {
    collection.fields.add(field);
  }
};

const removeField = (collection, name) => {
  collection.fields.removeByName(name);
};

const saveCollection = (app, collection) => {
  app.save(collection);
};

const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
};

const createProductTermsCollection = () => new Collection({
  name: "product_terms",
  type: "base",
  system: false,
  listRule: "@request.auth.id != ''",
  viewRule: "@request.auth.id != ''",
  createRule: "@request.auth.type = 'manager'",
  updateRule: "@request.auth.type = 'manager'",
  deleteRule: "@request.auth.type = 'manager'",
  indexes: [
    "CREATE UNIQUE INDEX idx_product_terms_term ON product_terms (term)",
    "CREATE INDEX idx_product_terms_status ON product_terms (status)",
  ],
  fields: [
    textField("term", true),
    selectField("term_type", ["erp_history", "chat_history", "curated", "alias", "feedback_positive", "feedback_negative"], true),
    textField("source"),
    numberField("weight"),
    textField("aliases"),
    selectField("status", ["active", "paused"]),
  ],
});

const createAgentTasksCollection = (monitorSources, monitorRuns, opportunities) => new Collection({
  name: "agent_tasks",
  type: "base",
  system: false,
  listRule: "@request.auth.id != ''",
  viewRule: "@request.auth.id != ''",
  createRule: "@request.auth.type = 'manager'",
  updateRule: "@request.auth.id != ''",
  deleteRule: "@request.auth.type = 'manager'",
  indexes: [
    "CREATE INDEX idx_agent_tasks_status ON agent_tasks (status)",
    "CREATE INDEX idx_agent_tasks_owner ON agent_tasks (owner_name)",
    "CREATE INDEX idx_agent_tasks_created ON agent_tasks (created)",
  ],
  fields: [
    relationField("source", monitorSources.id),
    relationField("monitor_run", monitorRuns.id),
    relationField("opportunity", opportunities.id),
    textField("source_name", true),
    textField("owner_name", true),
    selectField("task_type", ["manual_assist", "local_helper", "document_upload", "captcha", "purchase_document"], true),
    selectField("status", ["pending", "in_progress", "request_human", "completed", "failed", "cancelled"]),
    textField("reason"),
    textField("required_artifact"),
    dateField("due_at"),
    textField("result_summary"),
    textField("uploaded_artifacts"),
  ],
});

migrate((app) => {
  const monitorSources = app.findCollectionByNameOrId("monitor_sources");
  const opportunities = app.findCollectionByNameOrId("bid_opportunities");
  const documents = app.findCollectionByNameOrId("bid_documents");
  const monitorRuns = app.findCollectionByNameOrId("monitor_runs");

  [
    textField("category_names"),
    textField("category_urls"),
    selectField("crawl_strategy", ["http_html", "http_json", "playwright_dom", "playwright_network", "manual_assist", "local_helper"]),
    selectField("site_search_behavior", ["none", "supplemental", "primary"]),
    textField("credential_ref"),
    textField("manual_assist_reason"),
  ].forEach((field) => addFieldIfMissing(monitorSources, field));
  saveCollection(app, monitorSources);

  [
    numberField("relevance_score"),
    textField("matched_terms"),
    textField("matched_sources"),
    textField("evidence_text"),
    textField("negative_terms"),
    textField("classification_version"),
    boolField("needs_human_check"),
    textField("confirmation_package"),
    textField("recommended_action"),
    dateField("quote_ready_at"),
  ].forEach((field) => addFieldIfMissing(opportunities, field));
  saveCollection(app, opportunities);

  [
    textField("extracted_text"),
    selectField("extraction_status", ["pending", "parsed", "empty", "failed"]),
    textField("evidence_text"),
    textField("parse_summary"),
  ].forEach((field) => addFieldIfMissing(documents, field));
  saveCollection(app, documents);

  if (!findCollection(app, "product_terms")) {
    saveCollection(app, createProductTermsCollection());
  }

  if (!findCollection(app, "agent_tasks")) {
    saveCollection(app, createAgentTasksCollection(monitorSources, monitorRuns, opportunities));
  }
}, (app) => {
  const monitorSources = findCollection(app, "monitor_sources");
  if (monitorSources) {
    ["category_names", "category_urls", "crawl_strategy", "site_search_behavior", "credential_ref", "manual_assist_reason"].forEach((name) => removeField(monitorSources, name));
    saveCollection(app, monitorSources);
  }

  const opportunities = findCollection(app, "bid_opportunities");
  if (opportunities) {
    ["relevance_score", "matched_terms", "matched_sources", "evidence_text", "negative_terms", "classification_version", "needs_human_check", "confirmation_package", "recommended_action", "quote_ready_at"].forEach((name) => removeField(opportunities, name));
    saveCollection(app, opportunities);
  }

  const documents = findCollection(app, "bid_documents");
  if (documents) {
    ["extracted_text", "extraction_status", "evidence_text", "parse_summary"].forEach((name) => removeField(documents, name));
    saveCollection(app, documents);
  }

  ["agent_tasks", "product_terms"].forEach((name) => {
    const collection = findCollection(app, name);
    if (collection) app.delete(collection);
  });
});
