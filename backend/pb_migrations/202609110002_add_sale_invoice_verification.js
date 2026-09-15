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
  if (!collection.fields.getByName("is_verified")) {
    collection.fields.add(new SelectField({
      id: "select_sale_invoice_verified",
      name: "is_verified",
      maxSelect: 1,
      values: ["yes", "no"],
    }));
    app.save(collection);
  }
}, (app) => {
  const collection = findCollection(app, "sale_invoices");
  if (!collection) return;
  collection.fields.removeByName("is_verified");
  app.save(collection);
});
