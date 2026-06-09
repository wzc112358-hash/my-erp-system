/// <reference path="../pb_data/types.d.ts" />

const idField = () => ({
  "autogeneratePattern": "[a-z0-9]{15}",
  "hidden": false,
  "id": "text3208210256",
  "max": 15,
  "min": 15,
  "name": "id",
  "pattern": "^[a-z0-9]+$",
  "presentable": false,
  "primaryKey": true,
  "required": true,
  "system": true,
  "type": "text"
});

const textField = (id, name, required = false) => ({
  "autogeneratePattern": "",
  "hidden": false,
  id,
  "max": 0,
  "min": 0,
  name,
  "pattern": "",
  "presentable": false,
  "primaryKey": false,
  required,
  "system": false,
  "type": "text"
});

const boolField = (id, name) => ({
  "hidden": false,
  id,
  name,
  "presentable": false,
  "required": false,
  "system": false,
  "type": "bool"
});

const numberField = (id, name) => ({
  "hidden": false,
  id,
  "max": null,
  "min": null,
  name,
  "onlyInt": true,
  "presentable": false,
  "required": false,
  "system": false,
  "type": "number"
});

const dateField = (id, name) => ({
  "hidden": false,
  id,
  "max": "",
  "min": "",
  name,
  "presentable": false,
  "required": false,
  "system": false,
  "type": "date"
});

const selectField = (id, name, values, required = false) => ({
  "hidden": false,
  id,
  "maxSelect": 1,
  name,
  "presentable": false,
  required,
  "system": false,
  "type": "select",
  values,
});

const relationField = (id, name, collectionId, required = false) => ({
  "cascadeDelete": false,
  collectionId,
  "hidden": false,
  id,
  "maxSelect": 1,
  "minSelect": 0,
  name,
  "presentable": false,
  required,
  "system": false,
  "type": "relation"
});

const createdField = () => ({
  "hidden": false,
  "id": "autodate2990389176",
  "name": "created",
  "onCreate": true,
  "onUpdate": false,
  "presentable": false,
  "system": false,
  "type": "autodate"
});

const updatedField = () => ({
  "hidden": false,
  "id": "autodate3332085495",
  "name": "updated",
  "onCreate": true,
  "onUpdate": true,
  "presentable": false,
  "system": false,
  "type": "autodate"
});

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const monitorSources = new Collection({
    "id": "pbc_mon_sources",
    "name": "monitor_sources",
    "type": "base",
    "system": false,
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": "@request.auth.type = 'manager'",
    "updateRule": "@request.auth.type = 'manager'",
    "deleteRule": "@request.auth.type = 'manager'",
    "indexes": [
      "CREATE INDEX idx_monitor_sources_owner ON monitor_sources (owner_name)",
      "CREATE UNIQUE INDEX idx_monitor_sources_name ON monitor_sources (source_name)"
    ],
    "fields": [
      idField(),
      textField("text_source_name", "source_name", true),
      textField("text_owner_name", "owner_name", true),
      relationField("rel_owner_user", "owner_user", users.id),
      textField("text_source_url", "source_url"),
      selectField("sel_login_type", "login_type", ["none", "account", "manual"]),
      boolField("bool_requires_login", "requires_login"),
      boolField("bool_may_have_captcha", "may_have_captcha"),
      textField("text_schedule_times", "schedule_times"),
      textField("text_keywords", "keywords"),
      textField("text_product_scope", "product_scope"),
      selectField("sel_source_status", "status", ["active", "paused", "manual_required"]),
      dateField("date_last_run", "last_run_at"),
      textField("text_last_result", "last_result"),
      textField("text_remark", "remark"),
      createdField(),
      updatedField(),
    ]
  });
  app.save(monitorSources);

  const monitorRuns = new Collection({
    "id": "pbc_mon_runs",
    "name": "monitor_runs",
    "type": "base",
    "system": false,
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": "@request.auth.type = 'manager'",
    "updateRule": "@request.auth.type = 'manager'",
    "deleteRule": "@request.auth.type = 'manager'",
    "indexes": ["CREATE INDEX idx_monitor_runs_created ON monitor_runs (created)"],
    "fields": [
      idField(),
      relationField("rel_run_source", "source", monitorSources.id),
      textField("text_source_name", "source_name", true),
      textField("text_owner_name", "owner_name", true),
      dateField("date_run_at", "run_at"),
      selectField("sel_run_status", "status", ["success", "failed", "no_new", "partial", "manual_required"]),
      numberField("num_found_count", "found_count"),
      numberField("num_related_count", "related_count"),
      textField("text_error_message", "error_message"),
      textField("text_group_summary", "group_summary"),
      createdField(),
      updatedField(),
    ]
  });
  app.save(monitorRuns);

  const opportunities = new Collection({
    "id": "pbc_bid_opps",
    "name": "bid_opportunities",
    "type": "base",
    "system": false,
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": "@request.auth.type = 'manager'",
    "updateRule": "@request.auth.id != ''",
    "deleteRule": "@request.auth.type = 'manager'",
    "indexes": [
      "CREATE UNIQUE INDEX idx_bid_opportunity_fingerprint ON bid_opportunities (fingerprint)",
      "CREATE INDEX idx_bid_opportunity_status ON bid_opportunities (status)",
      "CREATE INDEX idx_bid_opportunity_owner ON bid_opportunities (owner_name)"
    ],
    "fields": [
      idField(),
      relationField("rel_source", "source", monitorSources.id),
      relationField("rel_monitor_run", "monitor_run", monitorRuns.id),
      relationField("rel_responsible_user", "responsible_user", users.id),
      textField("text_source_name", "source_name", true),
      textField("text_owner_name", "owner_name", true),
      textField("text_title", "title", true),
      textField("text_url", "url"),
      textField("text_fingerprint", "fingerprint", true),
      dateField("date_publish", "publish_date"),
      dateField("date_deadline", "deadline_date"),
      textField("text_buyer_name", "buyer_name"),
      textField("text_product_keywords", "product_keywords"),
      selectField("sel_relevance", "relevance", ["likely_related", "needs_manual_review", "irrelevant"]),
      selectField("sel_status", "status", ["pending_review", "follow", "irrelevant", "needs_boss", "needs_documents", "expired", "converted"]),
      selectField("sel_urgency", "urgency", ["normal", "soon", "urgent", "unknown"]),
      textField("text_agent_summary", "agent_summary"),
      textField("text_hard_requirements", "hard_requirements"),
      textField("text_risk_flags", "risk_flags"),
      textField("text_employee_assessment", "employee_assessment"),
      textField("text_boss_decision", "boss_decision"),
      textField("text_group_summary", "group_summary"),
      textField("text_attachment_urls", "attachment_urls"),
      textField("text_raw_text", "raw_text"),
      createdField(),
      updatedField(),
    ]
  });
  app.save(opportunities);

  const documents = new Collection({
    "id": "pbc_bid_docs",
    "name": "bid_documents",
    "type": "base",
    "system": false,
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != ''",
    "deleteRule": "@request.auth.type = 'manager'",
    "indexes": ["CREATE INDEX idx_bid_documents_opportunity ON bid_documents (opportunity)"],
    "fields": [
      idField(),
      relationField("rel_doc_opportunity", "opportunity", opportunities.id, true),
      textField("text_title", "title", true),
      textField("text_url", "url"),
      textField("text_doc_type", "document_type"),
      textField("text_summary", "summary"),
      createdField(),
      updatedField(),
    ]
  });
  app.save(documents);

  const reviews = new Collection({
    "id": "pbc_opp_reviews",
    "name": "opportunity_reviews",
    "type": "base",
    "system": false,
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.type = 'manager'",
    "deleteRule": "@request.auth.type = 'manager'",
    "indexes": ["CREATE INDEX idx_opportunity_reviews_opportunity ON opportunity_reviews (opportunity)"],
    "fields": [
      idField(),
      relationField("rel_opportunity", "opportunity", opportunities.id, true),
      relationField("rel_reviewer", "reviewer", users.id),
      selectField("sel_review_type", "review_type", ["employee", "boss"]),
      selectField("sel_decision", "decision", ["follow", "irrelevant", "needs_boss", "needs_documents", "expired", "approved", "rejected"], true),
      textField("text_comment", "comment"),
      createdField(),
      updatedField(),
    ]
  });
  app.save(reviews);

  const auditLogs = new Collection({
    "id": "pbc_agent_logs",
    "name": "agent_audit_logs",
    "type": "base",
    "system": false,
    "listRule": "@request.auth.type = 'manager'",
    "viewRule": "@request.auth.type = 'manager'",
    "createRule": "@request.auth.type = 'manager'",
    "updateRule": null,
    "deleteRule": "@request.auth.type = 'manager'",
    "indexes": ["CREATE INDEX idx_agent_audit_logs_created ON agent_audit_logs (created)"],
    "fields": [
      idField(),
      textField("text_agent_name", "agent_name", true),
      textField("text_action", "action", true),
      textField("text_target_collection", "target_collection"),
      textField("text_target_id", "target_id"),
      textField("text_input_summary", "input_summary"),
      textField("text_output_summary", "output_summary"),
      textField("text_status", "status"),
      textField("text_error_message", "error_message"),
      createdField(),
      updatedField(),
    ]
  });
  app.save(auditLogs);
}, (app) => {
  const deleteCollection = (name) => {
    try {
      const collection = app.findCollectionByNameOrId(name);
      if (collection) app.delete(collection);
    } catch {
      // already removed
    }
  };

  [
    "agent_audit_logs",
    "opportunity_reviews",
    "bid_documents",
    "bid_opportunities",
    "monitor_runs",
    "monitor_sources",
  ].forEach(deleteCollection);
});
