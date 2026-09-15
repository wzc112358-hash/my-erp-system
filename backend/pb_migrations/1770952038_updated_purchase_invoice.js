/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2513462200")

  // remove field
  collection.fields.removeById("relation4160472307")

  // add field
  collection.fields.addAt(4, new Field({
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

  // update field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "number2275079762",
    "max": null,
    "min": null,
    "name": "unreceived_amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2513462200")

  // add field
  collection.fields.addAt(4, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1532107944",
    "hidden": false,
    "id": "relation4160472307",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "sale_contract",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // remove field
  collection.fields.removeById("relation2754850941")

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
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // update field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "number2275079762",
    "max": null,
    "min": null,
    "name": "unreceived_amount_",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
