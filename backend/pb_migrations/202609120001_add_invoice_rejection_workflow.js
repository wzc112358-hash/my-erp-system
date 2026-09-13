/// <reference path="../pb_data/types.d.ts" />

const addTextField = (collection, id, name, max = 0) => {
  if (collection.fields.getByName(name)) return;
  collection.fields.add(new TextField({ id, name, max }));
};

const removeField = (collection, name) => {
  const field = collection.fields.getByName(name);
  if (field) collection.fields.removeById(field.getId());
};

migrate((app) => {
  for (const [name, fieldId] of [
    ["sale_invoices", "text_sale_rejection_reason"],
    ["purchase_invoices", "text_purchase_rejection_reason"],
  ]) {
    const collection = app.findCollectionByNameOrId(name);
    addTextField(collection, fieldId, "rejection_reason", 500);
    app.save(collection);
  }

  // 实际生产表名：notifications 给采购端，notifications_02 给销售端。
  // 保留原表名兼容历史通知，在代码层使用明确的销售/采购命名。
  for (const [name, prefix] of [
    ["notifications", "purchasing_notification"],
    ["notifications_02", "sales_notification"],
  ]) {
    const collection = app.findCollectionByNameOrId(name);
    addTextField(collection, `${prefix}_record_collection`, "record_collection", 100);
    addTextField(collection, `${prefix}_record_id`, "record_id", 100);
    addTextField(collection, `${prefix}_rejection_reason`, "rejection_reason", 500);
    app.save(collection);
  }

  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  if (!operation.values.includes("resubmit_record")) {
    operation.values = [...operation.values, "resubmit_record"];
    app.save(logs);
  }
}, (app) => {
  for (const name of ["sale_invoices", "purchase_invoices"]) {
    const collection = app.findCollectionByNameOrId(name);
    removeField(collection, "rejection_reason");
    app.save(collection);
  }

  for (const name of ["notifications", "notifications_02"]) {
    const collection = app.findCollectionByNameOrId(name);
    removeField(collection, "record_collection");
    removeField(collection, "record_id");
    removeField(collection, "rejection_reason");
    app.save(collection);
  }

  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  operation.values = operation.values.filter((value) => value !== "resubmit_record");
  app.save(logs);
});
