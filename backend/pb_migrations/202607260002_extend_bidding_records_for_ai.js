/// <reference path="../pb_data/types.d.ts" />

// Enrich bidding_records so ERP history can support evidence-backed AI
// preparation. All fields are optional to keep existing records compatible.
const textField = (name) => new Field({
  name,
  type: "text",
  required: false,
});

const numberField = (name) => new Field({
  name,
  type: "number",
  onlyInt: false,
  required: false,
});

const selectField = (name, values) => new Field({
  name,
  type: "select",
  maxSelect: 1,
  values,
  required: false,
});

const fields = [
  textField("quantity_unit"),
  textField("specification"),
  textField("purity"),
  textField("packaging"),
  numberField("quoted_unit_price"),
  numberField("quoted_total_amount"),
  selectField("currency", ["CNY", "USD", "EUR"]),
  numberField("winning_unit_price"),
  numberField("winning_total_amount"),
  textField("winning_supplier"),
  textField("brand"),
  textField("loss_reason"),
  textField("qualification_snapshot"),
  textField("source_notice_id"),
  textField("source_notice_fingerprint"),
  textField("source_notice_title"),
  textField("source_notice_url"),
  textField("source_name"),
];

const sourceFingerprintIndex = "CREATE UNIQUE INDEX idx_bidding_source_notice_fingerprint ON bidding_records (source_notice_fingerprint) WHERE source_notice_fingerprint != ''";

const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
};

migrate((app) => {
  const collection = findCollection(app, "bidding_records");
  // Older installations created this optional employee-history collection
  // manually. Keep a fresh migration replay working when it is absent.
  if (!collection) return;
  for (const field of fields) {
    if (!collection.fields.getByName(field.name)) collection.fields.add(field);
  }
  const indexes = collection.indexes || [];
  if (!indexes.some((index) => index.includes("idx_bidding_source_notice_fingerprint"))) {
    collection.indexes = [...indexes, sourceFingerprintIndex];
  }
  app.save(collection);
}, (app) => {
  const collection = findCollection(app, "bidding_records");
  if (!collection) return;
  collection.indexes = (collection.indexes || [])
    .filter((index) => !index.includes("idx_bidding_source_notice_fingerprint"));
  for (const field of fields) {
    if (collection.fields.getByName(field.name)) collection.fields.removeByName(field.name);
  }
  app.save(collection);
});
