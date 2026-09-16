/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  if (!operation.values.includes("verify_invoice")) {
    operation.values = [...operation.values, "verify_invoice"];
    app.save(logs);
  }
}, (app) => {
  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  operation.values = operation.values.filter((value) => value !== "verify_invoice");
  app.save(logs);
});
