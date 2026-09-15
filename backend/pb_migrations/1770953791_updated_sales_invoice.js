/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2007520853")

  // update collection data
  unmarshal({
    "name": "sales_invoices"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2007520853")

  // update collection data
  unmarshal({
    "name": "sales_invoice"
  }, collection)

  return app.save(collection)
})
