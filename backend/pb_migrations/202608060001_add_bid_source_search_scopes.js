/// <reference path="../pb_data/types.d.ts" />

const addField = (collection, field) => {
  if (!collection.fields.getByName(field.name)) collection.fields.add(field);
};

migrate((app) => {
  const sources = app.findCollectionByNameOrId("bid_sources");
  addField(sources, new TextField({
    id: "text_bid_source_search_scope",
    name: "search_scope",
    required: false,
    max: 5000,
  }));
  addField(sources, new TextField({
    id: "text_bid_scope_updated_by",
    name: "search_scope_updated_by",
    required: false,
    max: 5000,
  }));
  addField(sources, new DateField({
    id: "date_bid_scope_updated_at",
    name: "search_scope_updated_at",
  }));
  app.save(sources);
}, (app) => {
  const sources = app.findCollectionByNameOrId("bid_sources");
  ["search_scope", "search_scope_updated_by", "search_scope_updated_at"]
    .forEach((name) => sources.fields.removeByName(name));
  app.save(sources);
});
