/// <reference path="../pb_data/types.d.ts" />

// 修正 users.type 字段与生产 schema 的漂移。
//
// 背景：1770435186_updated_users.js 这个历史迁移定义了
//   name = "Type"（大写 T）, values = ["采购","销售","经理"]（中文）
// 但生产数据库经过 Admin UI 修改后，实际字段是
//   name = "type"（小写 t）, values = ["manager","purchasing","sales"]（英文）
// 而后端 hook（main.go GetUsersByType）和前端（auth.ts UserRole）全部按
// 小写 type + 英文值来判断角色。迁移文件与生产 schema 不一致是隐患：
// 一旦在新环境重建库，迁移会先写入中文/大写，再靠人工改库才能跑通。
// 本迁移把字段定义同步成生产实际形态（幂等，已是目标形态则跳过）。
//
// PocketBase JSVM 注意：Field 对象通过「直接属性赋值」修改
//   （如 field.values = [...]），不要用 field.get()/field.set()，那些方法不存在。
// 参考 https://pocketbase.io/docs/js-collections/ 的 "Update existing collection"。

const TARGET_VALUES = ["manager", "purchasing", "sales"];

migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_");

  // 1) 若存在历史大写 Type 字段，移除（漂移来源）
  const stale = collection.fields.getByName("Type");
  if (stale) {
    collection.fields.removeById(stale.getId());
    console.log("[migration] removed stale field 'Type' (capital T, Chinese values)");
  }

  // 2) 拿到 type 字段（小写）。若已是英文值（与顺序无关）则幂等跳过；否则直接改 .values 属性
  let typeField = collection.fields.getByName("type");
  if (typeField) {
    // 直接读属性（不是 .get()）
    const vals = typeField.values;
    // 与顺序无关的比较：只要三值都包含 manager/purchasing/sales 即认为已是英文形态
    const required = TARGET_VALUES;
    const matches = Array.isArray(vals) &&
      required.every((v) => vals.includes(v)) &&
      vals.every((v) => required.includes(v));
    if (matches) {
      console.log("[migration] users.type already synced to English values, skip");
      return;
    }
    // 直接属性赋值改值
    typeField.values = TARGET_VALUES;
  } else {
    // 不存在则新建（理论上不会发生，type 字段一直在）
    collection.fields.add(new SelectField({
      name: "type",
      required: true,
      maxSelect: 1,
      values: TARGET_VALUES,
    }));
  }

  app.save(collection);
  console.log("[migration] users.type synced to:", TARGET_VALUES.join(", "));
}, (app) => {
  // 回滚：还原为历史中文/大写形态
  const collection = app.findCollectionByNameOrId("_pb_users_auth_");
  const current = collection.fields.getByName("type");
  if (current) {
    collection.fields.removeById(current.getId());
  }
  collection.fields.add(new SelectField({
    name: "Type",
    required: true,
    maxSelect: 1,
    values: ["采购", "销售", "经理"],
  }));
  app.save(collection);
});
