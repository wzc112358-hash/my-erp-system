/// <reference path="../pb_data/types.d.ts" />

const withoutFingerprintIndex = (indexes = []) => (
  indexes.filter((index) => !/idx_local_helper_devices_fingerprint/i.test(index))
);

migrate((app) => {
  const devices = app.findCollectionByNameOrId("local_helper_devices");
  devices.indexes = withoutFingerprintIndex(devices.indexes || []);

  const fingerprint = devices.fields.getByName("device_fingerprint");
  if (fingerprint) fingerprint.required = true;

  return app.save(devices);
}, (app) => {
  const devices = app.findCollectionByNameOrId("local_helper_devices");
  devices.indexes = [
    ...withoutFingerprintIndex(devices.indexes || []),
    "CREATE UNIQUE INDEX idx_local_helper_devices_fingerprint ON local_helper_devices (device_fingerprint)",
  ];
  return app.save(devices);
});
