/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3862017874")

  // remove field
  collection.fields.removeById("text3731384213")

  // remove field
  collection.fields.removeById("relation3154569827")

  // add field
  collection.fields.addAt(19, new Field({
    "hidden": false,
    "id": "date3057222488",
    "max": "",
    "min": "",
    "name": "paid_date",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // update field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "number1158732002",
    "max": null,
    "min": null,
    "name": "execution_percent",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(18, new Field({
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
  collection.fields.addAt(20, new Field({
    "hidden": false,
    "id": "select2063623452",
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
  const collection = app.findCollectionByNameOrId("pbc_3862017874")

  // add field
  collection.fields.addAt(8, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3731384213",
    "max": 0,
    "min": 0,
    "name": "package",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "cascadeDelete": false,
    "collectionId": "_pb_users_auth_",
    "hidden": false,
    "id": "relation3154569827",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "creator",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // remove field
  collection.fields.removeById("date3057222488")

  // update field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "number1158732002",
    "max": null,
    "min": null,
    "name": "_execution_percent_",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "date3188216031",
    "max": "",
    "min": "",
    "name": "sign_date_",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // update field
  collection.fields.addAt(23, new Field({
    "hidden": false,
    "id": "select2063623452",
    "maxSelect": 1,
    "name": "status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "executing",
      "completed"
    ]
  }))

  return app.save(collection)
})
