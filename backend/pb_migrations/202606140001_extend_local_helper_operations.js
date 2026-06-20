/// <reference path="../pb_data/types.d.ts" />

const addSelectValue = (collection, fieldName, value) => {
  const field = collection.fields.getByName(fieldName);
  if (field && Array.isArray(field.values) && !field.values.includes(value)) {
    field.values.push(value);
  }
};

const removeSelectValue = (collection, fieldName, value) => {
  const field = collection.fields.getByName(fieldName);
  if (field && Array.isArray(field.values)) {
    field.values = field.values.filter((item) => item !== value);
  }
};

migrate((app) => {
  const artifacts = app.findCollectionByNameOrId("agent_artifacts");
  addSelectValue(artifacts, "artifact_type", "log");
  return app.save(artifacts);
}, (app) => {
  const artifacts = app.findCollectionByNameOrId("agent_artifacts");
  removeSelectValue(artifacts, "artifact_type", "log");
  return app.save(artifacts);
});
