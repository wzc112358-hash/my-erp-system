# 附件系统修复文档

> 修复日期：2026-04-12
> 涉及问题：iPad 上传失败 + 附件链接域名错误 + single→multiple 适配

---

## 问题 1：iPad 上传附件失败（autoCancellation）

### 原因

PocketBase JS SDK 默认开启 `autoCancellation`，当上传请求（create/update + FormData）和后台轮询请求（30 秒一次的 `fetchUnreadCount`）同时触发时，SDK 会自动取消上传请求。iPad Safari 对并发请求的处理比桌面 Chrome 更严格，更容易触发此问题。

### 修复

**文件**：`frontend/src/lib/pocketbase.ts`

在第 26 行 `export const pb = new PocketBase(getApiBaseUrl());` 后添加：

```typescript
pb.autoCancellation = false;
```

---

## 问题 2：销售/采购用户查看附件提示"无法访问此页面"

### 原因

后端 API 域名实际是 `api-beijing.henghuacheng.cn` 和 `api-lanzhou.henghuacheng.cn`，但前端代码中有 20 处硬编码了不存在的域名 `api.henghuacheng.cn`。经理模块正确使用了 `${pb.baseUrl}` 动态生成 URL，所以能正常查看。

### 修复

将所有 `https://api.henghuacheng.cn/api/files/...` 替换为 `${pb.baseUrl}/api/files/...`，并添加 `import { pb } from '@/lib/pocketbase'`。

### 涉及文件（12 个文件，约 20 处）

| # | 文件 | 替换数 |
|---|------|--------|
| 1 | `pages/purchase/contracts/ContractDetail.tsx` | 2 处 |
| 2 | `pages/sales/contracts/ContractDetail.tsx` | 2 处 |
| 3 | `pages/sales/services/ServiceDetail.tsx` | 2 处 |
| 4 | `pages/sales/bidding/BiddingDetail.tsx` | 1 处（FILE_BASE 常量） |
| 5 | `pages/purchase/expenses/ExpenseDetail.tsx` | 2 处 |
| 6 | `pages/sales/receipts/ReceiptDetail.tsx` | 2 处 |
| 7 | `pages/sales/shipments/ShipmentDetail.tsx` | 2 处 |
| 8 | `pages/purchase/arrivals/ArrivalDetail.tsx` | 2 处 |
| 9 | `pages/sales/invoices/InvoiceDetail.tsx` | 1 处 |
| 10 | `pages/purchase/payments/PaymentDetail.tsx` | 2 处 |
| 11 | `pages/manager/OtherBusinessPage.tsx` | 1 处 |
| 12 | `pages/TestPage.tsx` | 1 处（测试代码） |

---

## 问题 3：附件字段 single → multiple 后前端适配

### 前提

在 PocketBase 管理后台，将所有附件字段从 `single` 手动改为 `multiple`。改动后 `attachments` 永远返回 `string[]`（空时为 `[]`），不再可能是单个 `string`。

### 3a. 类型定义简化（5 个文件，11 处）

将 `attachments?: string | string[]` 改为 `attachments?: string[]`：

| 文件 | 字段 | 处数 |
|------|------|------|
| `types/purchase-contract.ts` | `attachments` | 3 |
| `types/sales-contract.ts` | `attachments` | 3 |
| `types/service-contract.ts` | `attachments` | 2 |
| `types/expense-record.ts` | `attachments` | 1 |
| `types/bidding-record.ts` | `attachments` + `tender_fee_invoice` | 2 |

### 3b. 详情页删除 single-string else 分支（8 个文件）

从：
```tsx
Array.isArray(contract.attachments)
  ? contract.attachments.map(file => <a href={...}>{file}</a>)
  : (contract.attachments as string) && <a href={...}>{contract.attachments as string}</a>
```
改为：
```tsx
(contract.attachments || []).map(file => <a href={...}>{file}</a>)
```

| 文件 |
|------|
| `pages/purchase/contracts/ContractDetail.tsx` |
| `pages/sales/contracts/ContractDetail.tsx` |
| `pages/sales/services/ServiceDetail.tsx` |
| `pages/purchase/expenses/ExpenseDetail.tsx` |
| `pages/sales/receipts/ReceiptDetail.tsx` |
| `pages/sales/shipments/ShipmentDetail.tsx` |
| `pages/purchase/arrivals/ArrivalDetail.tsx` |
| `pages/purchase/payments/PaymentDetail.tsx` |

### 3c. 经理页面简化（2 个文件）

`ContractDetailPage.tsx` 第 351 行和 `ProgressFlowPage.tsx` 第 282 行：

从：
```tsx
Array.isArray(attachments) ? attachments : [attachments]
```
改为：
```tsx
attachments || []
```

### 3d. 其他页面中的 `tender_fee_invoice` 同理处理

- `types/bidding-record.ts`：`tender_fee_invoice?: string | string[]` → `string[]`
- `pages/sales/bidding/BiddingDetail.tsx`：`FILE_BASE` + 渲染逻辑

---

## 问题 4：销售合同详情页发货表格多余列

### 原因

`pages/sales/contracts/ContractDetail.tsx` 的发货批次表格（`shipmentColumns`）包含了「运费」「运费状态」「发票状态」三列，对应字段 `freight`、`freight_status`、`invoice_status`。但销售发货（`sales_shipments`）不含这些字段，这三列一直显示空值。

### 修复

**文件**：`pages/sales/contracts/ContractDetail.tsx`

从 `shipmentColumns` 数组中删除以下三列：
- `{ title: '运费', dataIndex: 'freight', ... }`
- `{ title: '运费状态', dataIndex: 'freight_status', ... }`
- `{ title: '发票状态', dataIndex: 'invoice_status', ... }`

保留列：运输合同号、发货日期、数量、物流公司

---

## 问题 5：销售合同详情页收款日期字段名错误

### 原因

`receiptColumns` 中收款日期的 `dataIndex` 写成了 `'receipt_date'`，但 `SaleReceipt` 类型中实际字段名是 `receive_date`（参考实施指南 10.5），导致收款日期列始终为空。

### 修复

**文件**：`pages/sales/contracts/ContractDetail.tsx`

将 `dataIndex: 'receipt_date'` 改为 `dataIndex: 'receive_date'`。

---

## 问题 6：采购合同详情页子信息表格字段不匹配

### 原因

采购合同详情页（`pages/purchase/contracts/ContractDetail.tsx`）中到货/收票/付款三个表格的列定义与实际 PocketBase 集合字段严重不匹配：

**到货表（arrivalColumns）**：
- 使用 `plan_date`、`actual_date` → 实际字段是 `shipment_date`
- 使用 `freight`、`freight_status` → 实际字段是 `freight_1`、`freight_2`、`freight_1_status`、`freight_2_status`
- 缺少：`shipment_address`、`wether_transit`、`transit_warehouse`、`delivery_address`、`miscellaneous_expenses`、`freight_1_date`、`freight_2_date`、`invoice_1_status`、`invoice_2_status`

**收票表（invoiceColumns）**：
- 缺少：`manager_confirmed` 确认状态

**付款表（paymentColumns）**：
- 使用 `recipient`（收款单位） → 该字段不存在
- 缺少：`manager_confirmed` 确认状态

### 修复

**文件**：`pages/purchase/contracts/ContractDetail.tsx`

按实施指南 10.5 规范重写三个表格列定义：

**到货表（参考 10.5 采购发货信息）**：

| 列标题 | dataIndex |
|--------|-----------|
| 品名 | product_name |
| 运单号 | tracking_contract_no |
| 发货日期 | shipment_date |
| 数量(吨) | quantity |
| 物流公司 | logistics_company |
| 发货地址 | shipment_address |
| 是否中转 | wether_transit |
| 中转仓库 | transit_warehouse |
| 送货地址 | delivery_address |
| 运费1 | freight_1 |
| 运费2 | freight_2 |
| 杂费 | miscellaneous_expenses |
| 运费1状态 | freight_1_status |
| 运费2状态 | freight_2_status |
| 运费1日期 | freight_1_date |
| 运费2日期 | freight_2_date |
| 运费1开票状态 | invoice_1_status |
| 运费2开票状态 | invoice_2_status |
| 确认状态 | manager_confirmed |
| 备注 | remark |

**收票表（参考 10.5 采购发票信息）**：

| 列标题 | dataIndex |
|--------|-----------|
| 发票号 | no |
| 品名 | product_name |
| 发票类型 | invoice_type |
| 产品金额 | product_amount |
| 发票金额 | amount |
| 收票日期 | receive_date |
| 是否验票 | is_verified |
| 确认状态 | manager_confirmed |
| 备注 | remark |

**付款表（参考 10.5 采购付款信息）**：

| 列标题 | dataIndex |
|--------|-----------|
| 付款编号 | no |
| 品名 | product_name |
| 产品金额 | product_amount |
| 付款金额 | amount |
| 付款日期 | pay_date |
| 付款方式 | method |
| 确认状态 | manager_confirmed |
| 备注 | remark |

**文件**：`types/purchase-contract.ts`

`PurchaseArrival` 接口需要更新为与实际 `purchase_arrivals` 集合一致的字段（参考 `types/purchase-arrival.ts`）。

---

## 修改文件总清单

| 类别 | 文件数 | 说明 |
|------|--------|------|
| autoCancellation | 1 | ✅ 已完成 |
| 域名修复 | 12 | ✅ 已完成 |
| 类型定义 | 5 | ✅ 已完成 |
| 详情页渲染简化 | 8 | ✅ 已完成 |
| 经理页面简化 | 2 | ✅ 已完成 |
| 销售发货表删列 | 1 | ✅ 已完成 |
| 销售收款日期字段名 | 1 | ✅ 已完成 |
| 采购详情页重做 | 1 | ✅ 已完成 |
| 采购类型修正 | 1 | ✅ 已完成 |

---

## 问题 7：合同详情页子记录表格缺少点击跳转

### 需求

在销售/采购合同详情页中，子信息表格（发货、发票、收付款等）的每一行应可点击跳转到对应的详情页面。

### 修复

**文件 1**：`pages/sales/contracts/ContractDetail.tsx`

为三个表格添加操作列（查看按钮）：
- 发货批次 → `/sales/shipments/${record.id}`
- 发票记录 → `/sales/invoices/${record.id}`
- 收款记录 → `/sales/receipts/${record.id}`

**文件 2**：`pages/purchase/contracts/ContractDetail.tsx`

为三个表格添加操作列（查看按钮）：
- 到货批次 → `/purchase/arrivals/${record.id}`
- 收票记录 → `/purchase/invoices/${record.id}`
- 付款记录 → `/purchase/payments/${record.id}`

---

## 问题 8：销售合同详情页投标记录「查看」按钮样式不统一

### 原因

投标记录的操作列使用 `<Button type="link">` 样式（蓝色链接样式），与其他子表格的操作按钮风格不统一。应改为与整站一致的按钮样式。

### 修复

**文件**：`pages/sales/contracts/ContractDetail.tsx`

将投标记录的查看按钮从 `<Button type="link">` 改为 `<Button size="small">` 样式，与页面其他操作按钮保持一致。

---

## 问题 9：通知中心添加快捷跳转创建关联合同按钮

### 需求

- 采购通知中心：收到「销售合同创建」通知后，添加一个按钮可直接跳转到新增采购合同页面，并自动填充关联的销售合同
- 销售通知中心：收到「采购合同创建」通知后，添加一个按钮可直接跳转到新增销售合同页面，并自动填充关联的采购合同

### 修改方案

通过 URL search params 传递预填充参数：

**采购端（通知 → 新增采购合同）**：
- 通知详情 Modal footer 添加「去创建采购合同」按钮
- 点击后 navigate 到 `/purchase/contracts?salesContract=salesContractId`
- `ContractList.tsx`（采购）读取 URL 参数，自动打开表单并预填充 `sales_contract` 字段

**销售端（通知 → 新增销售合同）**：
- 通知详情 Modal footer 添加「去创建销售合同」按钮
- 点击后 navigate 到 `/sales/contracts?purchaseContract=purchaseContractId`
- `ContractList.tsx`（销售）读取 URL 参数，自动打开表单并预填充 `purchase_contract` 字段

### 涉及文件（4 个）

| 文件 | 修改内容 |
|------|----------|
| `pages/purchase/notifications/NotificationList.tsx` | Modal footer 添加「去创建采购合同」按钮 |
| `pages/sales/notifications/NotificationList.tsx` | Modal footer 添加「去创建销售合同」按钮 |
| `pages/purchase/contracts/ContractList.tsx` | 读取 URL 参数 `salesContract`，自动打开表单并预填充 |
| `pages/sales/contracts/ContractList.tsx` | 读取 URL 参数 `purchaseContract`，自动打开表单并预填充 |

---

## 问题 10：采购模块不应显示销售合同的单价和总金额

### 需求

采购用户查看关联销售合同时，不应看到「单价」和「总金额」，但「数量」可以显示。涉及两处：

1. **采购合同详情页**：点击关联销售合同链接弹出的 Modal
2. **采购通知中心**：通知详情中的销售合同信息 + 查看销售合同 Modal

### 修改方案

**文件 1**：`pages/purchase/contracts/ContractDetail.tsx`

销售合同 Modal（第 310-321 行）中删除：
- `<Descriptions.Item label="合同金额">¥{salesContract.total_amount?.toLocaleString()}</Descriptions.Item>`
- `<Descriptions.Item label="产品单价">¥{salesContract.unit_price?.toLocaleString()}</Descriptions.Item>`

保留：合同编号、合同状态、产品名称、客户、签订日期、产品数量

**文件 2**：`pages/purchase/notifications/NotificationList.tsx`

通知详情 Modal（第 262-269 行）中删除：
- `<p>合同金额：¥{...total_amount?.toLocaleString()}</p>`

销售合同详情 Modal（第 286-338 行）中删除：
- `<Descriptions.Item label="产品单价">` (第 296-297 行)
- `<Descriptions.Item label="合同总金额" span={2}>` (第 302-303 行)
- `<Descriptions.Item label="已收款金额">` (第 317-318 行)
- `<Descriptions.Item label="收款进度">` (第 320-321 行)
- `<Descriptions.Item label="欠款金额">` (第 323-324 行)
- `<Descriptions.Item label="欠款进度">` (第 326-327 行)
- `<Descriptions.Item label="已开票金额">` (第 329-330 行)
- `<Descriptions.Item label="开票进度">` (第 332-333 行)

保留：合同编号、产品名称、客户、合同总数量、签订日期、状态、已执行数量、执行进度、备注

---

## 问题 11：经理模块进度流程图改进

### 需求

1. **侧边栏红点通知**：将进度流程下拉框中的红色圆圈数字（待确认数）也显示在左侧导航栏的「流程进度」菜单项上，让经理更明显地看到有待处理项
2. **子节点连线**：销售合同的子信息（运输、发票、收款）和采购合同的子信息（到货、收票、付款）按创建先后顺序从左到右排列，用带箭头的线依次连接

### 修改方案

#### 11a. 侧边栏红点

**新建文件**：`stores/manager-pending.ts`

Zustand store，维护经理待确认总数（`pendingCount`），通过 `ComparisonAPI.getUncompletedContracts()` 获取所有合同的 `pendingCount` 求和。

**修改文件 1**：`layouts/MainLayout.tsx`

- 经理用户在 Layout 挂载时定时获取 pendingCount（30 秒轮询）
- 经理菜单中 `progress-flow` 项添加 `<Badge count={pendingCount}>`

**修改文件 2**：`pages/manager/ProgressFlowPage.tsx`

- 获取合同列表后同步更新 store 的 pendingCount

#### 11b. 子节点连线

**修改文件**：`pages/manager/ProgressFlowPage.tsx`

`buildFlowGraph` 函数修改：

1. **布局方向**：`rankdir` 从 `'TB'`（上到下）改为 `'LR'`（左到右），使节点自然从左到右排列
2. **Handle 位置**：`CustomFlowNode` 的 target Handle 改为 `Position.Left`，source Handle 改为 `Position.Right`
3. **销售合同子节点链**：将 `sales_shipments`、`sale_invoices`、`sale_receipts` 合并后按 `created` 排序，依次用线和箭头连接（SC → first → second → ...）
4. **采购合同子节点链**：对每个采购合同，将其 `purchase_arrivals`、`purchase_invoices`、`purchase_payments` 合并后按 `created` 排序，依次连接（PC → first → second → ...）
5. **线条样式**：沿用现有的 `smoothstep` + `MarkerType.ArrowClosed` 样式

---

## 问题 12：销售合同支持「不含税」单价填写模式

### 背景

当前销售合同的「产品单价」和「合同总金额」（`unit_price` × `total_quantity`）默认都按含税填写。但实际业务中有些合同按不含税单价签订，需要支持两种模式，并在所有展示页面正确标注，同时经理利润分析中的数据也要根据模式正确计算。

### 需求

1. 销售合同新增布尔字段 `is_price_excluding_tax`（默认 `false`）
2. 前端创建/编辑销售合同时，增加一个开关：「按不含税填写」
3. 所有显示销售合同单价/总金额的地方，根据此字段标注「含税」或「不含税」
4. 经理利润分析中，如果销售合同是不含税模式，则：
   - `total_amount` 是不含税金额
   - 含税金额 = `total_amount × 1.13`
   - 利润计算公式中的「销售含税」字段应使用 `total_amount × 1.13`

### 后端（PocketBase 管理后台手动操作）

在 `sales_contracts` 集合中新增字段：

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `is_price_excluding_tax` | Bool | `false` | `false` = 含税，`true` = 不含税 |

### 前端修改

#### 12a. 类型定义

**文件**：`types/sales-contract.ts`

`SalesContract` 接口新增：
```typescript
is_price_excluding_tax: boolean;
```

`SalesContractFormData` 和 `SalesContractCreateData` 同样新增：
```typescript
is_price_excluding_tax?: boolean;
```

**文件**：`types/comparison.ts`

`ComparisonSalesContract` 接口新增：
```typescript
is_price_excluding_tax: boolean;
```

#### 12b. 销售合同表单

**文件**：`pages/sales/contracts/ContractForm.tsx`

在「产品单价」字段前添加一个 Switch 或 Checkbox：
- 标签：「按不含税单价填写」
- 默认关闭（即含税模式）
- 开启后，表单中「产品单价」的 label 变为「产品单价（不含税）」，「合同总金额」变为「合同总金额（不含税）」

**文件**：`pages/sales/contracts/ContractList.tsx`

创建/编辑提交时将 `is_price_excluding_tax` 传入提交数据。

#### 12c. 销售合同详情页

**文件**：`pages/sales/contracts/ContractDetail.tsx`

「产品单价」和「合同金额」的标签根据 `is_price_excluding_tax` 动态显示：
- `false` → 「产品单价」「合同金额」（保持不变，含税）
- `true` → 「产品单价（不含税）」「合同金额（不含税）」

#### 12d. 采购合同详情页（关联销售合同 Modal）

**文件**：`pages/purchase/contracts/ContractDetail.tsx`

当前已隐藏单价和总金额（问题 10），此处无需修改。产品数量仍可显示。

#### 12e. 通知中心

**文件**：`pages/sales/notifications/NotificationList.tsx`

采购合同信息中的「合同金额」标签无需改动（采购合同不存在不含税模式）。

**文件**：`pages/purchase/notifications/NotificationList.tsx`

当前已隐藏单价和总金额（问题 10），此处无需修改。

#### 12f. 经理模块 — 合同详情页（利润分析）

**文件**：`pages/manager/ContractDetailPage.tsx`

**销售合同基本信息**（第 238-239 行）：
- 「总金额」标签：根据 `is_price_excluding_tax` 显示「总金额（不含税）」或「总金额」
- 「单价」标签：同理

**利润分析卡片**（`calcProfit` 函数，第 29-49 行）：

当前公式：
```
salesAmountIncTax = sc.total_amount              // 假设含税
salesAmountExTax = sc.total_amount / 1.13        // 反推不含税
```

修改后：
```typescript
const isExTax = sc.is_price_excluding_tax;
const salesAmountIncTax = isExTax ? sc.total_amount * 1.13 : sc.total_amount;
const salesAmountExTax = isExTax ? sc.total_amount : sc.total_amount / 1.13;
```

利润计算公式中所有引用 `sc.total_amount` 的地方，都应使用 `salesAmountIncTax`（含税）和 `salesAmountExTax`（不含税）来替代：

- `operatingProfit` = `salesAmountExTax - purchaseTotalAmount / 1.13 - totalFreight - totalMiscellaneous`
- `taxAmount` = `(salesAmountIncTax - purchaseTotalAmount) * 0.1881`
- `netProfit` = `salesAmountIncTax - purchaseTotalAmount - taxAmount - totalFreight - totalMiscellaneous`

公式说明文字也需更新。

#### 12g. 经理模块 — 关联合同对比页

**文件**：`api/comparison.ts`

`getComparisonData`（第 347-360 行）和 `getContractDetail`（第 484-496 行）的 `ProfitAnalysis` 计算：

```typescript
const isExTax = salesContract.is_price_excluding_tax;
const salesIncTax = isExTax ? salesContract.total_amount * 1.13 : salesContract.total_amount;
const salesExTax = isExTax ? salesContract.total_amount : salesContract.total_amount / 1.13;

profit: {
  ...
  total_profit: salesExTax - purchaseTotalAmount / 1.13 - totalFreight - totalMiscellaneous,
  sales_amount: salesContract.total_amount,   // 保持原始值
  ...
}
```

`unit_profit` 也需调整：
- 含税模式：`salesContract.unit_price - purchaseContracts[0].unit_price`（不变）
- 不含税模式：`salesContract.unit_price * 1.13 - purchaseContracts[0].unit_price`

#### 12h. 经理模块 — 数据报表页

**文件**：`api/report.ts`

报表利润计算中引用 `sc.total_amount` 的地方（第 326-331 行、第 383-385 行）同理需要根据 `is_price_excluding_tax` 调整含税/不含税换算。

**文件**：`pages/manager/ReportPage.tsx`

报表表格列中「销售单价」「合同金额」等标签，根据合同的不含税标记动态标注。

#### 12i. 经理模块 — 流程进度页

**文件**：`pages/manager/ProgressFlowPage.tsx`

`renderModalDetail` 函数中 `sales_contract` case（第 299-316 行）：
- 「总金额」标签根据 `is_price_excluding_tax` 标注（不含税）
- 「单价」标签同理

#### 12j. 经理模块 — 其他页面

| 文件 | 修改 |
|------|------|
| `pages/manager/OverviewPage.tsx` | 总金额标注（不含税） |
| `pages/manager/PerformancePage.tsx` | 总金额、单价标注 |
| `pages/manager/OtherBusinessPage.tsx` | 单价标注 |

#### 12k. 销售子页面（显示关联合同金额）

| 文件 | 修改 |
|------|------|
| `pages/sales/shipments/ShipmentDetail.tsx` | 合同总金额标注 |
| `pages/sales/receipts/ReceiptDetail.tsx` | 合同总金额标注 |
| `pages/sales/customers/CustomerDetail.tsx` | 合同金额标注 |

### 涉及文件总清单

| # | 文件 | 修改内容 |
|---|------|----------|
| 1 | `types/sales-contract.ts` | 新增 `is_price_excluding_tax` 字段 |
| 2 | `types/comparison.ts` | `ComparisonSalesContract` 新增字段 |
| 3 | `pages/sales/contracts/ContractForm.tsx` | 新增不含税开关 |
| 4 | `pages/sales/contracts/ContractList.tsx` | 提交时传入字段 |
| 5 | `pages/sales/contracts/ContractDetail.tsx` | 标签动态标注 |
| 6 | `pages/manager/ContractDetailPage.tsx` | 利润分析公式 + 标签 |
| 7 | `api/comparison.ts` | 利润计算适配 |
| 8 | `api/report.ts` | 报表利润计算适配 |
| 9 | `pages/manager/ProgressFlowPage.tsx` | Modal 标签标注 |
| 10 | `pages/manager/ReportPage.tsx` | 报表列标注 |
| 11 | `pages/manager/OverviewPage.tsx` | 总金额标注 |
| 12 | `pages/manager/PerformancePage.tsx` | 总金额/单价标注 |
| 13 | `pages/manager/OtherBusinessPage.tsx` | 单价标注 |
| 14 | `pages/sales/shipments/ShipmentDetail.tsx` | 合同总金额标注 |
| 15 | `pages/sales/receipts/ReceiptDetail.tsx` | 合同总金额标注 |
| 16 | `pages/sales/customers/CustomerDetail.tsx` | 合同金额标注 |

---

## 问题 13：销售/采购合同支持跨境美元交易

### 背景

部分销售合同客户为境外客户，部分采购合同供应商为境外供应商，需要用美元结算。系统需要支持同一份合同同时显示美元和人民币两种金额，通过常量汇率自动换算。

### 需求

1. 销售/采购合同新增布尔字段 `is_cross_border`（默认 `false`）
2. 开启后，单价和总金额以美元（USD）填写
3. 前端根据常量汇率自动计算并显示对应的人民币金额
4. 合同的子信息（发货/到货、发票、收付款）也需要同时显示 USD 和 CNY
5. 所有相关展示页面（合同详情、经理模块、通知中心等）都需要体现双币种

### 汇率方案

在 PocketBase 中新建 `settings` 集合（单记录），存储汇率等全局配置。经理可在界面上随时修改汇率，无需改代码或重新部署。

#### 后端：新建 `settings` 集合

在 PocketBase 管理后台手动创建：

| 集合名 | 类型 | 说明 |
|--------|------|------|
| `settings` | Base collection | 全局配置，只存一条记录 |

字段：

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `usd_to_cny` | Number | `7.25` | 美元兑人民币汇率 |
| `key` | Text | `default` | 配置标识（用于查询） |

> 设置 API Rules 的 List/View 为公开或登录可见，Update/Create/Delete 仅经理可操作。

#### 前端：汇率获取 + 缓存

**新建文件**：`lib/exchange-rate.ts`

```typescript
import { pb } from '@/lib/pocketbase';

const DEFAULT_RATE = 7.25;
let cachedRate: number | null = null;

export const getUsdToCnyRate = async (): Promise<number> => {
  if (cachedRate !== null) return cachedRate;
  try {
    const settings = await pb.collection('settings').getFirstListItem(`key="default"`);
    cachedRate = settings.get?.('usd_to_cny') ?? DEFAULT_RATE;
    return cachedRate;
  } catch {
    return DEFAULT_RATE;
  }
};

export const updateUsdToCnyRate = async (rate: number): Promise<void> => {
  const settings = await pb.collection('settings').getFirstListItem(`key="default"`);
  await pb.collection('settings').update(settings.id, { usd_to_cny: rate });
  cachedRate = rate;
};

export const clearRateCache = () => { cachedRate = null; };

export const usdToCny = (usd: number, rate: number) => usd * rate;
export const formatUSD = (value: number) => `$${value?.toLocaleString()}`;
export const formatCNY = (value: number) => `¥${value?.toLocaleString()}`;
```

#### 经理模块：汇率设置入口

在经理侧边栏或设置页面中，添加「汇率设置」功能：
- 显示当前汇率（从 `settings` 集合读取）
- 经理可修改并保存
- 保存后更新前端缓存

> 不需要后端存储人民币金额字段，所有人民币金额由前端根据汇率实时计算显示。后端只存美元原始数据。

### 后端（PocketBase 管理后台手动操作）

**`sales_contracts` 集合**新增字段：

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `is_cross_border` | Bool | `false` | `false` = 国内交易（CNY），`true` = 跨境交易（USD） |

**`purchase_contracts` 集合**新增字段：

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `is_cross_border` | Bool | `false` | 同上 |

**后端 hooks**（`sales_contract.go`、`purchase_contract.go`）：

在 create hook 中添加默认值：
```go
if !e.Record.GetBool("is_cross_border") {
    e.Record.Set("is_cross_border", false)
}
```

### 前端修改

#### 13a. 类型定义

**文件**：`types/sales-contract.ts`

`SalesContract`、`SalesContractFormData`、`SalesContractCreateData` 新增：
```typescript
is_cross_border: boolean;
```

**文件**：`types/purchase-contract.ts`

`PurchaseContract`、`PurchaseContractFormData`、`PurchaseContractCreateData` 新增：
```typescript
is_cross_border: boolean;
```

**文件**：`types/comparison.ts`

`ComparisonSalesContract`、`ComparisonPurchaseContract` 新增：
```typescript
is_cross_border: boolean;
```

**文件**：`api/report.ts`

`SalesContractData`、`PurchaseContractData` 新增：
```typescript
is_cross_border: boolean;
```

#### 13b. 销售合同表单

**文件**：`pages/sales/contracts/ContractForm.tsx`

在「按不含税单价填写」Switch 旁添加「跨境交易（USD）」Switch：
- 默认关闭
- 开启后：
  - 「产品单价」label → 「产品单价（USD）」
  - 「合同总金额」label → 「合同总金额（USD）」
  - 金额显示前缀 ¥ → $
  - 总金额下方额外显示一行「折合人民币：¥ xxx」

**文件**：`pages/sales/contracts/ContractList.tsx`

提交时传入 `is_cross_border` 字段。

#### 13c. 采购合同表单

**文件**：`pages/purchase/contracts/ContractForm.tsx`

同理添加「跨境交易（USD）」Switch，开启后单价和总金额切为美元显示。

**文件**：`pages/purchase/contracts/ContractList.tsx`

提交时传入 `is_cross_border` 字段。

#### 13d. 销售合同详情页

**文件**：`pages/sales/contracts/ContractDetail.tsx`

当 `is_cross_border` 为 `true` 时：
- 「产品单价」→ 「产品单价（USD）」，值前缀 ¥ → $
- 「合同金额」→ 「合同总金额（USD）」，值前缀 ¥ → $
- 新增两行：
  - 「产品单价（CNY）」：`unit_price × 汇率`
  - 「合同总金额（CNY）」：`total_amount × 汇率`
- 收款/开票进度卡片中的金额同时显示 USD 和 CNY
- 欠款信息同时显示 USD 和 CNY

#### 13e. 采购合同详情页

**文件**：`pages/purchase/contracts/ContractDetail.tsx`

同理，当采购合同 `is_cross_border` 为 `true` 时：
- 单价/总金额切为 USD 显示
- 额外显示 CNY 折算
- 关联销售合同 Modal：如果销售合同是跨境的，也需标注 USD

#### 13f. 销售子信息页面

所有子信息页面如果关联合同是跨境的，需要同时显示 USD 和 CNY：

| 文件 | 修改 |
|------|------|
| `pages/sales/shipments/ShipmentDetail.tsx` | 合同总金额显示 USD + CNY |
| `pages/sales/shipments/ShipmentForm.tsx` | 数量字段不变，如有金额字段需标注 |
| `pages/sales/invoices/InvoiceDetail.tsx` | 发票金额显示 USD + CNY |
| `pages/sales/invoices/InvoiceForm.tsx` | 金额提示显示 USD |
| `pages/sales/receipts/ReceiptDetail.tsx` | 收款金额显示 USD + CNY |
| `pages/sales/receipts/ReceiptForm.tsx` | 金额提示显示 USD |

#### 13g. 采购子信息页面

| 文件 | 修改 |
|------|------|
| `pages/purchase/arrivals/ArrivalDetail.tsx` | 合同总金额 + 运费 + 杂费显示 USD + CNY |
| `pages/purchase/arrivals/ArrivalForm.tsx` | 运费/杂费如为跨境则标注 USD |
| `pages/purchase/invoices/InvoiceDetail.tsx` | 发票金额显示 USD + CNY |
| `pages/purchase/invoices/InvoiceForm.tsx` | 金额提示显示 USD |
| `pages/purchase/payments/PaymentDetail.tsx` | 付款金额显示 USD + CNY |
| `pages/purchase/payments/PaymentForm.tsx` | 金额提示显示 USD |

#### 13h. 经理模块 — 合同详情页

**文件**：`pages/manager/ContractDetailPage.tsx`

**销售合同基本信息**：
- 跨境时「总金额」→ 「总金额（USD）」，额外显示「总金额（CNY）」
- 「单价」同理

**利润分析**：
- 跨境销售合同时，`salesAmountIncTax` 和 `salesAmountExTax` 需要先折算为 CNY 再参与利润计算
- `sc.total_amount`（USD）× 汇率 = CNY 含税金额（或不含税，取决于 `is_price_excluding_tax`）
- 利润分析卡片新增汇率说明

**采购合同信息**：
- 跨境采购合同时，总金额/单价显示 USD + CNY

**子信息表格**：
- 发货/到货/发票/收付款表格中的金额列，如果关联的合同是跨境的，同时显示 USD 和 CNY

#### 13i. 经理模块 — 流程进度页

**文件**：`pages/manager/ProgressFlowPage.tsx`

`renderModalDetail` 中 `sales_contract` 和 `purchase_contract` case：
- 跨境时金额显示 USD + CNY

#### 13j. 经理模块 — 数据报表页

**文件**：`api/report.ts`

报表利润计算中，如果销售合同或采购合同是跨境的，金额需先 × 汇率转为 CNY 再计算利润。

**文件**：`pages/manager/ReportPage.tsx`

报表表格中跨境合同的金额列标注 USD，并额外显示 CNY 列。

#### 13k. 经理模块 — 其他页面

| 文件 | 修改 |
|------|------|
| `pages/manager/OverviewPage.tsx` | 跨境合同卡片金额显示 USD + CNY |
| `pages/manager/PerformancePage.tsx` | 跨境合同金额标注 |

#### 13l. 通知中心

| 文件 | 修改 |
|------|------|
| `pages/purchase/notifications/NotificationList.tsx` | 销售合同信息中跨境时标注 USD |
| `pages/sales/notifications/NotificationList.tsx` | 采购合同信息中跨境时标注 USD |

#### 13m. 后端 hooks — 通知消息

**文件**：`backend/hooks/sales_contract.go`

通知消息中如果 `is_cross_border` 为 `true`，金额前缀改为 `$` 并标注 USD：

```go
if e.Record.GetBool("is_cross_border") {
    message = fmt.Sprintf("...金额: $%.4f USD（约 ¥%.4f CNY）", amount, amount * 7.25)
} else {
    message = fmt.Sprintf("...金额: ¥%.4f元", amount)
}
```

**文件**：`backend/hooks/purchase_contract.go`

同理。

### 数据关系说明

```
跨境销售合同：
  unit_price (USD) × 汇率 = unit_price_cny (CNY)
  total_amount (USD) × 汇率 = total_amount_cny (CNY)

跨境采购合同：
  同理

子信息（发票/收付款）：
  amount (USD) — 存储原始美元金额
  amount_cny = amount × 汇率 — 前端计算显示

利润分析：
  所有金额统一换算为 CNY 后再计算
```

### 涉及文件总清单

| # | 文件 | 修改内容 |
|---|------|----------|
| 0 | `lib/exchange-rate.ts` | **新建** 汇率常量 + 工具函数 |
| 1 | `types/sales-contract.ts` | 新增 `is_cross_border` |
| 2 | `types/purchase-contract.ts` | 新增 `is_cross_border` |
| 3 | `types/comparison.ts` | 两个接口新增字段 |
| 4 | `types/sales-shipment.ts` | expand 类型新增字段 |
| 5 | `api/report.ts` | 报表利润计算适配跨境 |
| 6 | `api/comparison.ts` | 利润计算适配跨境 |
| 7 | `pages/sales/contracts/ContractForm.tsx` | 新增跨境 Switch + USD 显示 |
| 8 | `pages/sales/contracts/ContractList.tsx` | 提交字段 |
| 9 | `pages/sales/contracts/ContractDetail.tsx` | 双币种显示 |
| 10 | `pages/purchase/contracts/ContractForm.tsx` | 新增跨境 Switch + USD 显示 |
| 11 | `pages/purchase/contracts/ContractList.tsx` | 提交字段 |
| 12 | `pages/purchase/contracts/ContractDetail.tsx` | 双币种显示 |
| 13 | `pages/sales/shipments/ShipmentDetail.tsx` | 双币种 |
| 14 | `pages/sales/invoices/InvoiceDetail.tsx` | 双币种 |
| 15 | `pages/sales/invoices/InvoiceForm.tsx` | USD 提示 |
| 16 | `pages/sales/receipts/ReceiptDetail.tsx` | 双币种 |
| 17 | `pages/sales/receipts/ReceiptForm.tsx` | USD 提示 |
| 18 | `pages/purchase/arrivals/ArrivalDetail.tsx` | 双币种 |
| 19 | `pages/purchase/arrivals/ArrivalForm.tsx` | USD 提示 |
| 20 | `pages/purchase/invoices/InvoiceDetail.tsx` | 双币种 |
| 21 | `pages/purchase/invoices/InvoiceForm.tsx` | USD 提示 |
| 22 | `pages/purchase/payments/PaymentDetail.tsx` | 双币种 |
| 23 | `pages/purchase/payments/PaymentForm.tsx` | USD 提示 |
| 24 | `pages/manager/ContractDetailPage.tsx` | 利润分析 + 双币种 |
| 25 | `pages/manager/ProgressFlowPage.tsx` | Modal 双币种 |
| 26 | `pages/manager/ReportPage.tsx` | 报表双币种 |
| 27 | `pages/manager/OverviewPage.tsx` | 双币种 |
| 28 | `pages/manager/PerformancePage.tsx` | 双币种 |
| 29 | `pages/purchase/notifications/NotificationList.tsx` | USD 标注 |
| 30 | `pages/sales/notifications/NotificationList.tsx` | USD 标注 |
| 31 | `backend/hooks/sales_contract.go` | 通知消息 USD 标注 + 默认值 |
| 32 | `backend/hooks/purchase_contract.go` | 通知消息 USD 标注 + 默认值 |
