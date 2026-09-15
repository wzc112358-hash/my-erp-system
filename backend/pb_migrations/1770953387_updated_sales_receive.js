/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_332752390")

  // update collection data
  unmarshal({
    "name": "sales_receipts"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_332752390")

  // update collection data
  unmarshal({
    "name": "sales_receive"
  }, collection)

  return app.save(collection)
})
