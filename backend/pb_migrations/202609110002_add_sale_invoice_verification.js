/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("sale_invoices");
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
  const collection = app.findCollectionByNameOrId("sale_invoices");
  collection.fields.removeByName("is_verified");
  app.save(collection);
});
