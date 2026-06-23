/// <reference path="../pb_data/types.d.ts" />

const addSelectValues = (collection, fieldName, values) => {
  if (!collection) return false;
  const field = collection.fields.getByName(fieldName);
  if (!field) return false;
  field.values = Array.from(new Set([...(field.values || []), ...values]));
  return true;
};

const removeSelectValues = (collection, fieldName, values) => {
  if (!collection) return false;
  const field = collection.fields.getByName(fieldName);
  if (!field) return false;
  field.values = (field.values || []).filter((value) => !values.includes(value));
  return true;
};

const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
};

migrate((app) => {
  const agentTasks = findCollection(app, "agent_tasks");
  if (addSelectValues(agentTasks, "status", ["request_human"])) {
    app.save(agentTasks);
  }

  const artifacts = findCollection(app, "agent_artifacts");
  if (addSelectValues(artifacts, "artifact_type", ["log"])) {
    app.save(artifacts);
  }
}, (app) => {
  if (findCollection(app, "agent_tasks")) {
    while (true) {
      const tasks = app.findRecordsByFilter("agent_tasks", 'status = "request_human"', "", 100, 0);
      if (!tasks.length) break;
      for (const task of tasks) {
        task.set("status", "in_progress");
        app.save(task);
      }
    }
  }

  const agentTasks = findCollection(app, "agent_tasks");
  if (removeSelectValues(agentTasks, "status", ["request_human"])) {
    app.save(agentTasks);
  }

  if (findCollection(app, "agent_artifacts")) {
    while (true) {
      const logArtifacts = app.findRecordsByFilter("agent_artifacts", 'artifact_type = "log"', "", 100, 0);
      if (!logArtifacts.length) break;
      for (const artifact of logArtifacts) {
        artifact.set("artifact_type", "manual_text");
        app.save(artifact);
      }
    }
  }

  const artifacts = findCollection(app, "agent_artifacts");
  if (removeSelectValues(artifacts, "artifact_type", ["log"])) {
    app.save(artifacts);
  }
});
