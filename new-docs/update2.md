# 问题修复汇总（update2）

> 创建日期：2026-04-19
> 来源：员工问题反馈图片汇总

---

## 一、问题总览

| # | 问题 | 涉及页面/文件 | 角色 |
|---|------|--------------|------|
| 1 | 销售合同详情页收款记录「产品金额」显示为货币，实际应为数量 | `sales/contracts/ContractDetail.tsx` | 销售 |
| 2 | 采购合同详情页付款记录「产品金额」显示为货币，实际应为数量 | `purchase/contracts/ContractDetail.tsx` | 采购 |
| 3 | 经理流程图下拉栏无法选择独立采购合同 | `manager/ProgressFlowPage.tsx` + API | 经理 |
| 4 | 经理流程图节点详情中「产品金额」显示为货币，实际应为数量 | `manager/ProgressFlowPage.tsx` | 经理 |
| 5 | 销售新建收款记录时数量验证过严，质保金等小数量无法提交 | `backend/hooks/sale_receipt.go` | 销售 |

---

## 二、详细说明

### 2.1 销售合同详情页 — 收款记录「产品金额」应为「货物数量」

**文件**：`frontend/src/pages/sales/contracts/ContractDetail.tsx`

**问题**：收款记录表格中 `product_amount` 字段列标题为「产品金额」，渲染为 `¥5.0000` 货币格式。但 `product_amount` 实际代表的是货物数量（吨），应该显示为纯数字。

**修复**：将 receiptColumns 中「产品金额」列改为「货物数量(吨)」，渲染为纯数字。

### 2.2 采购合同详情页 — 付款记录「产品金额」应为「货物数量」

**文件**：`frontend/src/pages/purchase/contracts/ContractDetail.tsx`

**问题**：付款记录表格中 `product_amount` 字段列标题为「产品金额」，渲染为 `¥10.0000` 货币格式。但 `product_amount` 实际代表的是货物数量（吨）。

**修复**：将 paymentColumns 中「产品金额」列改为「货物数量(吨)」，渲染为纯数字。

### 2.3 经理流程图 — 下拉栏支持独立采购合同

**文件**：`frontend/src/pages/manager/ProgressFlowPage.tsx`、`frontend/src/api/comparison.ts`

**问题**：经理进入「进度跟踪」页面，下拉选择合同时，只显示有销售合同的合同。独立采购合同（无关联销售合同）不在列表中，无法查看其流程图。

**修复**：
- `getUncompletedContracts` API 方法除了返回销售合同，还需要返回独立采购合同
- `ProgressFlowPage` 的下拉列表渲染支持独立采购合同（显示为采购合同类型）

### 2.4 经理流程图 — 节点详情中「产品金额」应为「货物数量」

**文件**：`frontend/src/pages/manager/ProgressFlowPage.tsx`

**问题**：流程图中点击节点查看详情时，发票/收款/付款节点的「产品金额」显示为货币格式（如 `¥10.000`），但实际 `product_amount` 是数量。

**修复**：在流程图节点详情弹窗中，将「产品金额」改为「货物数量(吨)」，以数字格式显示。

### 2.5 销售新建收款 — 数量验证过严

**文件**：`backend/hooks/sale_receipt.go`

**问题**：当最后一笔收款是质保金时，产品数量可能很小（如0.5吨），加上之前收款数量总和可能略超过合同总数量，后端报错：「收款产品数量总和不能超过合同总数量」。

**修复**：放宽验证条件，允许收款数量总和不超过合同总数量的 **105%**（允许5%误差，用于处理质保金、尾款等特殊情况）。

---

## 三、修改文件清单

| # | 文件 | 操作 |
|---|------|------|
| 1 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 收款表格「产品金额」→「货物数量(吨)」 |
| 2 | `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 付款表格「产品金额」→「货物数量(吨)」 |
| 3 | `frontend/src/api/comparison.ts` | `getUncompletedContracts` 返回独立采购合同 |
| 4 | `frontend/src/pages/manager/ProgressFlowPage.tsx` | 下拉列表+节点详情显示修复 |
| 5 | `backend/hooks/sale_receipt.go` | 放宽收款数量验证（允许105%） |

---

## 四、实施顺序

```
1. 后端 hooks 修复（sale_receipt.go）
2. 后端交叉编译 + 部署
3. 前端代码修复（5个文件）
4. 前端构建 + 部署
5. 浏览器测试验证
```

---

## 五、测试验证方法

### 5.1 销售模块测试（sales@test.com / 12345678）

1. 登录后进入「销售合同」列表
2. 点击任意合同进入详情页
3. 查看「收款记录」表格 → 确认有「货物数量(吨)」列，显示为数字（如 `5`），非货币格式
4. 点击「新增收款」→ 输入产品数量 `0.5` → 确认能正常提交（不报错）

### 5.2 采购模块测试（purchase@test.com / 12345678）

1. 登录后进入「采购合同」列表
2. 点击任意合同进入详情页
3. 查看「付款记录」表格 → 确认有「货物数量(吨)」列，显示为数字，非货币格式

### 5.3 经理模块测试（manager@test.com / 12345678）

1. 登录后进入「进度跟踪」
2. 下拉选择合同 → 确认能看到独立采购合同（无关联销售合同的采购合同）
3. 选择独立采购合同 → 确认能显示流程图
4. 点击流程图中任意发票/收款/付款节点 → 查看详情弹窗 → 确认显示「货物数量(吨)」而非「产品金额」
5. 进入「关联对比」→ 合同详情页 → 查看各子表格 → 确认「货物数量(吨)」列显示正确
