/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2311733007")

  // update collection data
  unmarshal({
    "name": "purchase_arrivals"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2311733007")

  // update collection data
  unmarshal({
    "name": "purchase_transport"
  }, collection)

  return app.save(collection)
})
