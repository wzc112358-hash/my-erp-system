/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = collection.fields.getByName("operation");
  if (!operation.values.includes("link")) {
    operation.values = [...operation.values, "link"];
    app.save(collection);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = collection.fields.getByName("operation");
  if (operation.values.includes("link")) {
    operation.values = operation.values.filter((value) => value !== "link");
    app.save(collection);
  }
});
