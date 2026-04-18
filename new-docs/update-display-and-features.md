# 页面显示与功能优化

> 创建日期：2026-04-18
> 状态：实施中（1-7已完成，8待实施）

---

## 一、需求总览

| # | 需求 | 涉及页面 | 角色 |
|---|------|----------|------|
| 1 | 销售合同详情页子信息表格添加「货物数量」列 | `sales/contracts/ContractDetail` | 销售 |
| 2 | 采购合同详情页子信息表格添加「货物数量」列 | `purchase/contracts/ContractDetail` | 采购 |
| 3 | 经理总览页支持查看无关联销售合同的采购合同 | `manager/OverviewPage` + `ContractDetailPage` + API | 经理 |
| 4 | 经理总览页添加删除合同功能 | `manager/OverviewPage` + API | 经理 |
| 5 | 经理合同详情页销售合同信息添加「应收金额」（= 已执行数量 × 单价） | `manager/ContractDetailPage` | 经理 |
| 6 | 经理合同详情页子信息表格新增「货物数量」列（保留产品金额） | `manager/ContractDetailPage` | 经理 |
| 7 | 经理合同详情页应收金额改为「已执行数量 × 单价」 | `manager/ContractDetailPage` | 经理 |
| 8 | 销售合同「应收金额」「欠款」逻辑重构（前后端） | 后端 hooks + 销售合同详情/收款详情 + 经理详情 | 销售 + 经理 |

---

## 二、详细说明

### 2.1 销售合同详情页 — 子信息表格添加「货物数量」列

**文件**：`frontend/src/pages/sales/contracts/ContractDetail.tsx`

当前销售合同详情页有三个子信息表格：发货批次、发票记录、收款记录。其中：

- **发货批次**：已有「数量」列 ✓ 不需要改
- **发票记录**：缺少「货物数量」列 → 需新增
- **收款记录**：缺少「货物数量」列 → 需新增

#### 发票记录表格（invoiceColumns）新增列

在「发票类型」后面插入：

```
{ title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount' }
```

> 说明：发票记录中 `product_amount` 字段即为货物数量（吨），当前已有该字段但标签写的是「产品数量」，需改为「货物数量(吨)」以统一术语。

#### 收款记录表格（receiptColumns）新增列

在「收款日期」后面插入：

```
{ title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v || '-' }
```

> 说明：收款记录中 `product_amount` 即为对应货物数量。

---

### 2.2 采购合同详情页 — 子信息表格添加「货物数量」列

**文件**：`frontend/src/pages/purchase/contracts/ContractDetail.tsx`

当前采购合同详情页有三个子信息表格：到货批次、收票记录、付款记录。其中：

- **到货批次**：已有「数量(吨)」列 ✓ 不需要改
- **收票记录**：缺少「货物数量」列 → 需新增
- **付款记录**：缺少「货物数量」列 → 需新增

#### 收票记录表格（invoiceColumns）新增列

在「发票类型」后面插入：

```
{ title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v || '-' }
```

#### 付款记录表格（paymentColumns）新增列

在「付款编号」后面插入：

```
{ title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v || '-' }
```

---

### 2.3 经理总览页支持查看无关联销售合同的采购合同

#### 问题描述

当前 OverviewPage 只展示「销售合同 + 关联采购合同」的行。如果一个采购合同没有关联销售合同（`sales_contract` 为空），则该采购合同在总览页不可见，经理无法查看其详情。

#### 需要修改的文件

| 文件 | 说明 |
|------|------|
| `frontend/src/api/comparison.ts` | `getAllContractsForOverview` 返回数据中添加独立采购合同 |
| `frontend/src/pages/manager/OverviewPage.tsx` | 展示独立采购合同行，支持点击进入详情页 |
| `frontend/src/api/comparison.ts` | 新增 `getPurchaseContractDetail` 方法 |
| `frontend/src/pages/manager/ContractDetailPage.tsx` | 支持纯采购合同详情渲染（无销售合同 tab） |
| `frontend/src/types/comparison.ts` | `ContractDetailData` 的 `sales_contract` 改为可选 |

#### API 层改动

**`comparison.ts` — `getAllContractsForOverview`**

在返回结果中新增 `standalonePurchaseContracts`：

```typescript
// 已关联销售合同的采购合同 ID 集合
const associatedPurchaseIds = new Set(
  purchaseContracts.filter(pc => pc.sales_contract).map(pc => pc.id)
);

// 独立采购合同（无关联销售合同）
const standalonePurchaseContracts: OverviewContract[] = purchaseContracts
  .filter(pc => !associatedPurchaseIds.has(pc.id))
  .map(pc => ({
    id: pc.id,
    type: 'purchase' as const,
    no: pc.no,
    productName: pc.product_name,
    quantity: pc.total_quantity,
    totalAmount: pc.total_amount,
    paymentDate: purchasePaymentsMap.get(pc.id) || undefined,
    shipmentDate: purchaseArrivalsMap.get(pc.id) || undefined,
    created: pc.created_at || '',
    supplierName: pc.expand?.supplier?.name || pc.supplier_name || '-',
    associatedSalesIds: [],
  }));

return {
  salesContracts: overviewSalesContracts,
  purchaseContracts: overviewPurchaseContracts,
  standalonePurchaseContracts,  // 新增
};
```

**`comparison.ts` — 新增 `getPurchaseContractDetail`**

用于获取独立采购合同详情（不需要销售合同 ID）：

```typescript
getPurchaseContractDetail: async (purchaseContractId: string) => {
  // 获取采购合同信息
  // 获取关联到货/收票/付款记录
  // 返回 ContractDetailData（sales_contract 为 null）
}
```

#### OverviewPage 改动

1. 接收 `standalonePurchaseContracts` 数据
2. 在销售合同行列表下方，新增「独立采购合同」区域
3. 每个独立采购合同显示为卡片，包含：合同编号、品名、数量、总金额、供应商、到货日期
4. 点击卡片跳转到 `/manager/overview/purchase/:id`（新增路由）

#### 路由改动

**文件**：`frontend/src/routes/index.tsx`

新增路由：

```typescript
{ path: 'overview/purchase/:id', element: <ContractDetailPage /> }
```

#### ContractDetailPage 改动

1. `ContractDetailPage` 从 URL 判断是销售合同还是采购合同
2. 如果是 `/manager/overview/contract/:id` → 销售合同详情（现有逻辑）
3. 如果是 `/manager/overview/purchase/:id` → 采购合同详情
4. 采购合同详情页只显示采购合同 Tab（无销售合同 Tab、无利润分析）
5. 采购合同 Tab 中完整展示：基本信息 + 到货批次 + 收票记录 + 付款记录

---

### 2.4 经理总览页添加删除合同功能

**文件**：
- `frontend/src/pages/manager/OverviewPage.tsx`
- `frontend/src/api/sales-contract.ts`（确认 delete 方法是否存在）
- `frontend/src/api/purchase-contract.ts`（确认 delete 方法是否存在）

#### 功能说明

- 在每个销售合同卡片和独立采购合同卡片上添加删除按钮
- 点击删除时弹出确认框：「确定删除此合同？删除后将无法恢复。」
- 确认后调用 API 删除合同，刷新页面
- 注意：删除合同前应检查是否有关联子记录（发货/到货/发票/收付款），有关联记录时提示「该合同下存在关联记录，无法删除」

#### 实现要点

```typescript
const handleDeleteContract = async (type: 'sales' | 'purchase', id: string) => {
  // 1. 检查是否有关联子记录
  // 2. 如果有 → message.warning('该合同下存在关联记录，无法删除')
  // 3. 如果没有 → 确认框 → 删除 → 刷新
}
```

在 `SalesContractCard` 和独立采购合同卡片中添加删除按钮（红色删除图标），位于卡片右上角。

---

### 2.5 经理合同详情页销售合同信息添加「应收金额」

**文件**：`frontend/src/pages/manager/ContractDetailPage.tsx`

#### 功能说明

在经理合同详情页的「销售合同基本信息」表格中，在「已收金额」前面新增一行「应收金额」。

#### 计算规则

| 合同定价模式 | 应收金额 |
|-------------|----------|
| 含税单价模式（`is_price_excluding_tax = false`） | = 合同总金额（`total_amount`） |
| 不含税单价模式（`is_price_excluding_tax = true`） | = 合同总金额 × 1.13 |

跨境合同的显示方式与总金额一致（双币种）。

#### 实现位置

在 `ContractDetailPage.tsx` 的 `renderSalesInfo` 函数中，`Descriptions` 组件内，在「已收金额」之前插入：

```tsx
<Descriptions.Item label="应收金额">{应收金额显示}</Descriptions.Item>
```

---

### 2.6 经理合同详情页 — 子信息表格添加「货物数量」列

**文件**：`frontend/src/pages/manager/ContractDetailPage.tsx`

经理合同详情页中，销售合同和采购合同各有子信息表格（开票、收款、收票、付款）。当前这些表格中的 `product_amount` 字段显示为「产品金额」并格式化为货币。实际上 `product_amount` 代表货物数量（吨），需要将标签改为「货物数量(吨)」并以数字形式展示。

#### 涉及的表格

| 表格 | 变量名 | 操作 |
|------|--------|------|
| 销售发票 | `saleInvoiceColumns` | 保留「产品金额」列，新增「货物数量(吨)」列（`product_amount` 以数字显示） |
| 销售收款 | `saleReceiptColumns` | 保留「产品金额」列，新增「货物数量(吨)」列（`product_amount` 以数字显示） |
| 采购发票 | `purchaseInvoiceColumns` | 保留「产品金额」列，新增「货物数量(吨)」列（`product_amount` 以数字显示） |
| 采购付款 | `purchasePaymentColumns` | 保留「产品金额」列，新增「货物数量(吨)」列（`product_amount` 以数字显示） |

### 2.7 经理合同详情页 — 应收金额计算修正

**文件**：`frontend/src/pages/manager/ContractDetailPage.tsx`

#### 修正说明

应收金额的计算公式修正为：

```
应收金额 = 已执行数量（executed_quantity） × 单价（unit_price）
```

跨境合同的显示方式与总金额一致（双币种）。

---

## 三、修改文件总清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 修改 | 发票、收款表格添加货物数量列 |
| 2 | `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 修改 | 收票、付款表格添加货物数量列 |
| 3 | `frontend/src/api/comparison.ts` | 修改 | `getAllContractsForOverview` 返回独立采购合同；新增 `getPurchaseContractDetail` |
| 4 | `frontend/src/types/comparison.ts` | 修改 | `ContractDetailData.sales_contract` 改为可选 |
| 5 | `frontend/src/pages/manager/OverviewPage.tsx` | 修改 | 展示独立采购合同 + 删除按钮 |
| 6 | `frontend/src/pages/manager/ContractDetailPage.tsx` | 修改 | 支持纯采购合同详情 + 销售信息添加应收金额 + 子表格产品金额→货物数量 |
| 7 | `frontend/src/routes/index.tsx` | 修改 | 新增 `/manager/overview/purchase/:id` 路由 |

---

## 四、实施顺序

```
1. 销售合同详情页添加货物数量列（独立，简单）
2. 采购合同详情页添加货物数量列（独立，简单）
3. 经理合同详情页添加应收金额（独立，简单）
4. API 层改造（独立采购合同 + getPurchaseContractDetail）（核心）
5. 类型定义调整（ContractDetailData 改为可选）
6. OverviewPage 展示独立采购合同 + 删除功能
7. ContractDetailPage 支持纯采购合同详情
8. 路由配置新增
9. 构建验证 + 部署
```

---

## 五、验证方法

1. **销售合同详情页**：进入任意销售合同详情 → 发票记录表格有「货物数量(吨)」列 → 收款记录表格有「货物数量(吨)」列
2. **采购合同详情页**：进入任意采购合同详情 → 收票记录表格有「货物数量(吨)」列 → 付款记录表格有「货物数量(吨)」列
3. **经理应收金额**：进入经理合同详情页 → 销售合同基本信息中有「应收金额」，值 = 已执行数量 × 单价
4. **独立采购合同**：创建一个无关联销售合同的采购合同 → 经理总览页下方能看到 → 点击进入详情页能看到完整信息
5. **删除功能**：经理总览页 → 点击删除按钮 → 无关联子记录时可删除 → 有关联子记录时提示无法删除
6. **经理详情页货物数量**：进入经理合同详情页 → 销售发票/销售收款/采购发票/采购付款表格中均新增了「货物数量(吨)」列，原有的「产品金额」列保留
7. **应收金额与欠款逻辑**：销售合同详情页 → 应收金额 = 已执行数量 × 单价 → 欠款金额 = 应收金额 - 已收金额 → 欠款比例 = 已收金额 / 应收金额 × 100%

---

## 六、需求8 — 销售合同「应收金额」「欠款」逻辑重构

### 6.1 核心公式变更

| 项目 | 旧公式 | 新公式 |
|------|--------|--------|
| 应收金额 | 无（前端计算 `total_amount` 或 `total_amount × 1.13`） | `executed_quantity × unit_price` |
| 欠款金额 | `total_amount - receipted_amount` | `应收金额 - receipted_amount` |
| 欠款比例 | `(total_amount - receipted_amount) / total_amount × 100` | `receipted_amount / 应收金额 × 100`（已收/应收） |

> **说明**：应收金额不存字段，由前端实时计算。后端 `debt_amount`、`debt_percent` 需改用 `executed_quantity × unit_price` 代替 `total_amount` 计算。

### 6.2 后端改动

**文件**：`backend/hooks/sales_contract.go`

- **OnRecordCreate**：`debt_amount` 初始设为 `unit_price * total_quantity - 0`（即总金额），因为初始 `executed_quantity = 0` 所以应收金额为 0，欠款也为 0
  - 实际上初始应收金额 = `0 × unit_price = 0`，所以欠款金额 = `0 - 0 = 0`，欠款比例 = 0
- **OnRecordUpdate**：同理用 `executed_quantity × unit_price` 计算

**文件**：`backend/hooks/sale_receipt.go`

- Create/Update/Delete 三个 hook 中，所有计算 `debt_amount`、`debt_percent` 的地方，将 `totalContractAmount` 替换为 `executedQuantity × unitPrice`：

```
应收金额 = contract.executed_quantity × contract.unit_price
欠款金额 = 应收金额 - totalReceiptAmount
欠款比例 = (totalReceiptAmount / 应收金额) × 100    （应收金额 > 0 时）
```

### 6.3 后端改动（发货触发）

**文件**：`backend/hooks/sales_shipment.go`

`updateSalesContractExecution` 函数在更新 `executed_quantity` 后，需要同步更新 `debt_amount` 和 `debt_percent`（因为应收金额变了）：

```
应收金额 = executed_quantity × unit_price
debt_amount = 应收金额 - receipted_amount
debt_percent = (receipted_amount / 应收金额) × 100
```

### 6.4 前端改动

#### 销售合同详情页（`sales/contracts/ContractDetail.tsx`）

- 欠款信息卡片：显示「应收金额」= `executed_quantity × unit_price`，欠款金额/比例保持从后端取

#### 销售收款详情页（`sales/receipts/ReceiptDetail.tsx`）

- 关联合同信息中，已有字段不变（后端计算的 debt 值已是新逻辑）

#### 经理合同详情页（`manager/ContractDetailPage.tsx`）

- 应收金额已改为 `executed_quantity × unit_price`（2.7 已完成）
- 欠款金额/比例保持从后端数据取（后端改完后自动正确）

### 6.5 修改文件清单

| # | 文件 | 操作 |
|---|------|------|
| 1 | `backend/hooks/sales_contract.go` | 修改 Create/Update hook 中 debt 计算 |
| 2 | `backend/hooks/sale_receipt.go` | 修改 Create/Update/Delete hook 中 debt 计算 |
| 3 | `backend/hooks/sales_shipment.go` | 在 updateSalesContractExecution 中增加 debt 联动更新 |
| 4 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 欠款信息卡片增加应收金额显示 |
| 5 | `frontend/src/pages/manager/ContractDetailPage.tsx` | 应收金额已在2.7完成，无需再改 |

### 6.6 实施顺序

```
1. 后端 hooks 改造（sales_contract + sale_receipt + sales_shipment）
2. 后端交叉编译 + 部署到北京和兰州
3. 前端销售合同详情页增加应收金额
4. 前端构建 + 部署
```
