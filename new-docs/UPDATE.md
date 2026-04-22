# MY-ERP-SYSTEM 更新文档

> 创建日期：2026-04-21
> 状态：执行中

---

## 更新总览

| # | 更新类别 | 问题/需求描述 | 涉及模块 | 优先级 | 状态 |
|---|---------|-------------|---------|--------|------|
| 1 | 数值精度 | 全局金额/单价/数量精度统一为6位小数（百分比保留2位） | 全局 | 高 | ✅ 已完成 |
| 2 | 业务功能 | 销售收款支持含税/不含税选择 | 销售模块 | 高 | ⏳ 待实施 |
| 3 | UI优化 | 子信息详情页添加「查看关联合同」跳转按钮 | 销售+采购 | 中 | ⏳ 待实施 |
| 4 | 业务逻辑 | 销售合同收款进度分母改为应收金额 | 销售模块 | 高 | ⏳ 待实施 |
| 5 | 跨境合同 | 运费/杂费币种显示错误（USD显示为CNY） | 采购+经理 | 高 | ✅ 已完成 |
| 6 | 跨境合同 | 利润分析中运费杂费汇率计算错误（CNY不应乘汇率） | 经理模块 | 高 | ✅ 已完成 |
| 7 | 跨境合同 | 子信息（发票/收付款/到货）金额单位显示错误 | 销售+采购+经理 | 高 | ✅ 已完成 |
| 8 | 跨境合同 | 新增发票时剩余未开票金额单位显示错误 | 销售+采购 | 中 | ✅ 已完成 |
| 9 | 跨境合同 | 美元分析中运费未按汇率转换（CNY→USD） | 经理模块 | 高 | ✅ 已完成 |
| 10 | 系统优化 | 关联对比页面独立采购合同单独显示 | 经理模块 | 高 | ✅ 已完成 |
| 11 | 系统优化 | 流程图页面显示所有独立采购合同 | 经理模块 | 高 | ✅ 已完成 |
| 12 | 业务逻辑 | 只要有一个合同跨境就显示双币种利润分析 | 经理模块 | 高 | ✅ 已完成 |

---

## 第一部分：数值精度与格式统一

### 1.1 规则定义

| 数值类型 | 显示精度 | 示例 |
|---------|---------|------|
| 金额（合同金额、收款金额、付款金额、发票金额、运费、杂费等） | 6位小数 | `¥421238.880000` |
| 单价（产品单价、含税单价、不含税单价） | 6位小数 | `¥26327.430000` |
| 数量（产品数量、执行数量、到货数量、发货数量） | 6位小数 | `16.000000 吨` |
| 比例/进度（百分比） | 2位小数 | `62.50%` |
| 汇率 | 6位小数 | `6.834300` |

### 1.2 修改文件

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `frontend/src/pages/sales/contracts/ContractList.tsx` | 修改 | 金额/单价精度改为6位 |
| 2 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 修改 | 金额/单价/数量精度改为6位，进度百分比保持2位 |
| 3 | `frontend/src/pages/sales/shipments/*.tsx` | 修改 | 金额/数量精度改为6位 |
| 4 | `frontend/src/pages/sales/receipts/*.tsx` | 修改 | 金额精度改为6位 |
| 5 | `frontend/src/pages/sales/invoices/*.tsx` | 修改 | 金额精度改为6位 |
| 6 | `frontend/src/pages/purchase/contracts/ContractList.tsx` | 修改 | 金额/单价精度改为6位 |
| 7 | `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 修改 | 金额/单价/数量精度改为6位 |
| 8 | `frontend/src/pages/purchase/arrivals/*.tsx` | 修改 | 金额/数量精度改为6位 |
| 9 | `frontend/src/pages/purchase/payments/*.tsx` | 修改 | 金额精度改为6位 |
| 10 | `frontend/src/pages/purchase/invoices/*.tsx` | 修改 | 金额精度改为6位 |
| 11 | `frontend/src/pages/manager/ContractDetailPage.tsx` | 修改 | 金额/单价/数量精度改为6位 |
| 12 | `frontend/src/pages/manager/OverviewPage.tsx` | 修改 | 金额精度改为6位 |

---

## 第二部分：销售收款含税/不含税选择

### 2.1 业务逻辑

当销售合同按**不含税**填写时（`is_price_excluding_tax = true`），收款记录允许销售员选择按**含税**还是**不含税**来收款：

- 若收款 `is_tax_included = false`（默认）：应收金额 = 合同金额（不含税）
- 若收款 `is_tax_included = true`：应收金额 = 合同金额 × 1.13

> 增值税率按 13% 计算，即含税金额 = 不含税金额 × 1.13

### 2.2 后端字段

在 `sale_receipts` 集合新增字段：

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `is_tax_included` | Bool | `false` | 该笔收款是否按含税计算 |

### 2.3 前端修改

**收款表单（`ReceiptForm.tsx`）**：
- 添加 Switch 开关「按含税收款」
- 仅当关联销售合同 `is_price_excluding_tax = true` 时显示此开关
- 提交时包含 `is_tax_included` 字段

**收款详情（`ReceiptDetail.tsx`）**：
- 显示「计税方式」：含税 / 不含税

**销售合同详情（`ContractDetail.tsx`）**：
- 应收金额计算逻辑调整：
  - 如果合同本身含税：`应收金额 = 合同金额`
  - 如果合同不含税且存在按含税收款的记录：`应收金额 = 合同金额 × 1.13`
  - 如果合同不含税且所有收款都不含税：`应收金额 = 合同金额`
- 收款进度分母从 `contract.total_amount` 改为 `contract.receivable_amount`

**欠款信息区域**：
- 应收金额 = 合同金额（不含税时）或 合同金额 × 1.13（含税时）
- 需要根据实际收款记录的 `is_tax_included` 汇总计算

### 2.4 修改文件

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | PocketBase `sale_receipts` | 新增字段 | 北京+兰州两个实例 |
| 2 | `frontend/src/types/sale-receipt.ts` | 修改 | 新增 `is_tax_included?: boolean` |
| 3 | `frontend/src/api/sale-receipt.ts` | 修改 | 提交 `is_tax_included` 字段 |
| 4 | `frontend/src/pages/sales/receipts/ReceiptForm.tsx` | 修改 | 添加「按含税收款」Switch |
| 5 | `frontend/src/pages/sales/receipts/ReceiptDetail.tsx` | 修改 | 显示计税方式 |
| 6 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 修改 | 应收金额/收款进度逻辑调整 |

---

## 第三部分：子信息详情页跳转按钮

### 3.1 修改范围

将以下详情页中的「关联合同信息」表格/卡片移除，替换为「查看关联合同」按钮：

**销售模块**：
| 页面 | 当前显示 | 修改后 |
|------|---------|--------|
| `sales/shipments/ShipmentDetail.tsx` | 关联销售合同信息表 | 「查看关联销售合同」按钮 |
| `sales/receipts/ReceiptDetail.tsx` | 关联销售合同信息表 | 「查看关联销售合同」按钮 |
| `sales/invoices/InvoiceDetail.tsx` | 关联销售合同信息表 | 「查看关联销售合同」按钮 |

**采购模块**：
| 页面 | 当前显示 | 修改后 |
|------|---------|--------|
| `purchase/arrivals/ArrivalDetail.tsx` | 关联采购合同信息表 | 「查看关联采购合同」按钮 |
| `purchase/payments/PaymentDetail.tsx` | 关联采购合同信息表 | 「查看关联采购合同」按钮 |
| `purchase/invoices/InvoiceDetail.tsx` | 关联采购合同信息表 | 「查看关联采购合同」按钮 |

### 3.2 按钮行为

- 点击按钮 → `navigate(\`/sales/contracts/${sales_contract_id}\`)` 或 `navigate(\`/purchase/contracts/${purchase_contract_id}\`)`
- 按钮样式：Primary Button，带 `LinkOutlined` 图标

### 3.3 修改文件

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `frontend/src/pages/sales/shipments/ShipmentDetail.tsx` | 修改 | 移除合同信息表，添加跳转按钮 |
| 2 | `frontend/src/pages/sales/receipts/ReceiptDetail.tsx` | 修改 | 移除合同信息表，添加跳转按钮 |
| 3 | `frontend/src/pages/sales/invoices/InvoiceDetail.tsx` | 修改 | 移除合同信息表，添加跳转按钮 |
| 4 | `frontend/src/pages/purchase/arrivals/ArrivalDetail.tsx` | 修改 | 移除合同信息表，添加跳转按钮 |
| 5 | `frontend/src/pages/purchase/payments/PaymentDetail.tsx` | 修改 | 移除合同信息表，添加跳转按钮 |
| 6 | `frontend/src/pages/purchase/invoices/InvoiceDetail.tsx` | 修改 | 移除合同信息表，添加跳转按钮 |

---

## 第四部分：跨境合同问题修复

### 4.1 问题总览

| # | 问题 | 严重程度 | 状态 |
|---|------|---------|------|
| 1 | 采购到货运输费用币种显示错误 | 高 | ✅ 已修复 |
| 2 | 利润分析中运费杂费汇率计算错误 | 高 | ✅ 已修复 |
| 3 | 子信息金额单位显示错误 | 高 | ✅ 已修复 |
| 4 | 新增发票剩余金额单位显示错误 | 中 | ✅ 已修复 |
| 5 | 美元分析中运费未按汇率转换 | 高 | ✅ 已修复 |
| 6 | 利润分析双币种显示条件错误 | 高 | ✅ 已修复 |

### 4.2 问题1：采购到货运输费用币种显示错误

**问题描述**：
采购合同如果是跨境的，在运输（到货）记录中，运费和杂费可以选择币种（CNY/USD）。但选择USD后：
- **采购合同详情页**的到货列表中，运费和杂费仍显示为 ¥（人民币符号）
- **经理模块合同详情页**的到货信息中也显示为 ¥
- **采购到货详情页**本身显示正确

**期望行为**：
- 当运费/杂费币种选择为 USD 时，所有页面应显示为 $X.XXXXXX（≈ ¥X.XXXXXX）
- 当运费/杂费币种选择为 CNY 时，显示为 ¥X.XXXXXX（≈ $X.XXXXXX）

**修改文件**：
- `frontend/src/pages/purchase/contracts/ContractDetail.tsx`
- `frontend/src/pages/manager/ContractDetailPage.tsx`

**修改方案**：在显示运费/杂费的表格列中，增加币种判断逻辑，根据 `freight_1_currency`、`freight_2_currency`、`miscellaneous_expenses_currency` 字段决定显示格式。

### 4.3 问题2：利润分析中运费杂费汇率计算错误

**问题描述**：
跨境采购合同中，如果运输的运费和杂费选择的是 **CNY（人民币）**：
- 在经理模块的**关联对比合同详情页**利润分析中，运费合计和杂费合计被错误地乘以了汇率

**期望行为**：
- 如果运费/杂费币种为 **CNY**：在利润分析中直接使用原始值，**不应乘以汇率**
- 如果运费/杂费币种为 **USD**：在利润分析中应乘以汇率转换为 CNY 后计算

**修改文件**：
- `frontend/src/api/comparison.ts`

**修改方案**：在计算 `totalFreight` 和 `totalMiscellaneous` 时，判断每笔到货记录的运费/杂费币种：
- 如果币种为 CNY：`amount * 1`（不乘汇率）
- 如果币种为 USD：`amount * rate`（乘以汇率）

### 4.4 问题3：跨境合同子信息金额单位显示错误

**问题描述**：
在跨境合同（销售/采购）中，子信息记录的金额单位显示不正确：
- **采购合同详情页**：发票金额、付款金额、到货金额等显示为 ¥，但应该是 $
- **销售合同详情页**：发票金额、收款金额、发货金额等显示为 ¥，但应该是 $
- **经理模块合同详情页**：所有子信息金额显示为 ¥，但应该是 $

**期望行为**：
- 当合同 `is_cross_border = true` 时，所有子信息中的金额应显示为美元符号 $ 或同时显示 USD/CNY
- 当合同 `is_cross_border = false` 时，显示为人民币符号 ¥

**修改文件**：
- `frontend/src/pages/purchase/contracts/ContractDetail.tsx`
- `frontend/src/pages/sales/contracts/ContractDetail.tsx`
- `frontend/src/pages/manager/ContractDetailPage.tsx`

**修改方案**：在所有子信息表格的金额列渲染函数中，根据父合同的 `is_cross_border` 字段决定显示格式。

### 4.5 问题4：新增发票剩余金额单位显示错误

**问题描述**：
在跨境合同下新增发票时：
- **销售发票**：提示"合同剩余未开票金额: ¥100.000000"，但合同是跨境的，应该显示美元
- **采购发票**：提示"合同剩余未收票金额: ¥100.000000"，同样应该显示美元

**期望行为**：
- 当合同 `is_cross_border = true` 时，剩余金额提示应显示为 `$X.XXXXXX（≈ ¥X.XXXXXX）`
- 当合同 `is_cross_border = false` 时，显示为 `¥X.XXXXXX`

**修改文件**：
- `frontend/src/pages/sales/invoices/InvoiceForm.tsx`
- `frontend/src/pages/purchase/invoices/InvoiceForm.tsx`
- `frontend/src/pages/sales/receipts/ReceiptForm.tsx`
- `frontend/src/pages/purchase/payments/PaymentForm.tsx`

### 4.6 问题5：美元分析中运费未按汇率转换

**问题描述**：
如果跨境采购合同的运输中的运费是按照CNY填写的，到经理模块中的利润分析中，美元分析里面，运费直接把CNY的数值搬过来了，没有进行汇率转算。

**期望行为**：
应该用运费的数值除以美元汇率，显示美元USD的运费。

**修改文件**：
- `frontend/src/pages/manager/ContractDetailPage.tsx`

**修改方案**：在 `calcProfitUSD` 函数中，将运费和杂费除以汇率转换为USD。

### 4.7 问题6：利润分析双币种显示条件

**问题描述**：
原逻辑要求销售合同是跨境的且所有采购合同都是跨境的，才显示双币种分析。但如果销售合同不是跨境的而采购合同是跨境的，不会显示美元分析。

**期望行为**：
只要关联的销售或采购合同中有一个是跨境的，经理模块中的利润分析就需要有人民币分析和美元分析。

**修改文件**：
- `frontend/src/pages/manager/ContractDetailPage.tsx`

**修改方案**：将判断条件从 `sc.is_cross_border && allPurchaseCrossBorder` 改为 `sc.is_cross_border || anyPurchaseCrossBorder`。

---

## 第五部分：系统优化

### 5.1 关联对比页面独立采购合同显示

**问题描述**：
经理模块中的关联对比总览页面，独立的采购合同（没有关联的销售合同）被放到一个数据卡片中合并显示，用户希望它们独立出现。

**修改文件**：
- `frontend/src/pages/manager/OverviewPage.tsx`

**修改方案**：
- 修改 `contractRows` 逻辑，独立采购合同不再放入汇总卡片
- 每个独立采购合同作为一个独立的行显示
- 修改右侧列渲染逻辑，独立采购合同显示为独立的 `PurchaseContractCard`

### 5.2 流程图页面显示所有独立采购合同

**问题描述**：
经理模块中的流程图页面，只显示了一个独立采购合同，其余的没有显示。

**修改文件**：
- `frontend/src/api/comparison.ts`

**修改方案**：
- 修复 PocketBase filter 语法，将 `sales_contract = "" || sales_contract = null` 改为 `sales_contract = ''`
- 使用单引号空字符串匹配 PocketBase 中空的 relation 字段

---

## 实施顺序

```
Phase 1 — 已完成 ✅
1. 修改 comparison.ts 中利润分析的运费杂费计算逻辑
2. 修改 ContractDetailPage.tsx 中经理模块的金额显示
3. 修改 purchase/contracts/ContractDetail.tsx 中采购合同详情页
4. 修改 sales/contracts/ContractDetail.tsx 中销售合同详情页
5. 修改 InvoiceForm/ReceiptForm/PaymentForm 中剩余金额提示
6. 修改 OverviewPage.tsx 独立采购合同显示
7. 修改 comparison.ts 独立采购合同查询
8. 修改 ContractDetailPage.tsx 双币种显示条件
9. 修改 ContractDetailPage.tsx 美元分析运费转换
10. 全局数值精度统一为6位小数
11. TypeScript 编译检查
12. 构建 + 部署

Phase 2 — 待实施 ⏳
13. PocketBase 后台添加 sale_receipts.is_tax_included bool 字段（北京+兰州）
14. 修改 types/sale-receipt.ts 新增 is_tax_included 字段
15. 修改 api/sale-receipt.ts 提交 is_tax_included
16. 修改 ReceiptForm.tsx 添加含税开关
17. 修改 ReceiptDetail.tsx 显示计税方式
18. 修改 sales/contracts/ContractDetail.tsx — 收款进度/应收金额逻辑
19. 修改6个子信息详情页，移除合同信息表，添加跳转按钮
20. TypeScript 编译检查
21. 构建 + 部署
```

---

## 修改文件总清单

### 后端
| # | 操作 | 说明 | 状态 |
|---|------|------|------|
| 1 | PocketBase `sale_receipts` 新增 `is_tax_included` bool 字段 | 北京 + 兰州 | ⏳ 待实施 |

### 前端 — API/计算
| # | 文件 | 操作 | 说明 | 状态 |
|---|------|------|------|------|
| 1 | `frontend/src/api/comparison.ts` | 修改 | 利润分析运费杂费汇率计算、独立采购合同查询 | ✅ 已完成 |
| 2 | `frontend/src/api/sale-receipt.ts` | 修改 | 提交 is_tax_included | ⏳ 待实施 |

### 前端 — 页面
| # | 文件 | 操作 | 说明 | 状态 |
|---|------|------|------|------|
| 1 | `frontend/src/pages/manager/ContractDetailPage.tsx` | 修改 | 金额显示、双币种分析、运费转换 | ✅ 已完成 |
| 2 | `frontend/src/pages/manager/OverviewPage.tsx` | 修改 | 独立采购合同显示、数值精度 | ✅ 已完成 |
| 3 | `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 修改 | 金额显示、币种、数值精度 | ✅ 已完成 |
| 4 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 修改 | 金额显示、币种、数值精度、收款进度 | ⏳ 部分完成 |
| 5 | `frontend/src/pages/sales/invoices/InvoiceForm.tsx` | 修改 | 剩余金额币种、数值精度 | ✅ 已完成 |
| 6 | `frontend/src/pages/purchase/invoices/InvoiceForm.tsx` | 修改 | 剩余金额币种、数值精度 | ✅ 已完成 |
| 7 | `frontend/src/pages/sales/receipts/ReceiptForm.tsx` | 修改 | 剩余金额币种、含税开关、数值精度 | ⏳ 部分完成 |
| 8 | `frontend/src/pages/sales/receipts/ReceiptDetail.tsx` | 修改 | 显示计税方式、数值精度 | ⏳ 待实施 |
| 9 | `frontend/src/pages/purchase/payments/PaymentForm.tsx` | 修改 | 剩余金额币种、数值精度 | ✅ 已完成 |
| 10 | `frontend/src/pages/sales/shipments/ShipmentDetail.tsx` | 修改 | 跳转按钮、数值精度 | ⏳ 待实施 |
| 11 | `frontend/src/pages/sales/receipts/ReceiptDetail.tsx` | 修改 | 跳转按钮、数值精度 | ⏳ 待实施 |
| 12 | `frontend/src/pages/sales/invoices/InvoiceDetail.tsx` | 修改 | 跳转按钮、数值精度 | ⏳ 待实施 |
| 13 | `frontend/src/pages/purchase/arrivals/ArrivalDetail.tsx` | 修改 | 跳转按钮、数值精度 | ⏳ 待实施 |
| 14 | `frontend/src/pages/purchase/payments/PaymentDetail.tsx` | 修改 | 跳转按钮、数值精度 | ⏳ 待实施 |
| 15 | `frontend/src/pages/purchase/invoices/InvoiceDetail.tsx` | 修改 | 跳转按钮、数值精度 | ⏳ 待实施 |
| 16 | `frontend/src/pages/sales/contracts/ContractList.tsx` | 修改 | 数值精度 | ⏳ 待实施 |
| 17 | `frontend/src/pages/purchase/contracts/ContractList.tsx` | 修改 | 数值精度 | ⏳ 待实施 |
| 18 | `frontend/src/pages/sales/shipments/*.tsx` | 修改 | 数值精度 | ⏳ 待实施 |
| 19 | `frontend/src/pages/purchase/arrivals/*.tsx` | 修改 | 数值精度 | ⏳ 待实施 |

### 前端 — 类型定义
| # | 文件 | 操作 | 说明 | 状态 |
|---|------|------|------|------|
| 1 | `frontend/src/types/sale-receipt.ts` | 修改 | 新增 `is_tax_included?: boolean` | ⏳ 待实施 |
| 2 | `frontend/src/types/comparison.ts` | 修改 | 新增采购到货币种字段 | ✅ 已完成 |

---

## 验证方法

### 已完成的功能验证
1. **跨境运费显示**：采购到货选择USD币种 → 所有页面显示 $X.XXXXXX（≈ ¥X.XXXXXX）
2. **利润分析汇率**：CNY运费在利润分析中不乘汇率，USD运费乘汇率
3. **子信息金额**：跨境合同的子信息金额显示为 $X.XXXXXX（≈ ¥X.XXXXXX）
4. **剩余金额提示**：跨境合同新增发票时显示 $X.XXXXXX（≈ ¥X.XXXXXX）
5. **美元分析运费**：CNY运费在美元分析中显示为 $X.XXXXXX（已除以汇率）
6. **双币种分析**：任一合同跨境即显示人民币+美元分析
7. **独立采购合同**：关联对比页面独立采购合同单独显示
8. **流程图**：显示所有独立采购合同

### 待实施的功能验证
9. **数值精度**：所有金额显示为6位小数，百分比显示为2位小数
10. **含税收款**：创建不含税销售合同 → 添加收款记录 → 选择「按含税收款」→ 应收金额自动 ×1.13
11. **跳转按钮**：打开任意到货/发货/收款/付款/发票详情 → 点击「查看关联合同」→ 正确跳转到合同详情
12. **收款进度**：合同详情页 → 收款进度分母显示为应收金额（而非合同金额）

---

**文档结束**
