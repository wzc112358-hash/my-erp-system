/// <reference path="../pb_data/types.d.ts" />

const textField = (name, required = false) => new Field({
  name,
  type: "text",
  required,
});

const selectField = (name, values) => new Field({
  name,
  type: "select",
  maxSelect: 1,
  values,
  required: true,
});

migrate((app) => {
  try {
    app.findCollectionByNameOrId("contract_operation_logs");
    return;
  } catch {
    // Create it below.
  }

  const collection = new Collection({
    name: "contract_operation_logs",
    type: "base",
    system: false,
    listRule: "@request.auth.type = 'manager'",
    viewRule: "@request.auth.type = 'manager'",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: ["CREATE INDEX idx_contract_operation_logs_created ON contract_operation_logs (created)"],
    fields: [
      selectField("operation", ["merge", "unlink", "unlink_delete"]),
      selectField("contract_type", ["sales", "purchase", "sales_purchase"]),
      textField("operator_id"),
      textField("source_contract_id"),
      textField("source_contract_no"),
      textField("target_contract_id"),
      textField("target_contract_no"),
      textField("details"),
    ],
  });
  app.save(collection);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("contract_operation_logs"));
  } catch {
    // Already removed.
  }
});
