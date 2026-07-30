/// <reference path="../pb_data/types.d.ts" />

const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
};

const textField = (id, name, required = false) => new TextField({
  id,
  name,
  required,
  max: 5000,
});

const dateField = (id, name) => new DateField({ id, name });

const idField = () => new TextField({
  id: "text3208210256",
  name: "id",
  required: true,
  primaryKey: true,
  system: true,
  autogeneratePattern: "[a-z0-9]{15}",
  pattern: "^[a-z0-9]+$",
  min: 15,
  max: 15,
});

migrate((app) => {
  if (findCollection(app, "local_helper_devices")) return;
  const users = app.findCollectionByNameOrId("users");
  const devices = new Collection({
    id: "pbc_local_helper_devices",
    name: "local_helper_devices",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE INDEX idx_local_helper_devices_owner ON local_helper_devices (owner_name)",
      "CREATE INDEX idx_local_helper_devices_status ON local_helper_devices (status)",
      "CREATE INDEX idx_local_helper_devices_pair_hash ON local_helper_devices (pair_code_hash)",
      "CREATE INDEX idx_local_helper_devices_token_hash ON local_helper_devices (access_token_hash)",
    ],
    fields: [
      idField(),
      new RelationField({
        id: "relation_local_helper_owner",
        name: "owner_user",
        collectionId: users.id,
        maxSelect: 1,
        minSelect: 0,
        cascadeDelete: false,
        required: false,
      }),
      textField("text_local_helper_owner_name", "owner_name", true),
      textField("text_local_helper_device_name", "device_name"),
      textField("text_local_helper_fingerprint", "device_fingerprint", true),
      new SelectField({
        id: "select_local_helper_status",
        name: "status",
        maxSelect: 1,
        values: ["pending_pair", "active", "revoked"],
        required: true,
      }),
      textField("text_local_helper_pair_hash", "pair_code_hash"),
      dateField("date_local_helper_pair_expires", "pair_code_expires_at"),
      textField("text_local_helper_token_hash", "access_token_hash"),
      textField("text_local_helper_version", "helper_version"),
      textField("text_local_helper_platform", "platform"),
      dateField("date_local_helper_last_seen", "last_seen_at"),
      new AutodateField({ id: "autodate_local_helper_created", name: "created", onCreate: true, onUpdate: false }),
      new AutodateField({ id: "autodate_local_helper_updated", name: "updated", onCreate: true, onUpdate: true }),
    ],
  });
  app.save(devices);
}, (app) => {
  const devices = findCollection(app, "local_helper_devices");
  if (devices) app.delete(devices);
});
