/// <reference path="../pb_data/types.d.ts" />

const addOperationValue = (operation, value) => {
  if (!operation.values.includes(value)) operation.values = [...operation.values, value];
};

migrate((app) => {
  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  ["confirm_record", "reject_record"].forEach((value) => addOperationValue(operation, value));
  app.save(logs);
}, (app) => {
  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  const added = new Set(["confirm_record", "reject_record"]);
  operation.values = operation.values.filter((value) => !added.has(value));
  app.save(logs);
});
