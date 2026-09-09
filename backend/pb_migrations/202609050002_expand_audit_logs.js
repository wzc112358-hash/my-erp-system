/// <reference path="../pb_data/types.d.ts" />

const addOperationValue = (operation, value) => {
  if (!operation.values.includes(value)) operation.values = [...operation.values, value];
};

const removeOperationValue = (operation, value) => {
  operation.values = operation.values.filter((item) => item !== value);
};

migrate((app) => {
  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  ["update_record", "update_failed"].forEach((value) => addOperationValue(operation, value));

  const scopeIndex = "CREATE INDEX idx_contract_operation_logs_scope_created ON contract_operation_logs (contract_type, collection_name, created DESC)";
  if (!logs.indexes.includes(scopeIndex)) logs.indexes = [...logs.indexes, scopeIndex];
  app.save(logs);

  // Historical relation logs only stored the operator id. Resolve the display
  // name now so exports and direct API reads are also understandable.
  let offset = 0;
  const batchSize = 100;
  while (true) {
    const records = app.findRecordsByFilter(
      "contract_operation_logs",
      'operator_id != ""',
      "created",
      batchSize,
      offset,
    );
    if (records.length === 0) break;

    for (const record of records) {
      try {
        const user = app.findRecordById("users", record.getString("operator_id"));
        const displayName = user.getString("user_name") || user.getString("name") || user.getString("email") || "未知用户";
        record.set("operator_name", displayName);
        record.set("operator_role", user.getString("type"));
        if (!record.getString("result")) record.set("result", "success");
        app.save(record);
      } catch (error) {
        console.warn("[migration] unable to resolve audit operator", record.id, error);
      }
    }

    if (records.length < batchSize) break;
    offset += batchSize;
  }
}, (app) => {
  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  ["update_record", "update_failed"].forEach((value) => removeOperationValue(operation, value));
  logs.indexes = logs.indexes.filter((index) => !index.includes("idx_contract_operation_logs_scope_created"));
  app.save(logs);
});
