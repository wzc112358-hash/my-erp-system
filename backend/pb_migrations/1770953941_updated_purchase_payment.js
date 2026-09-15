/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1755181297")

  // update collection data
  unmarshal({
    "name": "purchase_payments"
  }, collection)

  // update field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "number121289229",
    "max": null,
    "min": null,
    "name": "amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(8, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2069996022",
    "max": 0,
    "min": 0,
    "name": "method",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1755181297")

  // update collection data
  unmarshal({
    "name": "purchase_payment"
  }, collection)

  // update field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "number121289229",
    "max": null,
    "min": null,
    "name": "pay_amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(8, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2069996022",
    "max": 0,
    "min": 0,
    "name": "payment_method",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
})
