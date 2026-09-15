/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2513462200")

  // update collection data
  unmarshal({
    "name": "purchase_invoices"
  }, collection)

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "number182082401",
    "max": null,
    "min": null,
    "name": "received_amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "number3277163104",
    "max": null,
    "min": null,
    "name": "received_percent",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text4045061810",
    "max": 0,
    "min": 0,
    "name": "no",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2513462200")

  // update collection data
  unmarshal({
    "name": "purchase_invoice"
  }, collection)

  // remove field
  collection.fields.removeById("number182082401")

  // remove field
  collection.fields.removeById("number3277163104")

  // update field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text4045061810",
    "max": 0,
    "min": 0,
    "name": "invoice_no",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
})
