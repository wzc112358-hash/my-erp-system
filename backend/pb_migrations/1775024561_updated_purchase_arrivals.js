/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2311733007")

  // add field
  collection.fields.addAt(21, new Field({
    "hidden": false,
    "id": "select2188185829",
    "maxSelect": 1,
    "name": "manager_confirmed",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "pending",
      "approved",
      "rejected"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2311733007")

  // remove field
  collection.fields.removeById("select2188185829")

  return app.save(collection)
})
