/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1532107944")

  // remove field
  collection.fields.removeById("text2069996022")

  // remove field
  collection.fields.removeById("date4260335480")

  // add field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "number1308007271",
    "max": null,
    "min": null,
    "name": "executed_quantity",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "number206262708",
    "max": null,
    "min": null,
    "name": "execution_percent",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "number338969305",
    "max": null,
    "min": null,
    "name": "receipted_amount_",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(14, new Field({
    "hidden": false,
    "id": "number748947678",
    "max": null,
    "min": null,
    "name": "receipt_percent_",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(15, new Field({
    "hidden": false,
    "id": "number2847928774",
    "max": null,
    "min": null,
    "name": "debt_amount_",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(16, new Field({
    "hidden": false,
    "id": "number2038649819",
    "max": null,
    "min": null,
    "name": "debt_percent",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(17, new Field({
    "hidden": false,
    "id": "number1989068558",
    "max": null,
    "min": null,
    "name": "invoiced_amount_",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(18, new Field({
    "hidden": false,
    "id": "number2473572074",
    "max": null,
    "min": null,
    "name": "invoice_percent",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(19, new Field({
    "hidden": false,
    "id": "number3389605296",
    "max": null,
    "min": null,
    "name": "uninvoiced_amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(20, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3788167225",
    "max": 0,
    "min": 0,
    "name": "remark",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(21, new Field({
    "hidden": false,
    "id": "select1034747842",
    "maxSelect": 1,
    "name": "status_",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "executing",
      "completed",
      "cancelled"
    ]
  }))

  // update field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3553320103",
    "max": 0,
    "min": 0,
    "name": "product_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // update field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "number2683508278",
    "max": null,
    "min": null,
    "name": "total_quantity",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "date3188216031",
    "max": "",
    "min": "",
    "name": "sign_date",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
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
  const collection = app.findCollectionByNameOrId("pbc_1532107944")

  // add field
  collection.fields.addAt(9, new Field({
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

  // add field
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "date4260335480",
    "max": "",
    "min": "",
    "name": "valid_until",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // remove field
  collection.fields.removeById("number1308007271")

  // remove field
  collection.fields.removeById("number206262708")

  // remove field
  collection.fields.removeById("number338969305")

  // remove field
  collection.fields.removeById("number748947678")

  // remove field
  collection.fields.removeById("number2847928774")

  // remove field
  collection.fields.removeById("number2038649819")

  // remove field
  collection.fields.removeById("number1989068558")

  // remove field
  collection.fields.removeById("number2473572074")

  // remove field
  collection.fields.removeById("number3389605296")

  // remove field
  collection.fields.removeById("text3788167225")

  // remove field
  collection.fields.removeById("select1034747842")

  // update field
  collection.fields.addAt(2, new Field({
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

  // update field
  collection.fields.addAt(4, new Field({
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

  // update field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "date3188216031",
    "max": "",
    "min": "",
    "name": "delivery_time",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // update field
  collection.fields.addAt(11, new Field({
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
