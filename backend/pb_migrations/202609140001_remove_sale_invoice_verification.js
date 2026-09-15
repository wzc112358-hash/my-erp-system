/// <reference path="../pb_data/types.d.ts" />

const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
};

migrate((app) => {
  const collection = findCollection(app, "sale_invoices");
  if (!collection) return;

  const field = collection.fields.getByName("is_verified");
  if (!field) return;

  collection.fields.removeById(field.getId());
  app.save(collection);
}, (app) => {
  const collection = findCollection(app, "sale_invoices");
  if (!collection || collection.fields.getByName("is_verified")) return;

  collection.fields.add(new SelectField({
    id: "select_sale_invoice_verified",
    name: "is_verified",
    maxSelect: 1,
    values: ["yes", "no"],
  }));
  app.save(collection);
});
