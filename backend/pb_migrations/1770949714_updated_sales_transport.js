/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_883528949")

  // update collection data
  unmarshal({
    "name": "sales_shipments"
  }, collection)

  // add field
  collection.fields.addAt(4, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3553320103",
    "max": 0,
    "min": 0,
    "name": "product_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text301717290",
    "max": 0,
    "min": 0,
    "name": "tracking_contract_no",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "date2862495610",
    "max": "",
    "min": "",
    "name": "date",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "number2683508278",
    "max": null,
    "min": null,
    "name": "quantity",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3318573963",
    "max": 0,
    "min": 0,
    "name": "logistics_company",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3873859876",
    "max": 0,
    "min": 0,
    "name": "shipment_address",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text122736735",
    "max": 0,
    "min": 0,
    "name": "delivery_address",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "select128006412",
    "maxSelect": 1,
    "name": "freight_status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "paid",
      "unpaid"
    ]
  }))

  // add field
  collection.fields.addAt(14, new Field({
    "hidden": false,
    "id": "date514279669",
    "max": "",
    "min": "",
    "name": "freight_date",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(15, new Field({
    "hidden": false,
    "id": "select3224827983",
    "maxSelect": 1,
    "name": "invoice_status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "issued",
      "unissued"
    ]
  }))

  // update field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "file1542800728",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "attachments",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_883528949")

  // update collection data
  unmarshal({
    "name": "sales_transport"
  }, collection)

  // remove field
  collection.fields.removeById("text3553320103")

  // remove field
  collection.fields.removeById("text301717290")

  // remove field
  collection.fields.removeById("date2862495610")

  // remove field
  collection.fields.removeById("number2683508278")

  // remove field
  collection.fields.removeById("text3318573963")

  // remove field
  collection.fields.removeById("text3873859876")

  // remove field
  collection.fields.removeById("text122736735")

  // remove field
  collection.fields.removeById("select128006412")

  // remove field
  collection.fields.removeById("date514279669")

  // remove field
  collection.fields.removeById("select3224827983")

  // update field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "file1542800728",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "field",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  return app.save(collection)
})
