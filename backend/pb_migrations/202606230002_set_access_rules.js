/// <reference path="../pb_data/types.d.ts" />

// 收敛 PocketBase 访问规则（安全缺口修补）。
//
// 现状（已核实生产 pb_data）：业务集合 + 通知集合的 list/view/create/update/delete
// 规则全部为空字符串 ""，即「公开匿名可读写」。任何未登录的人都能拉走全部
// 合同/发票/收付款/通知数据。本迁移把规则收敛为「登录即可」（保持前端行为不变），
// 并给通知加上 recipient 维度的过滤（用户只能看发给自己的通知）。
//
// 策略（保守、行为保持）：
//   业务表（合同/发票/收付款/发货/到货）：list/view/create/update/delete = "@request.auth.id != ''"
//     —— 登录即可读写全部记录，与现状「公开」对已登录用户完全等价，仅挡住匿名访问。
//   通知（notifications / notifications_02）：
//     list/view = "recipient = @request.auth.id || recipient = @request.auth.type || @request.auth.type = 'manager'"
//       —— 用户看发给自己的（user id）+ 发给自己角色的（"sales"/"purchasing" 广播）+ 经理看全部。
//       与前端现有过滤 (recipient = userId || recipient = userType) 一致。
//     create/update/delete = "@request.auth.type = 'manager'"
//       —— 通知由后端 hook 写入（server-side Save，绕过规则），客户端仅经理可改。
//
// 幂等：重复运行只覆盖为相同规则，无副作用。
// 注意：PocketBase serve 不自动执行 JS 迁移，生产端用 Admin API 手动应用。

// 通知类集合：按 recipient 过滤
// 注意：每个分支都用 @request.auth.id != "" 门控，避免匿名用户匹配
// recipient="" 的记录（'' = '' = true 会导致空 recipient 通知泄露给所有人）。
// 本地 PocketBase 实测验证：匿名=0条、销售看自己角色+指定、采购看自己角色、经理看全部。
const NOTIFICATION_LIST_VIEW =
  "(@request.auth.id != \"\" && recipient = @request.auth.id) || (@request.auth.id != \"\" && recipient = @request.auth.type) || (@request.auth.type = \"manager\")";
const NOTIFICATION_WRITE = "@request.auth.type = \"manager\"";

// 业务表：登录即可
const AUTH_REQUIRED = "@request.auth.id != ''";

const RULE_SPECS = [
  // 业务集合（销售/采购 合同、子记录）
  { name: "sales_contracts",   lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "purchase_contracts", lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "sales_shipments",   lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "purchase_arrivals", lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "sale_invoices",     lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "purchase_invoices", lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "sale_receipts",     lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "purchase_payments", lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  // 其余业务/基础数据集合（同样收敛为登录可读）
  { name: "customers",         lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "suppliers",         lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "service_contracts", lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "service_orders",    lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "expense_records",   lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "inventory",         lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "stock_movements",   lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  { name: "bidding_records",   lv: AUTH_REQUIRED, cud: AUTH_REQUIRED },
  // 通知集合（按 recipient 过滤）
  { name: "notifications",     lv: NOTIFICATION_LIST_VIEW, cud: NOTIFICATION_WRITE },
  { name: "notifications_02",  lv: NOTIFICATION_LIST_VIEW, cud: NOTIFICATION_WRITE },
];

const setRules = (collection, listRule, cudRule) => {
  collection.listRule = listRule;
  collection.viewRule = listRule;
  collection.createRule = cudRule;
  collection.updateRule = cudRule;
  collection.deleteRule = cudRule;
};

migrate((app) => {
  for (const spec of RULE_SPECS) {
    let collection;
    try {
      collection = app.findCollectionByNameOrId(spec.name);
    } catch {
      console.log("[migration] collection not found, skip:", spec.name);
      continue;
    }
    setRules(collection, spec.lv, spec.cud);
    app.save(collection);
    console.log("[migration] set rules for", spec.name, "→ list/view:", spec.lv);
  }
}, (app) => {
  // 回滚：恢复为公开规则（与迁移前生产状态一致）
  for (const spec of RULE_SPECS) {
    let collection;
    try {
      collection = app.findCollectionByNameOrId(spec.name);
    } catch {
      continue;
    }
    setRules(collection, "", "");
    app.save(collection);
  }
});
