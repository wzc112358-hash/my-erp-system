/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1532107944")

  // update field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text4259688370",
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

  // update field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "number338969305",
    "max": null,
    "min": null,
    "name": "receipted_amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "number748947678",
    "max": null,
    "min": null,
    "name": "receipt_percent",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "number2847928774",
    "max": null,
    "min": null,
    "name": "debt_amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "number1989068558",
    "max": null,
    "min": null,
    "name": "invoiced_amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(17, new Field({
    "hidden": false,
    "id": "select1034747842",
    "maxSelect": 1,
    "name": "status",
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

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1532107944")

  // update field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text4259688370",
    "max": 0,
    "min": 0,
    "name": "contract_no",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // update field
  collection.fields.addAt(9, new Field({
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

  // update field
  collection.fields.addAt(10, new Field({
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

  // update field
  collection.fields.addAt(11, new Field({
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

  // update field
  collection.fields.addAt(13, new Field({
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

  // update field
  collection.fields.addAt(17, new Field({
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

  return app.save(collection)
})
