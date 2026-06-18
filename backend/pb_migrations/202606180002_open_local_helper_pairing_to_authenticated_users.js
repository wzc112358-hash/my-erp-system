/// <reference path="../pb_data/types.d.ts" />

const setRule = (collection, key, value) => {
  collection[key] = value;
};

migrate((app) => {
  const devices = app.findCollectionByNameOrId("local_helper_devices");
  setRule(devices, "listRule", "@request.auth.id != ''");
  setRule(devices, "viewRule", "@request.auth.id != ''");
  setRule(devices, "createRule", "@request.auth.id != ''");
  setRule(devices, "updateRule", "@request.auth.id != ''");
  setRule(devices, "deleteRule", "@request.auth.type = 'manager'");
  return app.save(devices);
}, (app) => {
  const devices = app.findCollectionByNameOrId("local_helper_devices");
  setRule(devices, "createRule", "@request.auth.type = 'manager'");
  return app.save(devices);
});
