/// <reference path="../pb_data/types.d.ts" />

const addField = (collection, field) => {
  if (!collection.fields.getByName(field.name)) collection.fields.add(field);
};

const textField = (id, name, max = 5000) => new TextField({
  id,
  name,
  max,
});

migrate((app) => {
  const collection = app.findCollectionByNameOrId("contract_operation_logs");

  addField(collection, new SelectField({
    id: "select_contract_log_operation",
    name: "operation",
    maxSelect: 1,
    values: ["merge", "unlink", "unlink_delete", "delete_record"],
    required: true,
  }));
  addField(collection, new SelectField({
    id: "select_contract_log_type",
    name: "contract_type",
    maxSelect: 1,
    values: ["sales", "purchase", "sales_purchase"],
    required: true,
  }));
  addField(collection, textField("text_contract_log_operator", "operator_id"));
  addField(collection, textField("text_contract_log_source_id", "source_contract_id"));
  addField(collection, textField("text_contract_log_source_no", "source_contract_no"));
  addField(collection, textField("text_contract_log_target_id", "target_contract_id"));
  addField(collection, textField("text_contract_log_target_no", "target_contract_no"));
  addField(collection, textField("text_contract_log_details", "details", 200000));
  addField(collection, textField("text_contract_log_collection", "collection_name"));
  addField(collection, textField("text_contract_log_record_id", "record_id"));
  addField(collection, textField("text_contract_log_snapshot", "record_snapshot", 200000));
  addField(collection, new AutodateField({
    id: "autodate_contract_log_created",
    name: "created",
    onCreate: true,
    onUpdate: false,
  }));

  collection.listRule = "@request.auth.type = 'manager'";
  collection.viewRule = "@request.auth.type = 'manager'";
  collection.createRule = null;
  collection.updateRule = null;
  collection.deleteRule = null;
  collection.indexes = [
    "CREATE INDEX idx_contract_operation_logs_created ON contract_operation_logs (created)",
    "CREATE INDEX idx_contract_operation_logs_record ON contract_operation_logs (collection_name, record_id)",
  ];
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("contract_operation_logs");
  [
    "operation",
    "contract_type",
    "operator_id",
    "source_contract_id",
    "source_contract_no",
    "target_contract_id",
    "target_contract_no",
    "details",
    "collection_name",
    "record_id",
    "record_snapshot",
    "created",
  ].forEach((name) => collection.fields.removeByName(name));
  collection.indexes = [];
  app.save(collection);
});
