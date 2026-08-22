/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const sources = app.findCollectionByNameOrId("bid_sources");
  let existing = null;
  try {
    existing = app.findFirstRecordByFilter("bid_sources", "source_key = 'cncec'");
  } catch (_) {
    // A missing source is the expected case on first deploy.
  }
  if (existing) return;

  const source = new Record(sources);
  source.set("source_key", "cncec");
  source.set("source_name", "中国化学电子招标投标平台");
  source.set("enabled", true);
  source.set("schedule_time", "08:00");
  source.set("last_status", "never");
  app.save(source);
}, (app) => {
  try {
    const source = app.findFirstRecordByFilter("bid_sources", "source_key = 'cncec'");
    app.delete(source);
  } catch (_) {
    // Keep rollback idempotent when the record has already been removed.
  }
});
