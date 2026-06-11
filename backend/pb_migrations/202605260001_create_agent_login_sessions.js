/// <reference path="../pb_data/types.d.ts" />

const textField = (name, required = false) => new Field({
  name,
  type: "text",
  required,
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

const SESSION_STATUSES = ["not_started", "login_required", "active", "expired", "failed", "revoked"];

const createAgentLoginSessionsCollection = (monitorSources, users) => new Collection({
  name: "agent_login_sessions",
  type: "base",
  system: false,
  listRule: "@request.auth.id != ''",
  viewRule: "@request.auth.id != ''",
  createRule: "@request.auth.type = 'manager'",
  updateRule: "@request.auth.id != ''",
  deleteRule: "@request.auth.type = 'manager'",
  indexes: [
    "CREATE INDEX idx_agent_login_sessions_source ON agent_login_sessions (source)",
    "CREATE INDEX idx_agent_login_sessions_owner ON agent_login_sessions (owner_name)",
    "CREATE INDEX idx_agent_login_sessions_status ON agent_login_sessions (status)",
  ],
  fields: [
    relationField("source", monitorSources.id),
    textField("source_name", true),
    textField("owner_name", true),
    selectField("status", SESSION_STATUSES),
    textField("login_url"),
    textField("browser_url"),
    textField("profile_ref"),
    dateField("expires_at"),
    dateField("last_verified_at"),
    textField("last_error"),
    relationField("authorized_by", users.id),
    textField("security_note"),
  ],
});

migrate((app) => {
  const monitorSources = app.findCollectionByNameOrId("monitor_sources");
  const users = app.findCollectionByNameOrId("users");
  const agentTasks = app.findCollectionByNameOrId("agent_tasks");

  if (!findCollection(app, "agent_login_sessions")) {
    saveCollection(app, createAgentLoginSessionsCollection(monitorSources, users));
  }

  const agentLoginSessions = app.findCollectionByNameOrId("agent_login_sessions");
  [
    relationField("session", agentLoginSessions.id),
    selectField("session_status", SESSION_STATUSES),
    textField("reason"),
    textField("required_artifact"),
    dateField("due_at"),
    textField("result_summary"),
    textField("uploaded_artifacts"),
    textField("action_steps"),
    textField("search_terms"),
    textField("browser_url"),
    dateField("last_attempt_at"),
  ].forEach((field) => addFieldIfMissing(agentTasks, field));
  saveCollection(app, agentTasks);
}, (app) => {
  const agentTasks = findCollection(app, "agent_tasks");
  if (agentTasks) {
    ["session", "session_status", "reason", "required_artifact", "due_at", "result_summary", "uploaded_artifacts", "action_steps", "search_terms", "browser_url", "last_attempt_at"].forEach((name) => agentTasks.fields.removeByName(name));
    saveCollection(app, agentTasks);
  }

  const collection = findCollection(app, "agent_login_sessions");
  if (collection) app.delete(collection);
});
