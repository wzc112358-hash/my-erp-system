/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2007520853")

  // update field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1532107944",
    "hidden": false,
    "id": "relation2754850941",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "sales_contract",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2007520853")

  // update field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1532107944",
    "hidden": false,
    "id": "relation2754850941",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "sales_contract",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
