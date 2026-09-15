/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1532107944")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role = \"销售\"",
    "deleteRule": "@request.auth.role = \"销售\"",
    "listRule": "",
    "updateRule": "@request.auth.role = \"销售\"",
    "viewRule": ""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1532107944")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": null,
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
