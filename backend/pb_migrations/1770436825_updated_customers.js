/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_108570809")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role =\"销售\"",
    "deleteRule": "@request.auth.role =\"销售\"",
    "listRule": "@request.auth.role =\"销售\"",
    "updateRule": "@request.auth.role =\"销售\"",
    "viewRule": "@request.auth.role =\"销售\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_108570809")

  // update collection data
  unmarshal({
    "createRule": "",
    "deleteRule": "",
    "listRule": "",
    "updateRule": "",
    "viewRule": ""
  }, collection)

  return app.save(collection)
})
