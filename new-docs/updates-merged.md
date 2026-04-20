# 系统更新与修复总汇

> 本文档汇总了 MY-ERP-SYSTEM 项目的所有更新和修复记录
> 
> - **update1**（页面显示与功能优化）：2026-04-18
> - **update2**（问题修复汇总）：2026-04-19
> - **update3**（附件上传修改无效修复）：2026-04-19

---

## 目录

1. [update1 — 页面显示与功能优化](#一update1--页面显示与功能优化)
2. [update2 — 问题修复汇总](#二update2--问题修复汇总)
3. [update3 — 附件上传修改无效修复](#三update3--附件上传修改无效修复)

---

# 一、update1 — 页面显示与功能优化

> 创建日期：2026-04-18
> 状态：全部完成

## 1.1 需求总览

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
| 9 | 经理合同详情页支持删除子记录（发货/到货/发票/收付款） | `manager/ContractDetailPage` | 经理 |

## 1.2 核心改动说明

### 1.2.1 货物数量列添加

在销售合同详情页（发票、收款）、采购合同详情页（收票、付款）表格中新增「货物数量(吨)」列，`product_amount` 字段以纯数字显示。

### 1.2.2 独立采购合同支持

- API 层：`getAllContractsForOverview` 返回新增 `standalonePurchaseContracts`
- 新增 `getPurchaseContractDetail` 方法
- `ContractDetailData.sales_contract` 改为可选
- OverviewPage 底部新增「独立采购合同」区域
- 新增路由 `/manager/overview/purchase/:id`
- ContractDetailPage 根据 URL 自动判断显示销售或采购详情

### 1.2.3 删除功能

- 销售合同卡片和独立采购合同卡片右上角添加删除按钮
- 删除前检查关联子记录，有则提示无法删除
- 子记录表格添加删除操作列

### 1.2.4 应收金额与欠款逻辑重构

**公式变更**：

| 项目 | 旧公式 | 新公式 |
|------|--------|--------|
| 应收金额 | total_amount | executed_quantity × unit_price |
| 欠款金额 | total_amount - receipted_amount | 应收金额 - receipted_amount |
| 欠款比例 | (total_amount - receipted_amount) / total_amount | receipted_amount / 应收金额 |

**后端改动**：
- `sales_contract.go`：创建/更新时用 `executed_quantity × unit_price` 计算 debt
- `sale_receipt.go`：Create/Update/Delete 三个 hook 改用应收金额计算
- `sales_shipment.go`：发货更新 `executed_quantity` 时同步更新 debt

## 1.3 修改文件清单

| # | 文件 | 操作 |
|---|------|------|
| 1 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 发票、收款表格添加货物数量列 |
| 2 | `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 收票、付款表格添加货物数量列 |
| 3 | `frontend/src/api/comparison.ts` | 返回独立采购合同；新增 getPurchaseContractDetail |
| 4 | `frontend/src/types/comparison.ts` | sales_contract 改为可选 |
| 5 | `frontend/src/pages/manager/OverviewPage.tsx` | 展示独立采购合同 + 删除按钮 |
| 6 | `frontend/src/pages/manager/ContractDetailPage.tsx` | 支持纯采购合同详情 + 应收金额 + 货物数量列 + 子记录删除 |
| 7 | `frontend/src/routes/index.tsx` | 新增 /manager/overview/purchase/:id |
| 8 | `backend/hooks/sales_contract.go` | 修改 Create/Update hook 中 debt 计算 |
| 9 | `backend/hooks/sale_receipt.go` | 修改 Create/Update/Delete hook 中 debt 计算 |
| 10 | `backend/hooks/sales_shipment.go` | 在 updateSalesContractExecution 中增加 debt 联动更新 |

---

# 二、update2 — 问题修复汇总

> 创建日期：2026-04-19
> 来源：员工问题反馈图片汇总
> 状态：全部完成

## 2.1 问题总览

| # | 问题 | 涉及页面/文件 | 角色 |
|---|------|--------------|------|
| 1 | 销售合同详情页收款记录「产品金额」显示为货币，实际应为数量 | `sales/contracts/ContractDetail.tsx` | 销售 |
| 2 | 采购合同详情页付款记录「产品金额」显示为货币，实际应为数量 | `purchase/contracts/ContractDetail.tsx` | 采购 |
| 3 | 经理流程图下拉栏无法选择独立采购合同 | `manager/ProgressFlowPage.tsx` + API | 经理 |
| 4 | 经理流程图节点详情中「产品金额」显示为货币，实际应为数量 | `manager/ProgressFlowPage.tsx` | 经理 |
| 5 | 销售新建收款记录时数量验证过严，质保金等小数量无法提交 | `backend/hooks/sale_receipt.go` | 销售 |

## 2.2 修复详情

### 2.2.1 产品金额显示修正

**问题**：`product_amount` 字段被显示为货币格式（`¥5.0000`），但实际代表货物数量（吨）。

**修复**：将「产品金额」列标题改为「货物数量(吨)」，渲染为纯数字。

涉及表格：
- 销售合同详情页 - 收款记录
- 采购合同详情页 - 付款记录
- 经理流程图节点详情 - 销售发票/收款/采购发票/付款

### 2.2.2 流程图支持独立采购合同

**问题**：经理流程图下拉列表只显示有销售合同的合同，独立采购合同不可见。

**修复**：
- `getUncompletedContracts` 返回独立采购合同
- 下拉选项显示 `[采购]`/`[销售]` 类型标记
- 选择独立采购合同时调用 `getPurchaseContractDetail`

### 2.2.3 收款数量验证放宽

**问题**：质保金等小数量收款时，后端报错「收款产品数量总和不能超过合同总数量」。

**修复**：验证条件从 `> 总数量` 放宽为 `> 总数量 × 1.05`（允许5%误差）。

## 2.3 修改文件清单

| # | 文件 | 操作 |
|---|------|------|
| 1 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 收款表格「产品金额」→「货物数量(吨)」 |
| 2 | `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 付款表格「产品金额」→「货物数量(吨)」 |
| 3 | `frontend/src/api/comparison.ts` | getUncompletedContracts 返回独立采购合同 |
| 4 | `frontend/src/pages/manager/ProgressFlowPage.tsx` | 下拉列表+节点详情显示修复 |
| 5 | `backend/hooks/sale_receipt.go` | 放宽收款数量验证（允许105%） |

---

# 三、update3 — 附件上传修改无效修复

> 创建日期：2026-04-19
> 问题来源：员工反馈所有模块的附件上传后无法修改（删除/替换无效）
> 状态：全部完成

## 3.1 问题根因

### 3.1.1 Form 组件附件提取缺陷

所有表单组件使用以下逻辑提取附件：

```typescript
const attachments = fileList?.map((f) => f.originFileObj).filter(Boolean) as File[] || [];
```

**问题**：`originFileObj` 只存在于新上传的本地文件。已有文件（从服务器加载）没有此属性，导致：

| 场景 | 结果 |
|------|------|
| 编辑记录，添加新附件 | 旧文件丢失 |
| 编辑记录，删除所有附件 | 旧文件仍然保留 |

### 3.1.2 API 层 update 方法缺陷

```typescript
if (data.attachments && data.attachments.length > 0) {
    data.attachments.forEach((file) => formData.append('attachments', file));
}
```

**问题**：当 `attachments` 为空数组时（用户删除所有附件），条件不成立，不传递 `attachments` 字段，PocketBase 默认保留所有旧文件。

### 3.1.3 类型定义缺陷

`attachments: File[]` 不支持已有文件名（`string`）。

## 3.2 修复方案

### 3.2.1 新增通用工具函数

创建 `frontend/src/utils/file.ts`：

```typescript
export const extractAttachments = (fileList: any[] | undefined): (File | string)[] => {
    if (!fileList || !Array.isArray(fileList)) return [];
    return fileList
        .map((f) => {
            if (f.originFileObj instanceof File) return f.originFileObj;
            if (typeof f.url === 'string' && f.url) return f.url;
            if (typeof f.name === 'string' && f.name) return f.name;
            return null;
        })
        .filter((item): item is File | string => item !== null);
};
```

### 3.2.2 类型定义修改

所有 `attachments?: File[]` 改为 `attachments?: (File | string)[]`。

涉及类型文件：
- `sales-contract.ts`
- `sales-shipment.ts`
- `sale-invoice.ts`
- `sale-receipt.ts`
- `bidding-record.ts`
- `service-contract.ts`
- `purchase-contract.ts`
- `purchase-arrival.ts`
- `purchase-invoice.ts`
- `purchase-payment.ts`
- `expense-record.ts`

### 3.2.3 API 层修改

所有 update 方法统一改为：

```typescript
if (data.attachments !== undefined) {
    if (data.attachments.length === 0) {
        formData.append('attachments', ''); // 显式删除所有附件
    } else {
        data.attachments.forEach((file) => {
            formData.append('attachments', file);
        });
    }
}
```

### 3.2.4 Form 组件修改

所有 Form 组件使用 `extractAttachments()` 替代 `originFileObj` 过滤。

### 3.2.5 经理详情页附件删除

ContractDetailPage.tsx 中：
- 每个已有附件旁添加删除按钮
- 点击删除后重新加载数据

## 3.3 修改文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `frontend/src/utils/file.ts` | 通用附件提取工具函数 |

### 类型定义修改（11个文件）

所有类型文件中的 `attachments?: File[]` 改为 `attachments?: (File | string)[]`。

### API 层修改（10个文件）

| 文件 | 方法 |
|------|------|
| `frontend/src/api/sales-contract.ts` | update |
| `frontend/src/api/sales-shipment.ts` | update |
| `frontend/src/api/receipt.ts` | update |
| `frontend/src/api/bidding-record.ts` | update |
| `frontend/src/api/service-contract.ts` | update, updateOrder |
| `frontend/src/api/purchase-contract.ts` | update |
| `frontend/src/api/purchase-arrival.ts` | update |
| `frontend/src/api/purchase-invoice.ts` | update |
| `frontend/src/api/purchase-payment.ts` | update |
| `frontend/src/api/purchase-expense.ts` | update |

### Form/List 组件修改（15个文件）

| 文件 | 组件 |
|------|------|
| `frontend/src/pages/sales/contracts/ContractList.tsx` | handleFormFinish |
| `frontend/src/pages/sales/shipments/ShipmentForm.tsx` | handleFinish |
| `frontend/src/pages/sales/invoices/InvoiceForm.tsx` | handleFinish |
| `frontend/src/pages/sales/receipts/ReceiptForm.tsx` | handleFinish |
| `frontend/src/pages/sales/bidding/BiddingList.tsx` | handleFormFinish |
| `frontend/src/pages/sales/services/ServiceList.tsx` | handleFormFinish |
| `frontend/src/pages/sales/services/ServiceDetail.tsx` | handleOrderFormFinish |
| `frontend/src/pages/purchase/contracts/ContractList.tsx` | handleFormFinish |
| `frontend/src/pages/purchase/arrivals/ArrivalForm.tsx` | handleFinish |
| `frontend/src/pages/purchase/invoices/InvoiceForm.tsx` | handleFinish |
| `frontend/src/pages/purchase/payments/PaymentForm.tsx` | handleFinish |
| `frontend/src/pages/purchase/expenses/ExpenseList.tsx` | handleFormFinish |

### 经理详情页修改

| 文件 | 修改内容 |
|------|---------|
| `frontend/src/pages/manager/ContractDetailPage.tsx` | 添加已有附件删除功能 |

## 3.4 验证方法

1. **销售合同**：编辑已有销售合同 → 添加新附件 → 保存 → 确认新旧附件都在
2. **销售合同**：编辑已有销售合同 → 删除所有附件 → 保存 → 确认附件为空
3. **销售发货**：编辑发货记录 → 替换附件 → 保存 → 确认附件已替换
4. **采购付款**：编辑付款记录 → 删除附件 → 保存 → 确认附件已删除
5. **经理详情页**：点击子记录附件上传 → 上传新附件 → 确认追加成功 → 删除已有附件 → 确认删除成功

---

# 四、全部更新汇总

## 4.1 按模块统计

| 模块 | update1 | update2 | update3 | 合计 |
|------|---------|---------|---------|------|
| 后端 hooks | 3 | 1 | 0 | 4 |
| 类型定义 | 1 | 0 | 11 | 12 |
| API 层 | 2 | 1 | 10 | 13 |
| 销售页面 | 1 | 1 | 7 | 9 |
| 采购页面 | 1 | 1 | 5 | 7 |
| 经理页面 | 3 | 1 | 1 | 5 |
| 路由/其他 | 1 | 0 | 0 | 1 |
| **合计** | **12** | **5** | **34** | **51** |

## 4.2 核心新增功能

1. **独立采购合同支持**：经理模块可查看和管理无关联销售合同的采购合同
2. **应收金额计算**：基于已执行数量 × 单价，更准确的欠款计算
3. **子记录删除**：经理可在详情页直接删除发货/到货/发票/收付款记录
4. **货物数量显示**：所有表格统一显示「货物数量(吨)」，避免金额/数量混淆
5. **附件完整管理**：支持新增、保留已有、删除附件的完整生命周期

## 4.3 部署状态

所有更新均已部署到服务器：
- 后端：本地交叉编译 → 上传服务器 → docker cp 到北京/兰州容器 → docker restart
- 前端：npm run build → 上传 dist → docker cp 到 erp-frontend 容器

访问地址：`https://erp.henghuacheng.cn`
