/// <reference path="../pb_data/types.d.ts" />

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const COLLECTIONS = [
  "sales_contracts",
  "purchase_contracts",
  "sales_shipments",
  "purchase_arrivals",
  "sale_invoices",
  "purchase_invoices",
  "sale_receipts",
  "purchase_payments",
  "service_contracts",
  "service_orders",
  "expense_records",
  "inventory",
  "stock_movements",
  "bidding_records",
];

const setAttachmentLimit = (app, collectionName, maxSize) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId(collectionName);
  } catch {
    console.log("[migration] collection not found, skip:", collectionName);
    return;
  }

  const attachments = collection.fields.getByName("attachments");
  if (!attachments) {
    console.log("[migration] attachments field not found, skip:", collectionName);
    return;
  }

  attachments.maxSize = maxSize;
  app.save(collection);
};

migrate((app) => {
  for (const collectionName of COLLECTIONS) {
    setAttachmentLimit(app, collectionName, MAX_ATTACHMENT_SIZE);
  }
}, (app) => {
  for (const collectionName of COLLECTIONS) {
    setAttachmentLimit(app, collectionName, 0);
  }
});
