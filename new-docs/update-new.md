# 跨境合同（销售/采购）问题汇总

> 创建日期：2026-04-21
> 状态：执行中

---

## 问题总览

| # | 问题描述 | 涉及页面 | 严重程度 |
|---|---------|---------|---------|
| 1 | 采购到货运输中运费/杂费选择USD后，在采购合同详情页和经理模块中显示为CNY | 采购合同详情页、经理合同详情页 | 高 |
| 2 | 跨境采购合同利润分析中，运费和杂费不应乘以汇率（当选择的是CNY时） | 经理模块利润分析、API计算 | 高 |
| 3 | 跨境合同子信息（发票、收付款、到货）金额单位显示错误，都显示为CNY而非USD | 销售/采购合同详情页、经理模块 | 高 |
| 4 | 跨境合同新增发票时，剩余未开票金额单位显示错误 | 销售/采购发票表单 | 中 |

---

## 问题1：采购到货运输费用币种显示错误

### 问题描述

采购合同如果是跨境的，在运输（到货）记录中，运费和杂费可以选择币种（CNY/USD）。但选择USD后：
- **采购合同详情页**的到货列表中，运费和杂费仍显示为 ¥（人民币符号）
- **经理模块合同详情页**的到货信息中也显示为 ¥
- **采购到货详情页**本身显示正确（显示 $5.000000 ≈ ¥34.537000）

### 期望行为
- 当运费/杂费币种选择为 USD 时，所有页面应显示为 $X.XXXXXX（≈ ¥X.XXXXXX）
- 当运费/杂费币种选择为 CNY 时，显示为 ¥X.XXXXXX（≈ $X.XXXXXX）

### 涉及文件
1. `frontend/src/pages/purchase/contracts/ContractDetail.tsx` - 采购合同详情页到货表格
2. `frontend/src/pages/manager/ContractDetailPage.tsx` - 经理合同详情页到货表格

### 修改方案
在显示运费/杂费的表格列中，增加币种判断逻辑，根据 `freight_1_currency`、`freight_2_currency`、`miscellaneous_expenses_currency` 字段决定显示格式。

---

## 问题2：跨境采购合同利润分析中运费杂费汇率计算错误

### 问题描述

跨境采购合同中，如果运输的运费和杂费选择的是 **CNY（人民币）**：
- 在经理模块的**关联对比合同详情页**利润分析中：
  - **人民币分析（CNY）**：运费合计和杂费合计被错误地乘以了汇率
  - **美元分析（USD）**：运费合计和杂费合计也被错误地乘以了汇率后转换为美元

### 期望行为
- 如果运费/杂费币种为 **CNY**：在利润分析中直接使用原始值，**不应乘以汇率**
- 如果运费/杂费币种为 **USD**：在利润分析中应乘以汇率转换为 CNY 后计算

### 涉及文件
1. `frontend/src/api/comparison.ts` - 利润分析核心计算（`getContractDetail`、`getComparisonData`、`getPurchaseContractDetail`）

### 修改方案
在计算 `totalFreight` 和 `totalMiscellaneous` 时，需要判断每笔到货记录的运费/杂费币种：
- 如果币种为 CNY：`amount * 1`（不乘汇率）
- 如果币种为 USD：`amount * rate`（乘以汇率）

---

## 问题3：跨境合同子信息金额单位显示错误

### 问题描述

在跨境合同（销售/采购）中，子信息记录的金额单位显示不正确：
- **采购合同详情页**：发票金额、付款金额、到货金额等显示为 ¥，但应该是 $（因为合同是跨境USD）
- **销售合同详情页**：发票金额、收款金额、发货金额等显示为 ¥，但应该是 $（因为合同是跨境USD）
- **经理模块合同详情页**：所有子信息金额显示为 ¥，但应该是 $

### 期望行为
- 当合同 `is_cross_border = true` 时，所有子信息中的金额应显示为美元符号 $ 或同时显示 USD/CNY
- 当合同 `is_cross_border = false` 时，显示为人民币符号 ¥

### 涉及文件
1. `frontend/src/pages/purchase/contracts/ContractDetail.tsx` - 采购合同详情页子信息表格
2. `frontend/src/pages/sales/contracts/ContractDetail.tsx` - 销售合同详情页子信息表格
3. `frontend/src/pages/manager/ContractDetailPage.tsx` - 经理合同详情页子信息表格

### 修改方案
在所有子信息表格的金额列渲染函数中，根据父合同的 `is_cross_border` 字段决定显示格式：
- 跨境：`$X.XXXXXX（≈ ¥X.XXXXXX）`
- 非跨境：`¥X.XXXXXX`

---

## 问题4：跨境合同新增发票时剩余金额单位显示错误

### 问题描述

在跨境合同下新增发票时：
- **销售发票**：提示"合同剩余未开票金额: ¥100.000000"，但合同是跨境的，应该显示美元
- **采购发票**：提示"合同剩余未收票金额: ¥100.000000"，同样应该显示美元

### 期望行为
- 当合同 `is_cross_border = true` 时，剩余金额提示应显示为 `$X.XXXXXX（≈ ¥X.XXXXXX）`
- 当合同 `is_cross_border = false` 时，显示为 `¥X.XXXXXX`

### 涉及文件
1. `frontend/src/pages/sales/invoices/InvoiceForm.tsx` - 销售发票表单
2. `frontend/src/pages/purchase/invoices/InvoiceForm.tsx` - 采购发票表单
3. `frontend/src/pages/sales/receipts/ReceiptForm.tsx` - 销售收款表单
4. `frontend/src/pages/purchase/payments/PaymentForm.tsx` - 采购付款表单

### 修改方案
在显示剩余金额的 Alert 组件中，根据合同的 `is_cross_border` 字段决定显示格式。

---

## 实施顺序

```
1. 修改 comparison.ts 中利润分析的运费杂费计算逻辑（问题2）
2. 修改 ContractDetailPage.tsx 中经理模块的金额显示（问题1、3）
3. 修改 purchase/contracts/ContractDetail.tsx 中采购合同详情页（问题1、3）
4. 修改 sales/contracts/ContractDetail.tsx 中销售合同详情页（问题3）
5. 修改 InvoiceForm/ReceiptForm/PaymentForm 中剩余金额提示（问题4）
6. TypeScript 编译检查
7. 构建 + 部署
```

---

## 修改文件清单

### 后端
| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| - | 无需修改 | - | 纯前端显示问题 |

### 前端 - API/计算
| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `frontend/src/api/comparison.ts` | 修改 | 利润分析中运费杂费汇率计算 |

### 前端 - 页面
| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 2 | `frontend/src/pages/manager/ContractDetailPage.tsx` | 修改 | 经理合同详情页金额显示 |
| 3 | `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 修改 | 采购合同详情页金额显示 |
| 4 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 修改 | 销售合同详情页金额显示 |
| 5 | `frontend/src/pages/sales/invoices/InvoiceForm.tsx` | 修改 | 销售发票剩余金额币种 |
| 6 | `frontend/src/pages/purchase/invoices/InvoiceForm.tsx` | 修改 | 采购发票剩余金额币种 |
| 7 | `frontend/src/pages/sales/receipts/ReceiptForm.tsx` | 修改 | 销售收款剩余金额币种 |
| 8 | `frontend/src/pages/purchase/payments/PaymentForm.tsx` | 修改 | 采购付款剩余金额币种 |

---

**文档结束**
