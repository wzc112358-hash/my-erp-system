/// <reference path="../pb_data/types.d.ts" />

const addSelectValues = (collection, fieldName, values) => {
  const field = collection.fields.getByName(fieldName);
  if (!field) throw new Error(`${collection.name}.${fieldName} field not found`);
  field.values = Array.from(new Set([...(field.values || []), ...values]));
};

const removeSelectValues = (collection, fieldName, values) => {
  const field = collection.fields.getByName(fieldName);
  if (!field) throw new Error(`${collection.name}.${fieldName} field not found`);
  field.values = (field.values || []).filter((value) => !values.includes(value));
};

migrate((app) => {
  const agentTasks = app.findCollectionByNameOrId("agent_tasks");
  addSelectValues(agentTasks, "status", ["request_human"]);
  app.save(agentTasks);

  const artifacts = app.findCollectionByNameOrId("agent_artifacts");
  addSelectValues(artifacts, "artifact_type", ["log"]);
  app.save(artifacts);
}, (app) => {
  while (true) {
    const tasks = app.findRecordsByFilter("agent_tasks", 'status = "request_human"', "", 100, 0);
    if (!tasks.length) break;
    for (const task of tasks) {
      task.set("status", "in_progress");
      app.save(task);
    }
  }

  const agentTasks = app.findCollectionByNameOrId("agent_tasks");
  removeSelectValues(agentTasks, "status", ["request_human"]);
  app.save(agentTasks);

  while (true) {
    const logArtifacts = app.findRecordsByFilter("agent_artifacts", 'artifact_type = "log"', "", 100, 0);
    if (!logArtifacts.length) break;
    for (const artifact of logArtifacts) {
      artifact.set("artifact_type", "manual_text");
      app.save(artifact);
    }
  }

  const artifacts = app.findCollectionByNameOrId("agent_artifacts");
  removeSelectValues(artifacts, "artifact_type", ["log"]);
  app.save(artifacts);
});
