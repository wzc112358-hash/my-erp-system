/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const notices = app.findCollectionByNameOrId("bid_notices");
  if (!notices.fields.getByName("assessment")) {
    notices.fields.add(new Field({
      name: "assessment",
      type: "text",
      required: false,
    }));
    app.save(notices);
  }
}, (app) => {
  const notices = app.findCollectionByNameOrId("bid_notices");
  if (notices.fields.getByName("assessment")) {
    notices.fields.removeByName("assessment");
    app.save(notices);
  }
});
