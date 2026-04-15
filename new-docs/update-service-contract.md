# 服务合同（佣金业务）跨境支持改造文档

> 创建日期：2026-04-15
> 状态：待实施

---

## 一、需求概述

### 1.1 背景

当前服务合同（`service_contracts`）的子订单（`service_orders`）只支持跨境（USD）一种模式。实际业务中存在国内（非跨境）和跨境两种佣金业务，需要根据大合同的「是否跨境」字段动态控制子订单的表单字段和展示内容。

### 1.2 改造范围

| 改动 | 说明 |
|------|------|
| 大合同新增 `is_cross_border` 字段 | 布尔值，默认 `false`，参考销售合同 |
| 跨境子订单新增字段 | 服务费比例、出港时间、客户付款时间、银行收汇时间、实际收款金额(USD) |
| 跨境子订单标签改名 | "收款金额RMB" → "兑换人民币金额"、"收款日期RMB" → "兑换日期"、"开票时间" → "佣金发票提供时间" |
| 非跨境子订单精简字段 | 订单号、负责人、数量、单价、总金额、服务费比例、开票时间、收款时间、收款金额 |
| 所有展示页面适配 | 销售模块详情页 + 经理模块其他业务页，根据 `is_cross_border` 切换显示 |

---

## 二、数据模型变更

### 2.1 `service_contracts` 集合 — 新增字段

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `is_cross_border` | Bool | `false` | `false` = 国内佣金，`true` = 跨境佣金 |

**PocketBase 后台操作** [手动]：进入 `service_contracts` 集合 → Edit → New field → Bool → 字段名 `is_cross_border` → 保存。

### 2.2 `service_orders` 集合 — 新增字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `service_fee_rate` | Number | 服务费比例（百分比，如 5 表示 5%） |
| `departure_date` | Date | 出港时间（仅跨境使用） |
| `customer_payment_date` | Date | 客户付款时间（仅跨境使用） |
| `bank_settlement_date` | Date | 银行收汇时间（仅跨境使用） |
| `actual_receipt_amount_usd` | Number | 实际收款金额(USD)（仅跨境使用） |
| `total_amount` | Number | 总金额（非跨境使用） |
| `invoice_time` | Date | 开票时间（非跨境使用） |
| `payment_date` | Date | 收款时间（非跨境使用） |
| `payment_amount` | Number | 收款金额（非跨境使用） |

> **说明**：现有字段 `unit_price`、`quantity`、`receipt_amount`、`receipt_date`、`receipt_amount_rmb`、`receipt_rmb_date`、`invoice_amount`、`invoice_date`、`tax_date`、`tax_amount` 保持不变，跨境模式下继续使用。非跨境模式使用新增的 `total_amount`、`invoice_time`、`payment_date`、`payment_amount` 字段。

**PocketBase 后台操作** [手动]：进入 `service_orders` 集合 → Edit → 逐个添加上述字段。

### 2.3 子订单字段使用对照

#### 跨境模式（`is_cross_border = true`）

| 字段名 | 表单标签 | 必填 | 说明 |
|--------|----------|------|------|
| `order_no` | 订单号 | 是 | |
| `manager` | 负责人 | 否 | |
| `unit_price` | 单价 | 否 | |
| `quantity` | 数量 | 否 | |
| `service_fee_rate` | 服务费比例(%) | 否 | 新增 |
| `receipt_amount` | 收款金额(USD) | 是 | |
| `receipt_date` | 收款时间 | 是 | |
| `departure_date` | 出港时间 | 否 | 新增 |
| `customer_payment_date` | 客户付款时间 | 否 | 新增 |
| `bank_settlement_date` | 银行收汇时间 | 否 | 新增 |
| `actual_receipt_amount_usd` | 实际收款金额(USD) | 否 | 新增 |
| `receipt_amount_rmb` | 兑换人民币金额 | 否 | 标签改名（原"收款金额RMB（兑换人民币金额）"） |
| `receipt_rmb_date` | 兑换日期 | 否 | 标签改名（原"收款日期RMB（兑换日期）"） |
| `invoice_amount` | 开票金额(RMB) | 否 | |
| `invoice_date` | 佣金发票提供时间 | 否 | 标签改名（原"开票时间"） |
| `tax_amount` | 报税金额(RMB) | 否 | |
| `tax_date` | 报税时间 | 否 | |
| `remark` | 备注 | 否 | |
| `attachments` | 附件 | 否 | |

#### 非跨境模式（`is_cross_border = false`）

| 字段名 | 表单标签 | 必填 | 说明 |
|--------|----------|------|------|
| `order_no` | 订单号 | 是 | |
| `manager` | 负责人 | 否 | |
| `quantity` | 数量 | 否 | |
| `unit_price` | 单价 | 否 | |
| `total_amount` | 总金额 | 否 | 新增 |
| `service_fee_rate` | 服务费比例(%) | 否 | 新增 |
| `invoice_time` | 开票时间 | 否 | 新增 |
| `payment_date` | 收款时间 | 否 | 新增 |
| `payment_amount` | 收款金额 | 否 | 新增 |
| `remark` | 备注 | 否 | |
| `attachments` | 附件 | 否 | |

---

## 三、后端修改

### 3.1 修改后端 Hooks

**文件**：`backend/hooks/service_contract.go`

在 `RegisterServiceContractHooks` 中新增：

#### 3.1.1 `service_contracts` OnRecordCreate — 设置 `is_cross_border` 默认值

```go
app.OnRecordCreate("service_contracts").Bind(&hook.Handler[*core.RecordEvent]{
    Func: func(e *core.RecordEvent) error {
        if !e.Record.GetBool("is_cross_border") {
            e.Record.Set("is_cross_border", false)
        }
        creatorId := e.Record.GetString("creator")
        if creatorId != "" {
            e.Record.Set("creator_user", creatorId)
        }
        return e.Next()
    },
    Priority: 0,
})
```

#### 3.1.2 `service_orders` OnRecordCreate — 保持现有逻辑不变

现有的 `creator_user` 自动填充逻辑无需修改。

---

## 四、前端修改

### 4.1 类型定义

**文件**：`frontend/src/types/service-contract.ts`

#### 4.1.1 `ServiceContract` 接口新增

```typescript
is_cross_border: boolean;
```

#### 4.1.2 `ServiceContractFormData` 接口新增

```typescript
is_cross_border?: boolean;
```

#### 4.1.3 `ServiceOrder` 接口新增

```typescript
service_fee_rate?: number;
departure_date?: string;
customer_payment_date?: string;
bank_settlement_date?: string;
actual_receipt_amount_usd?: number;
total_amount?: number;
invoice_time?: string;
payment_date?: string;
payment_amount?: number;
```

#### 4.1.4 `ServiceOrderFormData` 接口新增

```typescript
service_fee_rate?: number;
departure_date?: string;
customer_payment_date?: string;
bank_settlement_date?: string;
actual_receipt_amount_usd?: number;
total_amount?: number;
invoice_time?: string;
payment_date?: string;
payment_amount?: number;
```

---

### 4.2 API 层

**文件**：`frontend/src/api/service-contract.ts`

#### 4.2.1 `create` 方法 — 新增 `is_cross_border` 字段提交

在 `formData.append` 区域新增：

```typescript
formData.append('is_cross_border', String(data.is_cross_border ?? false));
```

#### 4.2.2 `update` 方法 — 新增 `is_cross_border` 字段提交

在 `formData.append` 区域新增：

```typescript
if (data.is_cross_border !== undefined) formData.append('is_cross_border', String(data.is_cross_border));
```

#### 4.2.3 `createOrder` 方法 — 新增子订单字段提交

在 `formData.append` 区域新增：

```typescript
if (data.service_fee_rate !== undefined) formData.append('service_fee_rate', String(data.service_fee_rate));
if (data.departure_date) formData.append('departure_date', data.departure_date);
if (data.customer_payment_date) formData.append('customer_payment_date', data.customer_payment_date);
if (data.bank_settlement_date) formData.append('bank_settlement_date', data.bank_settlement_date);
if (data.actual_receipt_amount_usd !== undefined) formData.append('actual_receipt_amount_usd', String(data.actual_receipt_amount_usd));
if (data.total_amount !== undefined) formData.append('total_amount', String(data.total_amount));
if (data.invoice_time) formData.append('invoice_time', data.invoice_time);
if (data.payment_date) formData.append('payment_date', data.payment_date);
if (data.payment_amount !== undefined) formData.append('payment_amount', String(data.payment_amount));
```

#### 4.2.4 `updateOrder` 方法 — 新增子订单字段提交

同上，为每个新增字段添加条件 `formData.append`。

---

### 4.3 大合同表单（ServiceForm）

**文件**：`frontend/src/pages/sales/services/ServiceForm.tsx`

#### 4.3.1 新增「跨境交易」Switch

参考销售合同 `ContractForm.tsx` 中的 `is_cross_border` Switch 实现，在「销售负责人」字段后添加：

```tsx
<Form.Item name="is_cross_border" label="跨境交易" valuePropName="checked">
  <Switch checkedChildren="跨境" unCheckedChildren="国内" />
</Form.Item>
```

需要从 `antd` 新增导入 `Switch`。

#### 4.3.2 initialValues 补充

`initialValues` 中补充 `is_cross_border: false`。

---

### 4.4 子订单表单（ServiceOrderForm）— 核心改造

**文件**：`frontend/src/pages/sales/services/ServiceOrderForm.tsx`

#### 4.4.1 新增 Props

```typescript
interface ServiceOrderFormProps {
  form: FormInstance<ServiceOrderFormData>;
  onFinish: (values: ServiceOrderFormData) => void;
  onCancel: () => void;
  contractId?: string;
  initialValues?: ServiceOrder | null;
  isCrossBorder?: boolean;  // 新增：从大合同传入
}
```

#### 4.4.2 根据 `isCrossBorder` 条件渲染表单字段

**跨境模式**（`isCrossBorder === true`）显示的字段：

| 字段 | 组件 | 说明 |
|------|------|------|
| order_no | Input | 订单号 |
| manager | Input | 负责人 |
| unit_price | InputNumber | 单价 |
| quantity | InputNumber | 数量 |
| **service_fee_rate** | InputNumber | 服务费比例(%) — **新增** |
| receipt_amount | InputNumber | 收款金额(USD) |
| receipt_date | DatePicker | 收款时间 |
| **departure_date** | DatePicker | 出港时间 — **新增** |
| **customer_payment_date** | DatePicker | 客户付款时间 — **新增** |
| **bank_settlement_date** | DatePicker | 银行收汇时间 — **新增** |
| **actual_receipt_amount_usd** | InputNumber | 实际收款金额(USD) — **新增** |
| receipt_amount_rmb | InputNumber | 兑换人民币金额 — **标签改名** |
| receipt_rmb_date | DatePicker | 兑换日期 — **标签改名** |
| invoice_amount | InputNumber | 开票金额(RMB) |
| invoice_date | DatePicker | **佣金发票提供时间** — **标签改名** |
| tax_amount | InputNumber | 报税金额(RMB) |
| tax_date | DatePicker | 报税时间 |
| remark | TextArea | 备注 |
| attachments | Upload | 附件 |

**非跨境模式**（`isCrossBorder === false`）显示的字段：

| 字段 | 组件 | 说明 |
|------|------|------|
| order_no | Input | 订单号 |
| manager | Input | 负责人 |
| quantity | InputNumber | 数量 |
| unit_price | InputNumber | 单价 |
| **total_amount** | InputNumber | 总金额 — **新增** |
| **service_fee_rate** | InputNumber | 服务费比例(%) — **新增** |
| **invoice_time** | DatePicker | 开票时间 — **新增** |
| **payment_date** | DatePicker | 收款时间 — **新增** |
| **payment_amount** | InputNumber | 收款金额 — **新增** |
| remark | TextArea | 备注 |
| attachments | Upload | 附件 |

#### 4.4.3 标签改名对照

| 原标签 | 新标签 | 适用模式 |
|--------|--------|----------|
| 收款金额RMB（兑换人民币金额） | 兑换人民币金额 | 跨境 |
| 收款日期RMB（兑换日期） | 兑换日期 | 跨境 |
| 开票时间 | 佣金发票提供时间 | 跨境 |

---

### 4.5 销售模块 — 服务合同详情页（ServiceDetail）

**文件**：`frontend/src/pages/sales/services/ServiceDetail.tsx`

#### 4.5.1 大合同基本信息新增「跨境交易」显示

在 `Descriptions` 中添加：

```tsx
<Descriptions.Item label="跨境交易">
  {contract.is_cross_border ? <Tag color="blue">跨境</Tag> : <Tag>国内</Tag>}
</Descriptions.Item>
```

#### 4.5.2 子订单表格列根据 `is_cross_border` 动态切换

**跨境模式列定义** (`is_cross_border === true`)：

| 列标题 | dataIndex | 说明 |
|--------|-----------|------|
| 订单号 | order_no | |
| 单价 | unit_price | |
| 数量 | quantity | |
| 服务费比例 | service_fee_rate | **新增** |
| 收款(USD) | receipt_amount | |
| 收款时间 | receipt_date | |
| 出港时间 | departure_date | **新增** |
| 客户付款时间 | customer_payment_date | **新增** |
| 银行收汇时间 | bank_settlement_date | **新增** |
| 实际收款(USD) | actual_receipt_amount_usd | **新增** |
| 兑换人民币金额 | receipt_amount_rmb | 标签改名 |
| 兑换日期 | receipt_rmb_date | 标签改名 |
| 开票金额(RMB) | invoice_amount | |
| 佣金发票提供时间 | invoice_date | 标签改名 |
| 报税金额(RMB) | tax_amount | |
| 报税时间 | tax_date | |
| 负责人 | manager | |
| 操作 | - | |

**非跨境模式列定义** (`is_cross_border === false`)：

| 列标题 | dataIndex |
|--------|-----------|
| 订单号 | order_no |
| 负责人 | manager |
| 数量 | quantity |
| 单价 | unit_price |
| 总金额 | total_amount |
| 服务费比例 | service_fee_rate |
| 开票时间 | invoice_time |
| 收款时间 | payment_date |
| 收款金额 | payment_amount |
| 操作 | - |

#### 4.5.3 ServiceOrderForm 传入 `isCrossBorder`

将 `ServiceOrderForm` 的 `isCrossBorder` prop 传入大合同的 `is_cross_border` 值：

```tsx
<ServiceOrderForm
  form={orderForm}
  onFinish={handleOrderFormFinish}
  onCancel={() => setOrderModalVisible(false)}
  contractId={id!}
  initialValues={editingOrder}
  isCrossBorder={contract.is_cross_border}
/>
```

#### 4.5.4 handleOrderFormFinish 补充新增字段的日期格式化

```typescript
if (values.departure_date) {
  submitData.departure_date = dayjs(values.departure_date).format('YYYY-MM-DD');
}
if (values.customer_payment_date) {
  submitData.customer_payment_date = dayjs(values.customer_payment_date).format('YYYY-MM-DD');
}
if (values.bank_settlement_date) {
  submitData.bank_settlement_date = dayjs(values.bank_settlement_date).format('YYYY-MM-DD');
}
if (values.invoice_time) {
  submitData.invoice_time = dayjs(values.invoice_time).format('YYYY-MM-DD');
}
if (values.payment_date) {
  submitData.payment_date = dayjs(values.payment_date).format('YYYY-MM-DD');
}
```

#### 4.5.5 handleEditOrder 补充新增字段的 dayjs 转换

在 `orderForm.setFieldsValue` 中补充：

```typescript
departure_date: record.departure_date ? dayjs(record.departure_date.split(' ')[0]) : undefined,
customer_payment_date: record.customer_payment_date ? dayjs(record.customer_payment_date.split(' ')[0]) : undefined,
bank_settlement_date: record.bank_settlement_date ? dayjs(record.bank_settlement_date.split(' ')[0]) : undefined,
actual_receipt_amount_usd: record.actual_receipt_amount_usd,
service_fee_rate: record.service_fee_rate,
total_amount: record.total_amount,
invoice_time: record.invoice_time ? dayjs(record.invoice_time.split(' ')[0]) : undefined,
payment_date: record.payment_date ? dayjs(record.payment_date.split(' ')[0]) : undefined,
payment_amount: record.payment_amount,
```

---

### 4.6 销售模块 — 服务合同列表页（ServiceList）

**文件**：`frontend/src/pages/sales/services/ServiceList.tsx`

#### 4.6.1 列表新增「跨境交易」列

在表格列中添加「跨境交易」Tag 列：

```tsx
{
  title: '类型',
  dataIndex: 'is_cross_border',
  key: 'is_cross_border',
  width: 80,
  render: (v: boolean) => v ? <Tag color="blue">跨境</Tag> : <Tag>国内</Tag>,
},
```

#### 4.6.2 编辑时补充 `is_cross_border` 字段

`handleEdit` 中 `form.setFieldsValue` 已通过展开 `...record` 自动包含 `is_cross_border`，无需额外处理。

---

### 4.7 经理模块 — 其他业务页（OtherBusinessPage）

**文件**：`frontend/src/pages/manager/OtherBusinessPage.tsx`

#### 4.7.1 服务合同列表新增「跨境交易」列

在 `serviceColumns` 中添加：

```tsx
{
  title: '类型',
  key: 'type',
  width: 80,
  render: (_: unknown, record: ServiceContract) =>
    record.is_cross_border ? <Tag color="blue">跨境</Tag> : <Tag>国内</Tag>,
},
```

#### 4.7.2 服务合同详情 Modal 新增「跨境交易」显示

在 `renderModalContent` 的 `service` 分支中添加：

```tsx
<Descriptions.Item label="跨境交易">
  {r.is_cross_border ? <Tag color="blue">跨境</Tag> : <Tag>国内</Tag>}
</Descriptions.Item>
```

#### 4.7.3 子订单表格列动态切换

当前 `serviceOrderColumns` 是静态常量，需改为函数，接收 `isCrossBorder` 参数：

**跨境模式列**：

| 列标题 | dataIndex | 说明 |
|--------|-----------|------|
| 订单号 | order_no | |
| 单价 | unit_price | |
| 数量 | quantity | |
| 服务费比例 | service_fee_rate | **新增** |
| 收款金额(USD) | receipt_amount | |
| 收款时间 | receipt_date | |
| 出港时间 | departure_date | **新增** |
| 客户付款时间 | customer_payment_date | **新增** |
| 银行收汇时间 | bank_settlement_date | **新增** |
| 实际收款(USD) | actual_receipt_amount_usd | **新增** |
| 兑换人民币金额 | receipt_amount_rmb | 标签改名 |
| 兑换日期 | receipt_rmb_date | 标签改名 |
| 开票金额(RMB) | invoice_amount | |
| 佣金发票提供时间 | invoice_date | 标签改名 |
| 报税金额(RMB) | tax_amount | |
| 报税时间 | tax_date | |
| 备注 | remark | |
| 负责人 | manager | |

**非跨境模式列**：

| 列标题 | dataIndex |
|--------|-----------|
| 订单号 | order_no |
| 负责人 | manager |
| 数量 | quantity |
| 单价 | unit_price |
| 总金额 | total_amount |
| 服务费比例 | service_fee_rate |
| 开票时间 | invoice_time |
| 收款时间 | payment_date |
| 收款金额 | payment_amount |
| 备注 | remark |

实现方式：定义 `getServiceOrderColumns(isCrossBorder: boolean)` 函数，返回对应列配置。

#### 4.7.4 调用处修改

在 `renderModalContent` 的 `service` 分支中，`Table` 的 `columns` 改为动态：

```tsx
const currentContract = modalData.data as ServiceContract;
// ...
<Table
  columns={getServiceOrderColumns(currentContract.is_cross_border)}
  dataSource={serviceOrders}
  // ...
/>
```

---

## 五、修改文件总清单

### PocketBase 后台 [手动]

| 集合 | 操作 | 说明 |
|------|------|------|
| `service_contracts` | 新增字段 | `is_cross_border` (Bool, 默认 false) |
| `service_orders` | 新增字段 | `service_fee_rate` (Number) |
| `service_orders` | 新增字段 | `departure_date` (Date) |
| `service_orders` | 新增字段 | `customer_payment_date` (Date) |
| `service_orders` | 新增字段 | `bank_settlement_date` (Date) |
| `service_orders` | 新增字段 | `actual_receipt_amount_usd` (Number) |
| `service_orders` | 新增字段 | `total_amount` (Number) |
| `service_orders` | 新增字段 | `invoice_time` (Date) |
| `service_orders` | 新增字段 | `payment_date` (Date) |
| `service_orders` | 新增字段 | `payment_amount` (Number) |

### 后端 (Go)

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/hooks/service_contract.go` | 修改 | 新增 `service_contracts` OnRecordCreate hook，设置 `is_cross_border` 默认值和 `creator_user` |

### 前端类型

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/service-contract.ts` | 修改 | `ServiceContract` 新增 `is_cross_border`；`ServiceContractFormData` 新增 `is_cross_border`；`ServiceOrder` 新增 9 个字段；`ServiceOrderFormData` 新增 9 个字段 |

### 前端 API

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/service-contract.ts` | 修改 | `create`/`update` 新增 `is_cross_border`；`createOrder`/`updateOrder` 新增 9 个字段 |

### 前端页面

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/sales/services/ServiceForm.tsx` | 修改 | 新增「跨境交易」Switch |
| `frontend/src/pages/sales/services/ServiceOrderForm.tsx` | 修改 | 新增 `isCrossBorder` prop，根据值条件渲染不同字段组；标签改名 |
| `frontend/src/pages/sales/services/ServiceDetail.tsx` | 修改 | 大合同 Descriptions 新增跨境标签；子订单表格列动态切换；ServiceOrderForm 传入 `isCrossBorder`；日期格式化补充新增字段 |
| `frontend/src/pages/sales/services/ServiceList.tsx` | 修改 | 列表新增「类型」列 |
| `frontend/src/pages/manager/OtherBusinessPage.tsx` | 修改 | 服务合同列表新增「类型」列；详情 Modal 新增跨境标签；子订单表格列动态切换 |

---

## 六、实施顺序

```
1. PocketBase 后台操作 [手动]
   ├── service_contracts 添加 is_cross_border 字段
   └── service_orders 添加 9 个新字段

2. 后端 hooks
   └── 修改 service_contract.go，新增 service_contracts OnRecordCreate

3. 前端类型
   └── 修改 types/service-contract.ts

4. 前端 API
   └── 修改 api/service-contract.ts

5. 前端页面（按依赖顺序）
   ├── ServiceForm.tsx（大合同表单加 Switch）
   ├── ServiceOrderForm.tsx（核心改造：条件渲染）
   ├── ServiceDetail.tsx（详情页适配）
   ├── ServiceList.tsx（列表加类型列）
   └── OtherBusinessPage.tsx（经理模块适配）
```

---

## 七、验证方法

### 7.1 跨境模式验证

1. 新建服务合同，开启「跨境交易」Switch → 保存后确认 `is_cross_border` 为 `true`
2. 进入详情页，新增子订单 → 表单应显示：订单号、负责人、单价、数量、**服务费比例**、收款金额(USD)、收款时间、**出港时间**、**客户付款时间**、**银行收汇时间**、**实际收款金额(USD)**、**兑换人民币金额**、**兑换日期**、开票金额(RMB)、**佣金发票提供时间**、报税金额(RMB)、报税时间、备注、附件
3. 确认标签已改名：兑换人民币金额、兑换日期、佣金发票提供时间
4. 提交子订单后，表格列与表单字段对应，数据正确显示
5. 经理端「其他业务」→ 佣金合同 Tab → 点击查看 → 同样正确显示跨境字段

### 7.2 非跨境模式验证

1. 新建服务合同，不开启「跨境交易」Switch → 保存后确认 `is_cross_border` 为 `false`
2. 进入详情页，新增子订单 → 表单应只显示：订单号、负责人、数量、单价、**总金额**、**服务费比例**、**开票时间**、**收款时间**、**收款金额**、备注、附件
3. 确认不显示任何跨境专用字段（出港时间、银行收汇时间等）
4. 提交子订单后，表格显示正确
5. 经理端同样正确显示

### 7.3 列表验证

1. 服务合同列表页显示「类型」列（跨境/国内 Tag）
2. 经理端其他业务页的服务合同列表同样显示「类型」列

### 7.4 编辑验证

1. 编辑跨境大合同 → 关闭跨境 Switch → 保存 → 子订单表单切换为非跨境字段
2. 编辑已有子订单 → 字段正确回填

### 7.5 兼容性验证

1. 已存在的旧服务合同（无 `is_cross_border` 字段）→ 默认显示为国内模式
2. 已存在的旧子订单 → 跨境字段为空不影响显示
