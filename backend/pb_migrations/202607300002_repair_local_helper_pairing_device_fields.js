/// <reference path="../pb_data/types.d.ts" />

const textField = (id, name, required = false) => new TextField({
  id,
  name,
  required,
  max: 5000,
});

const dateField = (id, name) => new DateField({ id, name });

const addField = (collection, field) => {
  if (!collection.fields.getByName(field.name)) collection.fields.add(field);
};

migrate((app) => {
  const devices = app.findCollectionByNameOrId("local_helper_devices");
  const users = app.findCollectionByNameOrId("users");
  addField(devices, new RelationField({
    id: "relation_local_helper_owner",
    name: "owner_user",
    collectionId: users.id,
    maxSelect: 1,
    minSelect: 0,
    cascadeDelete: false,
    required: false,
  }));
  addField(devices, textField("text_local_helper_owner_name", "owner_name", true));
  addField(devices, textField("text_local_helper_device_name", "device_name"));
  addField(devices, textField("text_local_helper_fingerprint", "device_fingerprint", true));
  addField(devices, new SelectField({
    id: "select_local_helper_status",
    name: "status",
    maxSelect: 1,
    values: ["pending_pair", "active", "revoked"],
    required: true,
  }));
  addField(devices, textField("text_local_helper_pair_hash", "pair_code_hash"));
  addField(devices, dateField("date_local_helper_pair_expires", "pair_code_expires_at"));
  addField(devices, textField("text_local_helper_token_hash", "access_token_hash"));
  addField(devices, textField("text_local_helper_version", "helper_version"));
  addField(devices, textField("text_local_helper_platform", "platform"));
  addField(devices, dateField("date_local_helper_last_seen", "last_seen_at"));
  addField(devices, new AutodateField({
    id: "autodate_local_helper_created",
    name: "created",
    onCreate: true,
    onUpdate: false,
  }));
  addField(devices, new AutodateField({
    id: "autodate_local_helper_updated",
    name: "updated",
    onCreate: true,
    onUpdate: true,
  }));
  devices.indexes = [
    "CREATE INDEX idx_local_helper_devices_owner ON local_helper_devices (owner_name)",
    "CREATE INDEX idx_local_helper_devices_status ON local_helper_devices (status)",
    "CREATE INDEX idx_local_helper_devices_pair_hash ON local_helper_devices (pair_code_hash)",
    "CREATE INDEX idx_local_helper_devices_token_hash ON local_helper_devices (access_token_hash)",
  ];
  app.save(devices);
}, (app) => {
  const devices = app.findCollectionByNameOrId("local_helper_devices");
  [
    "owner_user",
    "owner_name",
    "device_name",
    "device_fingerprint",
    "status",
    "pair_code_hash",
    "pair_code_expires_at",
    "access_token_hash",
    "helper_version",
    "platform",
    "last_seen_at",
    "created",
    "updated",
  ].forEach((name) => devices.fields.removeByName(name));
  devices.indexes = [];
  app.save(devices);
});
