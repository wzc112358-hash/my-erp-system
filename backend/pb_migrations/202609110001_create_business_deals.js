/// <reference path="../pb_data/types.d.ts" />

const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
};

const addField = (collection, field) => {
  if (!collection.fields.getByName(field.name)) collection.fields.add(field);
};

const allRecords = (app, collectionName) => {
  const result = [];
  let offset = 0;
  const batchSize = 200;
  while (true) {
    const records = app.findRecordsByFilter(collectionName, 'deleted_at = ""', "id", batchSize, offset);
    result.push(...records);
    if (records.length < batchSize) break;
    offset += batchSize;
  }
  return result;
};

const relationIds = (record, field) => {
  const values = record.getStringSlice(field);
  if (values.length > 0) return values.filter(Boolean);
  const value = record.getString(field);
  return value ? [value] : [];
};

const earliestDate = (records) => {
  const dates = records.map((record) => record.getString("sign_date")).filter(Boolean).sort();
  return dates[0] || new Date().toISOString();
};

const dealName = (sales, purchases) => {
  const salesNos = sales.map((record) => record.getString("no") || record.id).join("、");
  const purchaseNos = purchases.map((record) => record.getString("no") || record.id).join("、");
  return `销售 ${salesNos} / 采购 ${purchaseNos}`.slice(0, 5000);
};

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const salesCollection = app.findCollectionByNameOrId("sales_contracts");
  const purchaseCollection = app.findCollectionByNameOrId("purchase_contracts");

  let taxRates = findCollection(app, "profit_tax_rates");
  if (!taxRates) {
    taxRates = new Collection({
      id: "pbc_profit_tax_rates",
      name: "profit_tax_rates",
      type: "base",
      system: false,
    });
    app.save(taxRates);
  }
  addField(taxRates, new NumberField({ id: "number_profit_tax_rate", name: "rate", required: true, min: 0, max: 1 }));
  addField(taxRates, new DateField({ id: "date_profit_tax_effective", name: "effective_from", required: true }));
  addField(taxRates, new RelationField({
    id: "relation_profit_tax_creator",
    name: "created_by",
    collectionId: users.id,
    maxSelect: 1,
    minSelect: 0,
    cascadeDelete: false,
  }));
  addField(taxRates, new AutodateField({
    id: "autodate_profit_tax_created",
    name: "created",
    onCreate: true,
    onUpdate: false,
  }));
  taxRates.listRule = "@request.auth.type = 'manager'";
  taxRates.viewRule = "@request.auth.type = 'manager'";
  taxRates.createRule = null;
  taxRates.updateRule = null;
  taxRates.deleteRule = null;
  taxRates.indexes = [
    "CREATE UNIQUE INDEX idx_profit_tax_rates_effective ON profit_tax_rates (effective_from)",
  ];
  app.save(taxRates);
  if (app.findRecordsByFilter("profit_tax_rates", 'id != ""', "", 1, 0).length === 0) {
    const defaultRate = new Record(taxRates);
    defaultRate.set("rate", 0.1881);
    defaultRate.set("effective_from", "1970-01-01 00:00:00.000Z");
    app.save(defaultRate);
  }

  let deals = findCollection(app, "business_deals");
  if (!deals) {
    deals = new Collection({
      id: "pbc_business_deals",
      name: "business_deals",
      type: "base",
      system: false,
    });
    app.save(deals);
  }
  addField(deals, new TextField({ id: "text_business_deal_name", name: "name", required: true, max: 5000 }));
  addField(deals, new DateField({ id: "date_business_deal_date", name: "deal_date", required: true }));
  addField(deals, new RelationField({
    id: "relation_business_deal_sales",
    name: "sales_contracts",
    collectionId: salesCollection.id,
    maxSelect: 999,
    minSelect: 0,
    cascadeDelete: false,
  }));
  addField(deals, new RelationField({
    id: "relation_business_deal_purchases",
    name: "purchase_contracts",
    collectionId: purchaseCollection.id,
    maxSelect: 999,
    minSelect: 0,
    cascadeDelete: false,
  }));
  addField(deals, new NumberField({ id: "number_business_deal_tax", name: "tax_rate", required: true, min: 0, max: 1 }));
  addField(deals, new RelationField({
    id: "relation_business_deal_creator",
    name: "created_by",
    collectionId: users.id,
    maxSelect: 1,
    minSelect: 0,
    cascadeDelete: false,
  }));
  addField(deals, new DateField({ id: "date_business_deal_deleted", name: "deleted_at" }));
  addField(deals, new TextField({ id: "text_business_deal_deleted_by", name: "deleted_by", max: 5000 }));
  addField(deals, new AutodateField({ id: "autodate_business_deal_created", name: "created", onCreate: true, onUpdate: false }));
  addField(deals, new AutodateField({ id: "autodate_business_deal_updated", name: "updated", onCreate: true, onUpdate: true }));
  deals.listRule = "@request.auth.id != '' && deleted_at = ''";
  deals.viewRule = "@request.auth.id != '' && deleted_at = ''";
  deals.createRule = null;
  deals.updateRule = null;
  deals.deleteRule = null;
  deals.indexes = [
    "CREATE INDEX idx_business_deals_date ON business_deals (deal_date)",
    "CREATE INDEX idx_business_deals_deleted ON business_deals (deleted_at)",
  ];
  app.save(deals);

  for (const field of ["name", "deal_date", "sales_contracts", "purchase_contracts", "tax_rate", "deleted_at"]) {
    if (!deals.fields.getByName(field)) throw new Error(`business_deals.${field} was not created`);
  }

  // Convert the union of the two legacy relation directions into connected
  // components. Each component becomes exactly one overall business deal.
  if (app.findRecordsByFilter("business_deals", 'id != ""', "", 1, 0).length === 0) {
    const sales = allRecords(app, "sales_contracts");
    const purchases = allRecords(app, "purchase_contracts");
    const salesById = new Map(sales.map((record) => [record.id, record]));
    const purchasesById = new Map(purchases.map((record) => [record.id, record]));
    const adjacency = new Map();
    const addNode = (key) => {
      if (!adjacency.has(key)) adjacency.set(key, new Set());
    };
    const addEdge = (salesId, purchaseId) => {
      if (!salesById.has(salesId) || !purchasesById.has(purchaseId)) return;
      const salesKey = `s:${salesId}`;
      const purchaseKey = `p:${purchaseId}`;
      addNode(salesKey);
      addNode(purchaseKey);
      adjacency.get(salesKey).add(purchaseKey);
      adjacency.get(purchaseKey).add(salesKey);
    };

    for (const purchase of purchases) {
      for (const salesId of relationIds(purchase, "sales_contract")) addEdge(salesId, purchase.id);
    }
    for (const sale of sales) {
      for (const purchaseId of relationIds(sale, "purchase_contract")) addEdge(sale.id, purchaseId);
    }

    const visited = new Set();
    for (const start of adjacency.keys()) {
      if (visited.has(start)) continue;
      const queue = [start];
      const salesIds = [];
      const purchaseIds = [];
      visited.add(start);
      while (queue.length > 0) {
        const current = queue.shift();
        if (current.startsWith("s:")) salesIds.push(current.slice(2));
        else purchaseIds.push(current.slice(2));
        for (const next of adjacency.get(current) || []) {
          if (visited.has(next)) continue;
          visited.add(next);
          queue.push(next);
        }
      }
      if (salesIds.length === 0 || purchaseIds.length === 0) continue;
      salesIds.sort();
      purchaseIds.sort();
      const componentSales = salesIds.map((id) => salesById.get(id));
      const componentPurchases = purchaseIds.map((id) => purchasesById.get(id));
      const deal = new Record(deals);
      deal.set("name", dealName(componentSales, componentPurchases));
      deal.set("deal_date", earliestDate([...componentSales, ...componentPurchases]));
      deal.set("sales_contracts", salesIds);
      deal.set("purchase_contracts", purchaseIds);
      deal.set("tax_rate", 0.1881);
      app.save(deal);
    }
  }

  const logs = app.findCollectionByNameOrId("contract_operation_logs");
  const operation = logs.fields.getByName("operation");
  if (!operation.values.includes("tax_rate_change")) {
    operation.values = [...operation.values, "tax_rate_change"];
    app.save(logs);
  }
}, (app) => {
  const logs = findCollection(app, "contract_operation_logs");
  if (logs) {
    const operation = logs.fields.getByName("operation");
    operation.values = operation.values.filter((value) => value !== "tax_rate_change");
    app.save(logs);
  }
  const deals = findCollection(app, "business_deals");
  if (deals) app.delete(deals);
  const taxRates = findCollection(app, "profit_tax_rates");
  if (taxRates) app.delete(taxRates);
});
