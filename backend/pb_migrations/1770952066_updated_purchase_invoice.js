/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2513462200")

  // update field
  collection.fields.addAt(3, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3862017874",
    "hidden": false,
    "id": "relation3226286859",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "purchase_contract",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2513462200")

  // update field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3862017874",
    "hidden": false,
    "id": "relation3226286859",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "purchase_contract",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
