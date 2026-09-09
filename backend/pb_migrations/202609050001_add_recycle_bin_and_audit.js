/// <reference path="../pb_data/types.d.ts" />

const RECYCLE_COLLECTIONS = [
  "sales_contracts",
  "purchase_contracts",
  "sales_shipments",
  "sale_invoices",
  "sale_receipts",
  "purchase_arrivals",
  "purchase_invoices",
  "purchase_payments",
];

const addField = (collection, field) => {
  if (!collection.fields.getByName(field.name)) collection.fields.add(field);
};

const addOperationValue = (operation, value) => {
  if (!operation.values.includes(value)) operation.values = [...operation.values, value];
};

const activeOnlyRule = (rule) => {
  if (rule === null) return null;
  if (!rule) return "deleted_at = ''";
  return `(${rule}) && deleted_at = ''`;
};

const removeActiveOnlyRule = (rule) => {
  if (!rule) return rule;
  if (rule === "deleted_at = ''") return "";
  const suffix = ") && deleted_at = ''";
  if (rule.startsWith("(") && rule.endsWith(suffix)) {
    return rule.slice(1, -suffix.length);
  }
  return rule;
};

migrate((app) => {
  for (const name of RECYCLE_COLLECTIONS) {
    const collection = app.findCollectionByNameOrId(name);
    addField(collection, new DateField({
      id: `date_recycle_${name}`,
      name: "deleted_at",
    }));
    addField(collection, new TextField({
      id: `text_recycle_user_${name}`,
      name: "deleted_by",
      max: 5000,
    }));
    addField(collection, new TextField({
      id: `text_recycle_batch_${name}`,
      name: "delete_batch_id",
      max: 5000,
    }));

    // Preserve every existing role/ownership restriction and only hide recycled rows.
    collection.listRule = activeOnlyRule(collection.listRule);
    collection.viewRule = activeOnlyRule(collection.viewRule);
    collection.updateRule = activeOnlyRule(collection.updateRule);
    // All user-facing deletion goes through /api/erp/recycle/delete so files
    // remain in place and the operation can be restored and audited.
    collection.deleteRule = null;

    const index = `CREATE INDEX idx_${name}_deleted_at ON ${name} (deleted_at)`;
    if (!collection.indexes.includes(index)) collection.indexes = [...collection.indexes, index];
    app.save(collection);
  }

  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  ["create_record", "create_failed", "soft_delete", "restore_record"].forEach((value) => {
    addOperationValue(operation, value);
  });
  addField(logs, new SelectField({
    id: "select_business_log_result",
    name: "result",
    maxSelect: 1,
    values: ["success", "failed"],
  }));
  addField(logs, new TextField({
    id: "text_business_log_operator_name",
    name: "operator_name",
    max: 5000,
  }));
  addField(logs, new TextField({
    id: "text_business_log_operator_role",
    name: "operator_role",
    max: 5000,
  }));
  addField(logs, new TextField({
    id: "text_business_log_error",
    name: "error_message",
    max: 200000,
  }));
  addField(logs, new TextField({
    id: "text_business_log_batch",
    name: "delete_batch_id",
    max: 5000,
  }));
  logs.indexes = [
    ...logs.indexes.filter((index) => !index.includes("idx_contract_operation_logs_batch")),
    "CREATE INDEX idx_contract_operation_logs_batch ON contract_operation_logs (delete_batch_id)",
  ];
  app.save(logs);
}, (app) => {
  for (const name of RECYCLE_COLLECTIONS) {
    const collection = app.findCollectionByNameOrId(name);
    ["deleted_at", "deleted_by", "delete_batch_id"].forEach((field) => {
      collection.fields.removeByName(field);
    });
    collection.listRule = removeActiveOnlyRule(collection.listRule);
    collection.viewRule = removeActiveOnlyRule(collection.viewRule);
    collection.updateRule = removeActiveOnlyRule(collection.updateRule);
    collection.deleteRule = "@request.auth.id != ''";
    collection.indexes = collection.indexes.filter((index) => !index.includes(`idx_${name}_deleted_at`));
    app.save(collection);
  }

  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  ["result", "operator_name", "operator_role", "error_message", "delete_batch_id"].forEach((field) => {
    logs.fields.removeByName(field);
  });
  const operation = logs.fields.getByName("operation");
  const added = new Set(["create_record", "create_failed", "soft_delete", "restore_record"]);
  operation.values = operation.values.filter((value) => !added.has(value));
  logs.indexes = logs.indexes.filter((index) => !index.includes("idx_contract_operation_logs_batch"));
  app.save(logs);
});
