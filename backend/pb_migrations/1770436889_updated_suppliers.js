/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3355664324")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role = \"采购\"",
    "deleteRule": "@request.auth.role = \"采购\"",
    "updateRule": "@request.auth.role = \"采购\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3355664324")

  // update collection data
  unmarshal({
    "createRule": "",
    "deleteRule": "",
    "updateRule": ""
  }, collection)

  return app.save(collection)
})
