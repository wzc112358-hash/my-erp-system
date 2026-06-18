/// <reference path="../pb_data/types.d.ts" />

const textField = (name, required = false) => new Field({
  name,
  type: "text",
  required,
});

const numberField = (name) => new Field({
  name,
  type: "number",
  onlyInt: true,
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

const createLocalHelperDevicesCollection = (users) => new Collection({
  name: "local_helper_devices",
  type: "base",
  system: false,
  listRule: "@request.auth.id != ''",
  viewRule: "@request.auth.id != ''",
  createRule: "@request.auth.id != ''",
  updateRule: "@request.auth.id != ''",
  deleteRule: "@request.auth.type = 'manager'",
  indexes: [
    "CREATE INDEX idx_local_helper_devices_owner ON local_helper_devices (owner_name)",
    "CREATE INDEX idx_local_helper_devices_status ON local_helper_devices (status)",
    "CREATE INDEX idx_local_helper_devices_pair_hash ON local_helper_devices (pair_code_hash)",
    "CREATE INDEX idx_local_helper_devices_token_hash ON local_helper_devices (access_token_hash)",
  ],
  fields: [
    relationField("owner_user", users.id),
    textField("owner_name", true),
    textField("device_name"),
    textField("device_fingerprint", true),
    selectField("status", ["pending_pair", "active", "revoked"], true),
    textField("pair_code_hash"),
    dateField("pair_code_expires_at"),
    textField("access_token_hash"),
    textField("helper_version"),
    textField("platform"),
    dateField("last_seen_at"),
  ],
});

const createLocalHelperRunsCollection = (devices, agentTasks, monitorSources) => new Collection({
  name: "local_helper_runs",
  type: "base",
  system: false,
  listRule: "@request.auth.id != ''",
  viewRule: "@request.auth.id != ''",
  createRule: "@request.auth.type = 'manager'",
  updateRule: "@request.auth.id != ''",
  deleteRule: "@request.auth.type = 'manager'",
  indexes: [
    "CREATE INDEX idx_local_helper_runs_task ON local_helper_runs (agent_task)",
    "CREATE INDEX idx_local_helper_runs_device ON local_helper_runs (device)",
    "CREATE INDEX idx_local_helper_runs_status ON local_helper_runs (status)",
  ],
  fields: [
    relationField("device", devices.id),
    relationField("agent_task", agentTasks.id),
    relationField("source", monitorSources.id),
    textField("source_name"),
    textField("owner_name"),
    selectField("status", ["running", "request_human", "completed", "failed", "cancelled"]),
    textField("entry_url"),
    textField("current_url"),
    textField("last_observation"),
    textField("error_message"),
    dateField("started_at"),
    dateField("finished_at"),
  ],
});

const createLocalAgentStepsCollection = (localHelperRuns) => new Collection({
  name: "local_agent_steps",
  type: "base",
  system: false,
  listRule: "@request.auth.id != ''",
  viewRule: "@request.auth.id != ''",
  createRule: "@request.auth.type = 'manager'",
  updateRule: "@request.auth.id != ''",
  deleteRule: "@request.auth.type = 'manager'",
  indexes: ["CREATE INDEX idx_local_agent_steps_run ON local_agent_steps (local_helper_run)"],
  fields: [
    relationField("local_helper_run", localHelperRuns.id),
    numberField("step_index"),
    selectField("actor", ["local_helper", "cloud_agent", "employee", "system"]),
    textField("observation"),
    textField("action"),
    textField("result"),
    textField("error_message"),
  ],
});

const createAgentArtifactsCollection = (localHelperRuns, agentTasks) => new Collection({
  name: "agent_artifacts",
  type: "base",
  system: false,
  listRule: "@request.auth.id != ''",
  viewRule: "@request.auth.id != ''",
  createRule: "@request.auth.type = 'manager'",
  updateRule: "@request.auth.id != ''",
  deleteRule: "@request.auth.type = 'manager'",
  indexes: [
    "CREATE INDEX idx_agent_artifacts_run ON agent_artifacts (local_helper_run)",
    "CREATE INDEX idx_agent_artifacts_task ON agent_artifacts (agent_task)",
  ],
  fields: [
    relationField("local_helper_run", localHelperRuns.id),
    relationField("agent_task", agentTasks.id),
    selectField("artifact_type", ["candidate_bundle", "dom_snapshot", "network_response", "screenshot", "attachment", "manual_text"], true),
    textField("title"),
    textField("url"),
    textField("content"),
    textField("mime_type"),
  ],
});

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const agentTasks = app.findCollectionByNameOrId("agent_tasks");
  const monitorSources = app.findCollectionByNameOrId("monitor_sources");

  if (!findCollection(app, "local_helper_devices")) {
    saveCollection(app, createLocalHelperDevicesCollection(users));
  }
  const devices = app.findCollectionByNameOrId("local_helper_devices");

  if (!findCollection(app, "local_helper_runs")) {
    saveCollection(app, createLocalHelperRunsCollection(devices, agentTasks, monitorSources));
  }
  const runs = app.findCollectionByNameOrId("local_helper_runs");

  if (!findCollection(app, "local_agent_steps")) {
    saveCollection(app, createLocalAgentStepsCollection(runs));
  }

  if (!findCollection(app, "agent_artifacts")) {
    saveCollection(app, createAgentArtifactsCollection(runs, agentTasks));
  }
}, (app) => {
  ["agent_artifacts", "local_agent_steps", "local_helper_runs", "local_helper_devices"].forEach((name) => {
    const collection = findCollection(app, name);
    if (collection) app.delete(collection);
  });
});
