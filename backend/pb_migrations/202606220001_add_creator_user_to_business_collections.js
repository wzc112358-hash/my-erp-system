/// <reference path="../pb_data/types.d.ts" />

// 给 6 个业务集合补 creator_user 字段（relation → users），
// 用于经理确认时把通知发给"创建该记录的员工"。
//
// 背景：合同/费用/投标表已有 creator_user 字段且前端创建时会传值；
// 但 sales_shipments / purchase_arrivals / sale_invoices /
// purchase_invoices / sale_receipts / purchase_payments 这 6 个表
// 既没有 creator_user 字段，hook 里却用 GetString("creator") 读取
// 一个不存在的字段，导致经理确认通知的 recipient 永远为空，
// 员工收不到"经理已确认"通知。本迁移补齐字段，hook 改读 creator_user。
const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
};

migrate((app) => {
  // 每个 collection 用独立的 relation field id（relation + 10 位数字）
  const specs = [
    { name: "sales_shipments",  fieldId: "relation2026062201" },
    { name: "purchase_arrivals", fieldId: "relation2026062202" },
    { name: "sale_invoices",    fieldId: "relation2026062203" },
    { name: "purchase_invoices", fieldId: "relation2026062204" },
    { name: "sale_receipts",    fieldId: "relation2026062205" },
    { name: "purchase_payments", fieldId: "relation2026062206" },
  ];

  for (const spec of specs) {
    const collection = findCollection(app, spec.name);
    if (!collection) {
      console.log("[migration] collection not found, skip:", spec.name);
      continue;
    }

    if (collection.fields.getByName("creator_user")) {
      console.log("[migration] creator_user already exists, skip:", spec.name);
      continue;
    }

    collection.fields.add(new Field({
      "cascadeDelete": false,
      "collectionId": "_pb_users_auth_",
      "hidden": false,
      "id": spec.fieldId,
      "maxSelect": 1,
      "minSelect": 0,
      "name": "creator_user",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "relation",
    }));

    app.save(collection);
    console.log("[migration] added creator_user to", spec.name);
  }
}, (app) => {
  const names = [
    "sales_shipments",
    "purchase_arrivals",
    "sale_invoices",
    "purchase_invoices",
    "sale_receipts",
    "purchase_payments",
  ];

  for (const name of names) {
    const collection = findCollection(app, name);
    if (!collection) {
      continue;
    }
    const field = collection.fields.getByName("creator_user");
    if (field) {
      collection.fields.removeById(field.getId());
      app.save(collection);
    }
  }
});
