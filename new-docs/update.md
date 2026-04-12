# MY-ERP-SYSTEM 后续实施文档

> 本文档用于记录阶段四之后的实施内容。
> 阶段五和阶段六从 `new-docs/实施指南.md` 迁移至此，后续新增变更也会添加到本文档前面的位置。

---

## 新增变更实施步骤 (A-H)

---

### 步骤 A: 采购发票添加「是否验票」字段

**类型**: 手动 + 代码修改  
**依赖**: 无  
**预计时间**: 1 小时

#### A.1 PocketBase 后台手动添加字段 [手动]

在 PocketBase 管理后台，为 `purchase_invoices` 集合添加字段：

| 字段名 | 类型 | 可选值 | 说明 |
|--------|------|--------|------|
| is_verified | select | yes,no | 是否验票 |

默认值在 hooks 中设置。

#### A.2 修改后端 Hooks 设置默认值

**文件**: `backend/hooks/purchase_invoice.go`

在 `RegisterPurchaseInvoiceHooks` 的 `OnRecordCreate` handler 中，紧跟 `e.Record.Set("manager_confirmed", "pending")` 后添加：

```go
e.Record.Set("is_verified", "no")
```

#### A.3 扩展 TypeScript 类型

**文件**: `frontend/src/types/purchase-contract.ts`

在 `PurchaseInvoice` 接口中添加：

```typescript
is_verified?: string;
```

**文件**: `frontend/src/types/comparison.ts`

在 `PurchaseInvoiceRecord` 接口中添加：

```typescript
is_verified: string;
```

#### A.4 采购模块合同详情页显示

**文件**: `frontend/src/pages/purchase/contracts/ContractDetail.tsx`

在 `invoiceColumns` 数组中，在「收票日期」列后添加：

```tsx
{
  title: '是否验票',
  dataIndex: 'is_verified',
  key: 'is_verified',
  render: (v: string) => v === 'yes' ? <Tag color="green">已验票</Tag> : <Tag color="orange">未验票</Tag>,
},
```

#### A.5 经理模块合同详情页显示

**文件**: `frontend/src/pages/manager/ContractDetailPage.tsx`

在采购发票表格的列定义中（`purchaseInvoiceColumns`），添加「是否验票」列：

```tsx
{
  title: '是否验票',
  dataIndex: 'is_verified',
  key: 'is_verified',
  render: (v: string) => v === 'yes' ? <Tag color="green">已验票</Tag> : <Tag color="orange">未验票</Tag>,
},
```

#### A.6 流程可视化页面节点详情显示

**文件**: `frontend/src/pages/manager/ProgressFlowPage.tsx`

在 `renderModalDetail` 函数的 `purchase_invoice` 分支的 `<Descriptions>` 中添加：

```tsx
<Descriptions.Item label="是否验票">
  {r.is_verified === 'yes' ? <Tag color="green">已验票</Tag> : <Tag color="orange">未验票</Tag>}
</Descriptions.Item>
```

#### 验证方法

1. PocketBase 后台确认 `purchase_invoices` 集合已有 `is_verified` 字段
2. 采购创建发票后，默认值为 `no`（未验票）
3. 采购合同详情页能看到验票状态
4. 经理合同详情页能看到验票状态
5. 流程可视化页面点击采购发票节点能看到验票状态

---

### 步骤 B: 经理模块新增业绩统计页面

**类型**: 手动 + 代码修改  
**依赖**: 无  
**预计时间**: 4-6 小时

#### B.1 PocketBase 后台添加关系字段 [手动]

为以下两个集合添加 `creator_user` 关系字段，指向 `users` 集合：

| 集合 | 字段名 | 类型 | 关联到 | 说明 |
|------|--------|------|--------|------|
| sales_contracts | creator_user | relation | users | 创建该合同的用户 |
| purchase_contracts | creator_user | relation | users | 创建该合同的用户 |

#### B.2 修改后端 Hooks 自动填充 creator_user

**文件**: `backend/hooks/sales_contract.go`

在 `OnRecordCreate` handler 中添加（紧跟现有 `Set` 语句后）：

```go
creatorId := e.Record.GetString("creator")
if creatorId != "" {
    e.Record.Set("creator_user", creatorId)
}
```

> **说明**: PocketBase 的 `creator` 字段存储的是认证用户的 ID，但由于某些版本可能不自动暴露，这里显式设置到 `creator_user` 关系字段上，便于前端 expand 展开。如果 `creator` 字段已经可以直接 expand 到 users 表，则可以跳过此步，直接在 API 请求中 expand creator 即可。需先在 PocketBase 后台确认 `creator` 字段是否为自动关联字段。

**文件**: `backend/hooks/purchase_contract.go`

同样在 `OnRecordCreate` handler 中添加相同的逻辑：

```go
creatorId := e.Record.GetString("creator")
if creatorId != "" {
    e.Record.Set("creator_user", creatorId)
}
```

#### B.3 新建 API 方法

**文件**: 新建 `frontend/src/api/performance.ts`

```typescript
import { pb } from '@/lib/pocketbase';

export const PerformanceAPI = {
  getSalesPerformance: async (startDate?: string, endDate?: string) => {
    const filters: string[] = [];
    if (startDate) filters.push(`created >= "${startDate}"`);
    if (endDate) filters.push(`created <= "${endDate}"`);
    
    const result = await pb.collection('sales_contracts').getList(1, 1000, {
      filter: filters.length > 0 ? filters.join(' && ') : undefined,
      expand: 'creator_user',
    });
    return result;
  },

  getPurchasePerformance: async (startDate?: string, endDate?: string) => {
    const filters: string[] = [];
    if (startDate) filters.push(`created >= "${startDate}"`);
    if (endDate) filters.push(`created <= "${endDate}"`);
    
    const result = await pb.collection('purchase_contracts').getList(1, 1000, {
      filter: filters.length > 0 ? filters.join(' && ') : undefined,
      expand: 'creator_user',
    });
    return result;
  },
};
```

#### B.4 新建业绩统计页面

**文件**: 新建 `frontend/src/pages/manager/PerformancePage.tsx`

页面结构：

```
PerformancePage (/manager/performance)
├── 筛选区域
│   ├── 开始日期 DatePicker
│   ├── 结束日期 DatePicker
│   └── 查询按钮
├── Tabs (销售业绩 | 采购业绩)
│   ├── Tab 1: 销售业绩
│   │   └── Table
│   │       ├── 业务员名称
│   │       ├── 合同数量
│   │       ├── 合同总金额
│   │       ├── 已收款金额
│   │       └── 收款比例
│   └── Tab 2: 采购业绩
│       └── Table
│           ├── 业务员名称
│           ├── 合同数量
│           ├── 合同总金额
│           ├── 已付款金额
│           └── 付款比例
```

**数据聚合逻辑**：

1. 获取所有销售/采购合同（expand creator_user）
2. 按 `creator_user`（或 `creator`）分组
3. 每组统计：合同数量、合同总金额之和、已收款/已付款金额之和
4. 计算收款/付款比例

#### B.5 添加路由

**文件**: `frontend/src/routes/index.tsx`

1. 添加 lazy import：

```tsx
const PerformancePage = lazy(() => import('@/pages/manager/PerformancePage').then(m => ({ default: m.default })));
```

2. 在 `/manager` children 中添加：

```tsx
{
  path: 'performance',
  element: <PerformancePage />,
},
```

#### B.6 添加菜单项

**文件**: `frontend/src/layouts/MainLayout.tsx`

在 `MENU_CONFIG` 的 `manager` 数组中添加：

```tsx
{
  key: 'performance',
  label: '业绩统计',
  icon: <TeamOutlined />,
  path: '/manager/performance',
},
```

#### 验证方法

1. 访问 `/manager/performance`，页面正常加载
2. 经理侧边栏菜单显示「业绩统计」
3. 销售业绩 Tab 显示每个销售员的统计数据
4. 采购业绩 Tab 显示每个采购员的统计数据
5. 按时间筛选功能正常

---

### 步骤 C: 流程可视化下拉框显示待确认数量红色标记

**类型**: 代码修改  
**依赖**: 无  
**预计时间**: 1 小时

#### C.1 修改 ProgressFlowPage 下拉选项显示

**文件**: `frontend/src/pages/manager/ProgressFlowPage.tsx`

**当前状态**: `Select` 组件的 options 从 `ComparisonAPI.getFlowContractOptions()` 获取，每个选项只显示合同编号和品名。

**修改方案**:

1. 在获取合同选项后，对每个合同额外查询其待确认节点数量
2. 在 Select 的 option label 中用红色 Badge 显示待确认数量

**实现方式**：

```tsx
// 获取选项时同时获取待确认数量
const fetchOptionsWithPendingCount = async () => {
  const options = await ComparisonAPI.getFlowContractOptions();
  // 对每个 option，调用 getContractDetail 计算待确认数量
  const enrichedOptions = await Promise.all(
    options.map(async (opt) => {
      try {
        const detail = await ComparisonAPI.getContractDetail(opt.id);
        let pendingCount = 0;
        detail.sale_invoices.forEach(r => { if (r.manager_confirmed === 'pending') pendingCount++; });
        detail.sale_receipts.forEach(r => { if (r.manager_confirmed === 'pending') pendingCount++; });
        detail.purchase_arrivals.forEach(r => { if (r.manager_confirmed === 'pending') pendingCount++; });
        detail.purchase_invoices.forEach(r => { if (r.manager_confirmed === 'pending') pendingCount++; });
        detail.purchase_payments.forEach(r => { if (r.manager_confirmed === 'pending') pendingCount++; });
        return { ...opt, pendingCount };
      } catch {
        return { ...opt, pendingCount: 0 };
      }
    })
  );
  setContractOptions(enrichedOptions);
};

// Select 组件的 optionRender
<Select
  optionRender={(option) => {
    const data = option.data as FlowContractOption & { pendingCount?: number };
    return (
      <span>
        {option.label}
        {data.pendingCount > 0 && (
          <Badge
            count={data.pendingCount}
            style={{ backgroundColor: '#ff4d4f', marginLeft: 8 }}
          />
        )}
      </span>
    );
  }}
/>
```

> **性能优化**: 如果合同数量较多，逐个查询详情会很慢。可考虑在 `ComparisonAPI` 中新增一个批量方法，一次查询返回每个合同的待确认计数，或者在后端 hooks 中维护一个计数字段。

#### 验证方法

1. 访问 `/manager/progress-flow`
2. 下拉框中，有待确认节点的合同后面显示红色数字
3. 经理确认后，数字实时更新（重新选择时）

---

### 步骤 D: 通知中心添加删除功能

**类型**: 代码修改  
**依赖**: 无  
**预计时间**: 1 小时

#### D.1 扩展 API 方法

**文件**: `frontend/src/api/notification.ts`

添加删除方法：

```typescript
delete: async (id: string) => {
  return pb.collection('notifications').delete(id);
},
```

**文件**: `frontend/src/api/sales-notification.ts`

添加删除方法：

```typescript
delete: async (id: string) => {
  return pb.collection('notifications_02').delete(id);
},
```

#### D.2 修改采购通知列表页

**文件**: `frontend/src/pages/purchase/notifications/NotificationList.tsx`

1. 导入 `DeleteOutlined`、`Popconfirm`

2. 添加 `handleDelete` 方法：

```tsx
const handleDelete = async (id: string) => {
  try {
    await NotificationAPI.delete(id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.error('Delete notification error:', err);
    message.error('删除失败');
  }
};
```

3. 在 `columns` 的操作列中，添加删除按钮（在 `CheckOutlined` 按钮后面）：

```tsx
<Popconfirm
  title="确定删除此通知？"
  onConfirm={() => handleDelete(record.id)}
  okText="确定"
  cancelText="取消"
>
  <Button type="text" danger icon={<DeleteOutlined />} />
</Popconfirm>
```

#### D.3 修改销售通知列表页

**文件**: `frontend/src/pages/sales/notifications/NotificationList.tsx`

同 D.2 完全相同的修改，只是 API 换成 `SalesNotificationAPI.delete`。

#### D.4 PocketBase 权限配置 [手动]

在 PocketBase 管理后台，确认 `notifications` 和 `notifications_02` 集合中：

- `recipient` 对应角色的用户有「删除」权限（即用户可以删除自己收到的通知）

> **安全建议**: 如果 PocketBase 支持 filter 规则，建议设置删除权限只能删除 `recipient = @request.auth.id` 的记录。

#### 验证方法

1. 采购/销售通知列表中，每条通知后面显示删除按钮
2. 点击删除按钮弹出确认框
3. 确认后通知被删除，列表刷新

---

### 步骤 E: 通知已读状态实时更新

**类型**: 代码修改  
**依赖**: 无  
**预计时间**: 1-2 小时

#### E.1 问题分析

**当前行为**: `MainLayout.tsx` 中使用 `setInterval(fetchUnreadCount, 30000)` 每 30 秒轮询一次未读数量。通知中心页面标记已读后，需要等轮询周期到达才更新侧边栏红色标记。

**目标**: 通知中心标记已读后，侧边栏红色标记立即消失（或缩短到 3-5 秒内）。

#### E.2 方案：使用 Zustand 全局 store 共享未读计数

**文件**: 新建 `frontend/src/stores/notification.ts`

```typescript
import { create } from 'zustand';
import { NotificationAPI } from '@/api/notification';
import { SalesNotificationAPI } from '@/api/sales-notification';
import { useAuthStore } from './auth';

interface NotificationState {
  unreadCount: number;
  fetchUnreadCount: () => Promise<void>;
  decrementUnread: () => void;
  setUnreadCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,

  fetchUnreadCount: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    try {
      let count = 0;
      if (user.type === 'purchasing') {
        count = await NotificationAPI.getUnreadCount();
      } else if (user.type === 'sales') {
        count = await SalesNotificationAPI.getUnreadCount();
      }
      set({ unreadCount: count });
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  },

  decrementUnread: () => {
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) }));
  },

  setUnreadCount: (count: number) => {
    set({ unreadCount: count });
  },
}));
```

#### E.3 修改 MainLayout 使用全局 store

**文件**: `frontend/src/layouts/MainLayout.tsx`

1. 导入 `useNotificationStore` 替代组件内的本地 `unreadCount` state

2. 将原有的 `useState(unreadCount)` + `useEffect(fetchUnreadCount)` 替换为：

```tsx
const { unreadCount, fetchUnreadCount } = useNotificationStore();

useEffect(() => {
  if (user.type === 'purchasing' || user.type === 'sales') {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }
}, [user.type, fetchUnreadCount]);
```

#### E.4 修改通知列表页，标记已读后同步更新

**文件**: `frontend/src/pages/purchase/notifications/NotificationList.tsx`

在 `handleViewDetail` 和 `handleMarkAsRead` 中，标记已读成功后调用：

```tsx
import { useNotificationStore } from '@/stores/notification';

// 在组件内
const { decrementUnread } = useNotificationStore();

// 标记已读成功后
decrementUnread();
```

**文件**: `frontend/src/pages/sales/notifications/NotificationList.tsx`

同上，标记已读成功后调用 `decrementUnread()`。

#### E.5 修改步骤 D 中删除通知的逻辑

在删除通知时，如果该通知是未读的，也需要 `decrementUnread()`：

```tsx
const handleDelete = async (id: string) => {
  try {
    const record = data.find(n => n.id === id);
    await NotificationAPI.delete(id);
    if (record && !record.is_read) {
      decrementUnread();
    }
    message.success('删除成功');
    fetchData();
  } catch (err) {
    message.error('删除失败');
  }
};
```

#### 验证方法

1. 采购/销售通知列表标记已读后，侧边栏红色数字立即减少
2. 删除未读通知后，红色数字立即减少
3. 新通知到达后（30 秒轮询），红色数字增加

---

### 步骤 F: 新建佣金服务费业务（销售端）

**类型**: 手动 + 代码修改  
**依赖**: 无  
**预计时间**: 4-6 小时

#### 业务说明

佣金业务采用「大合同 + 子订单」结构：

- **大合同（service_contracts）**：一个客户的一个佣金服务大合同，仅记录合同基本信息（编号、客户、服务名称、签约日期等）
- **子订单（service_orders）**：大合同下的每一笔佣金订单，记录单价、数量、收款、兑换人民币、开票、报税等明细

#### F.1 PocketBase 后台创建集合 [手动]

##### 集合一：`service_contracts`（佣金大合同）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| no | text | 合同编号 |
| customer | relation → customers | 客户 |
| product_name | text | 服务名称 |
| sign_date | date | 签约日期 |
| remark | text | 备注 |
| attachments | file | 附件 |
| sales_manager | text | 销售负责人 |
| creator_user | relation → users | 关联用户 |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限**: 与 `sales_contracts` 一致。

##### 集合二：`service_orders`（佣金子订单）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| service_contract | relation → service_contracts | 所属大合同 |
| order_no | text | 佣金订单号 |
| unit_price | number | 单价 |
| quantity | number | 数量（此单的） |
| receipt_amount | number | 收款金额（此单的，单位 USD） |
| receipt_date | date | 收款时间 |
| receipt_amount_rmb | number | 收款金额RMB |
| receipt_rmb_date | date | 收款时间RMB |
| invoice_amount | number | 开票金额（此单的） |
| invoice_date | date | 开票时间 |
| tax_date | date | 报税时间 |
| tax_amount | number | 报税金额 |
| remark | text | 备注 |
| attachments | file | 附件 |
| manager | text | 负责人 |
| creator_user | relation → users | 关联用户 |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限**: 与 `sales_contracts` 一致（销售角色 CRUD 本人创建，经理只读）。

#### F.2 新建类型文件

**文件**: 新建 `frontend/src/types/service-contract.ts`

```typescript
export interface ServiceContract {
  id: string;
  no: string;
  customer: string;
  product_name: string;
  sign_date: string;
  remark?: string;
  attachments?: string | string[];
  sales_manager?: string;
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    customer?: { id: string; name: string };
    creator_user?: { id: string; name: string };
  };
}

export interface ServiceContractFormData {
  no: string;
  customer: string;
  product_name: string;
  sign_date: string;
  remark?: string;
  attachments?: File[];
  sales_manager?: string;
}

export interface ServiceContractListParams {
  page?: number;
  per_page?: number;
  search?: string;
}

export interface ServiceOrder {
  id: string;
  service_contract: string;
  order_no: string;
  unit_price: number;
  quantity: number;
  receipt_amount: number;
  receipt_date: string;
  receipt_amount_rmb?: number;
  receipt_rmb_date?: string;
  invoice_amount: number;
  invoice_date?: string;
  tax_date?: string;
  tax_amount?: number;
  remark?: string;
  attachments?: string | string[];
  manager?: string;
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    creator_user?: { id: string; name: string };
  };
}

export interface ServiceOrderFormData {
  service_contract: string;
  order_no: string;
  unit_price: number;
  quantity: number;
  receipt_amount: number;
  receipt_date: string;
  receipt_amount_rmb?: number;
  receipt_rmb_date?: string;
  invoice_amount?: number;
  invoice_date?: string;
  tax_date?: string;
  tax_amount?: number;
  remark?: string;
  attachments?: File[];
  manager?: string;
}
```

#### F.3 新建 API 文件

**文件**: 新建 `frontend/src/api/service-contract.ts`

参照 `frontend/src/api/sales-contract.ts` 模式，封装 `ServiceContractAPI`：

| 方法 | 集合 | 说明 |
|------|------|------|
| `list(params)` | `service_contracts` | 列表，带客户端搜索过滤 + 分页 |
| `getById(id)` | `service_contracts` | 详情，expand customer, creator_user |
| `create(data)` | `service_contracts` | 创建，FormData 方式（支持附件） |
| `update(id, data)` | `service_contracts` | 更新，FormData 部分 update |
| `delete(id)` | `service_contracts` | 删除 |
| `getOrders(contractId)` | `service_orders` | 获取大合同下的所有子订单 |
| `createOrder(data)` | `service_orders` | 新增子订单 |
| `updateOrder(id, data)` | `service_orders` | 更新子订单 |
| `deleteOrder(id)` | `service_orders` | 删除子订单 |

#### F.4 新建页面文件

| 文件 | 说明 |
|------|------|
| `frontend/src/pages/sales/services/ServiceList.tsx` | 服务合同列表 |
| `frontend/src/pages/sales/services/ServiceForm.tsx` | 大合同新建/编辑表单 |
| `frontend/src/pages/sales/services/ServiceDetail.tsx` | 大合同详情（含子订单表格 + 新增/编辑子订单 Modal） |
| `frontend/src/pages/sales/services/ServiceOrderForm.tsx` | 子订单新建/编辑表单 |

**列表页（ServiceList）字段**: 合同编号、服务名称、客户(expand)、签约日期、操作

**大合同表单（ServiceForm）字段**: 合同编号、客户(select)、服务名称、签约日期、销售负责人、备注、附件

**详情页（ServiceDetail）结构**:

```
ServiceDetail
├── 返回按钮 → /sales/services
├── 合同基本信息 Card (Descriptions)
│   ├── 合同编号、服务名称、客户
│   ├── 签约日期、销售负责人、备注
│   └── 附件（下载链接）
├── 佣金订单列表 Card
│   ├── 新增订单 Button
│   └── Table
│       ├── 订单号、单价、数量、收款金额(USD)、收款时间
│       ├── 收款金额RMB、收款时间RMB
│       ├── 开票金额、开票时间
│       ├── 报税时间、报税金额
│       ├── 备注、负责人
│       └── 操作（编辑 / 删除）
└── 新增/编辑订单 Modal (ServiceOrderForm)
```

**子订单表单（ServiceOrderForm）字段**: 订单号、单价、数量、收款金额(USD)、收款时间、收款金额RMB、收款时间RMB、开票金额、开票时间、报税时间、报税金额、负责人、备注、附件

#### F.5 添加路由

**文件**: `frontend/src/routes/index.tsx`

1. 添加 lazy import：

```tsx
const ServiceList = lazy(() => import('@/pages/sales/services/ServiceList').then(m => ({ default: m.ServiceList })));
const ServiceDetail = lazy(() => import('@/pages/sales/services/ServiceDetail').then(m => ({ default: m.ServiceDetail })));
```

2. 在 `/sales` children 中添加：

```tsx
{ path: 'services', element: <ServiceList /> },
{ path: 'services/:id', element: <ServiceDetail /> },
```

#### F.6 添加菜单项

**文件**: `frontend/src/layouts/MainLayout.tsx`

在 `MENU_CONFIG` 的 `sales` 数组中，在「通知中心」前添加：

```tsx
{ key: 'services', label: '服务合同', icon: <FileTextOutlined />, path: '/sales/services' },
```

#### F.7 修改后端 Hooks

**文件**: 新建 `backend/hooks/service_contract.go`

**`service_orders` hooks**:

- `OnRecordCreate("service_orders")`: 自动填充 `creator_user`

- 注册到 `main.go` 的 `RegisterHooks` 中

**文件**: `backend/hooks/main.go`

添加：

```go
RegisterServiceContractHooks(app)
```

#### 验证方法

1. PocketBase 后台确认 `service_contracts` 和 `service_orders` 集合已创建
2. 销售端侧边栏显示「服务合同」菜单
3. 可以创建、编辑、删除、查看服务合同
4. 在合同详情页可以新增/编辑/删除子订单

---

### 步骤 G: 新建资金流出表（采购端）

**类型**: 手动 + 代码修改  
**依赖**: 无  
**预计时间**: 4-6 小时

#### G.1 PocketBase 后台创建集合 [手动]

**集合名**: `expense_records`

| 字段名 | 类型 | 说明 |
|--------|------|------|
| no | text | 记录编号 |
| expense_type | text | 支出类型（标书保证金、U盾费等） |
| description | text | 描述说明 |
| payment_amount | number | 付款金额 |
| pay_date | date | 付款日期 |
| method | text | 付款方式 |
| remark | text | 备注 |
| attachments | file | 附件 |
| purchasing_manager | text | 采购负责人 |
| creator_user | relation → users | 关联用户 |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限**: 与 `purchase_contracts` 一致。

#### G.2 新建类型文件

**文件**: 新建 `frontend/src/types/expense-record.ts`

```typescript
export interface ExpenseRecord {
  id: string;
  no: string;
  expense_type: string;
  description: string;
  payment_amount: number;
  pay_date: string;
  method?: string;
  remark?: string;
  attachments?: string | string[];
  purchasing_manager?: string;
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    creator_user?: { id: string; name: string };
  };
}

export interface ExpenseRecordFormData { ... }
export interface ExpenseRecordListParams { ... }
```

#### G.3 新建 API 文件

**文件**: 新建 `frontend/src/api/expense-record.ts`

参照 `frontend/src/api/purchase-contract.ts` 模式，封装 `ExpenseRecordAPI`，操作 `expense_records` 集合。

#### G.4 新建页面文件

| 文件 | 说明 |
|------|------|
| `frontend/src/pages/purchase/expenses/ExpenseList.tsx` | 支出记录列表 |
| `frontend/src/pages/purchase/expenses/ExpenseForm.tsx` | 新建/编辑表单 |
| `frontend/src/pages/purchase/expenses/ExpenseDetail.tsx` | 支出详情 |

**列表页字段**: 编号、支出类型、描述、付款金额、付款日期

**表单字段**: 编号、支出类型、描述、付款金额、付款日期、付款方式、备注、附件

#### G.5 添加路由

**文件**: `frontend/src/routes/index.tsx`

在 `/purchase` children 中添加：

```tsx
{ path: 'expenses', element: <ExpenseList /> },
{ path: 'expenses/:id', element: <ExpenseDetail /> },
```

#### G.6 添加菜单项

**文件**: `frontend/src/layouts/MainLayout.tsx`

在 `MENU_CONFIG` 的 `purchasing` 数组中，在「通知中心」前添加：

```tsx
{ key: 'expenses', label: '资金支出', icon: <DollarOutlined />, path: '/purchase/expenses' },
```

#### G.7 修改后端 Hooks

**文件**: 新建 `backend/hooks/expense_record.go`

- `OnRecordCreate`: 自动填充 `creator_user`
- 注册到 `main.go` 的 `RegisterHooks` 中

#### 验证方法

1. PocketBase 后台确认 `expense_records` 集合已创建
2. 采购端侧边栏显示「资金支出」菜单
3. 可以创建、编辑、删除、查看支出记录

---

### 步骤 H: 新建投标管理（销售端）

**类型**: 手动 + 代码修改  
**依赖**: 无  
**预计时间**: 4-6 小时

#### 业务说明

投标管理用于记录销售端的投标业务流程：

1. **投标阶段**：填写招标公司、招标编号、产品信息、标书费、投标保证金等
2. **开标后**：填写中标结果、保证金退还信息、招标代理费
3. **中标后**：如果中标，可关联已有的销售合同

关联销售合同字段初始为空，中标后由用户手动关联。

#### H.1 PocketBase 后台创建集合 [手动]

**集合名**: `bidding_records`

| 字段名 | 类型 | 说明 |
|--------|------|------|
| bidding_company | text | 招标公司 |
| bidding_no | text | 招标编号 |
| product_name | text | 产品名称 |
| quantity | number | 数量 |
| tender_fee | number | 标书费 |
| tender_fee_date | date | 付标书费时间 |
| tender_fee_invoice | file | 标书费发票附件 |
| bid_bond | number | 投标保证金 |
| bid_bond_date | date | 付保证金时间 |
| open_date | date | 开标时间 |
| bid_result | select | 中标结果：pending / won / lost |
| bond_return_date | date | 保证金退还时间 |
| bond_return_amount | number | 退还金额 |
| agency_fee | number | 招标代理费 |
| sales_contract | relation → sales_contracts | 关联销售合同（可选） |
| remark | text | 备注 |
| attachments | file | 附件 |
| creator_user | relation → users | 关联用户 |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限**: 与 `sales_contracts` 一致。

#### H.2 新建类型文件

**文件**: 新建 `frontend/src/types/bidding-record.ts`

```typescript
export interface BiddingRecord {
  id: string;
  bidding_company: string;
  bidding_no: string;
  product_name: string;
  quantity: number;
  tender_fee: number;
  tender_fee_date: string;
  tender_fee_invoice?: string | string[];
  bid_bond: number;
  bid_bond_date: string;
  open_date: string;
  bid_result: 'pending' | 'won' | 'lost';
  bond_return_date?: string;
  bond_return_amount?: number;
  agency_fee?: number;
  sales_contract?: string;
  remark?: string;
  attachments?: string | string[];
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    sales_contract?: { id: string; no: string; product_name: string };
    creator_user?: { id: string; name: string };
  };
}

export interface BiddingRecordFormData {
  bidding_company: string;
  bidding_no: string;
  product_name: string;
  quantity: number;
  tender_fee?: number;
  tender_fee_date?: string;
  tender_fee_invoice?: File[];
  bid_bond?: number;
  bid_bond_date?: string;
  open_date?: string;
  bid_result?: string;
  bond_return_date?: string;
  bond_return_amount?: number;
  agency_fee?: number;
  sales_contract?: string;
  remark?: string;
  attachments?: File[];
}

export interface BiddingRecordListParams {
  page?: number;
  per_page?: number;
  search?: string;
  bid_result?: string;
}
```

#### H.3 新建 API 文件

**文件**: 新建 `frontend/src/api/bidding-record.ts`

参照 `frontend/src/api/sales-contract.ts` 模式，封装 `BiddingRecordAPI`：

| 方法 | 集合 | 说明 |
|------|------|------|
| `list(params)` | `bidding_records` | 列表，带客户端搜索/中标结果过滤 + 分页 |
| `getById(id)` | `bidding_records` | 详情，expand sales_contract, creator_user |
| `create(data)` | `bidding_records` | 创建，FormData 方式（支持附件） |
| `update(id, data)` | `bidding_records` | 更新，FormData 部分 update |
| `delete(id)` | `bidding_records` | 删除 |

#### H.4 新建页面文件

| 文件 | 说明 |
|------|------|
| `frontend/src/pages/sales/bidding/BiddingList.tsx` | 投标记录列表 |
| `frontend/src/pages/sales/bidding/BiddingForm.tsx` | 新建/编辑表单 |
| `frontend/src/pages/sales/bidding/BiddingDetail.tsx` | 投标详情 |

**列表页（BiddingList）字段**: 招标公司、招标编号、产品名称、数量、标书费、投标保证金、开标时间、中标结果、操作

**表单（BiddingForm）字段**:

- **投标信息区**：招标公司、招标编号、产品名称、数量
- **标书费区**：标书费、付标书费时间、标书费发票附件
- **保证金区**：投标保证金、付保证金时间
- **开标信息区**：开标时间、中标结果（待开标/中标/未中标）
- **退还区**：保证金退还时间、退还金额
- **其他区**：招标代理费、关联销售合同（Select，可选）、备注、附件

**详情页（BiddingDetail）结构**:

```
BiddingDetail
├── 返回按钮 → /sales/bidding
├── 投标基本信息 Card (Descriptions)
│   ├── 招标公司、招标编号
│   ├── 产品名称、数量
│   ├── 标书费、付标书费时间、标书费发票附件
│   ├── 投标保证金、付保证金时间
│   ├── 开标时间、中标结果
│   ├── 保证金退还时间、退还金额
│   ├── 招标代理费
│   ├── 关联销售合同（如有则显示链接）
│   ├── 备注
│   └── 附件（下载链接）
└── 编辑按钮 → 打开编辑 Modal
```

#### H.5 添加路由

**文件**: `frontend/src/routes/index.tsx`

1. 添加 lazy import：

```tsx
const BiddingList = lazy(() => import('@/pages/sales/bidding/BiddingList').then(m => ({ default: m.BiddingList })));
const BiddingDetail = lazy(() => import('@/pages/sales/bidding/BiddingDetail').then(m => ({ default: m.BiddingDetail })));
```

2. 在 `/sales` children 中添加：

```tsx
{ path: 'bidding', element: <BiddingList /> },
{ path: 'bidding/:id', element: <BiddingDetail /> },
```

#### H.6 添加菜单项

**文件**: `frontend/src/layouts/MainLayout.tsx`

在 `MENU_CONFIG` 的 `sales` 数组中，在「通知中心」前添加：

```tsx
{ key: 'bidding', label: '投标管理', icon: <FileTextOutlined />, path: '/sales/bidding' },
```

#### H.7 修改后端 Hooks

**文件**: 新建 `backend/hooks/bidding_record.go`

- `OnRecordCreate("bidding_records")`: 自动填充 `creator_user`，设置 `bid_result = pending`
- 注册到 `main.go` 的 `RegisterHooks` 中

**文件**: `backend/hooks/main.go`

添加：

```go
RegisterBiddingRecordHooks(app)
```

#### H.8 销售合同详情页显示关联投标记录

**文件**: `frontend/src/pages/sales/contracts/ContractDetail.tsx`

当投标记录关联了某个销售合同时，在该销售合同详情页底部显示关联的投标信息表格。

**实现方案**:

1. 在 `BiddingRecordAPI` 中新增方法 `getBySalesContract(contractId)`，通过 `filter: sales_contract = "${contractId}"` 查询关联的投标记录
2. 在 `ContractDetail.tsx` 中，加载合同详情时同时查询关联投标记录
3. 在收款记录 Card 下方新增「关联投标记录」Card，展示 Table

**表格列**: 招标公司、招标编号、产品名称、数量、标书费、投标保证金、开标时间、中标结果

```tsx
const biddingColumns = [
  { title: '招标公司', dataIndex: 'bidding_company', key: 'bidding_company' },
  { title: '招标编号', dataIndex: 'bidding_no', key: 'bidding_no' },
  { title: '产品名称', dataIndex: 'product_name', key: 'product_name' },
  { title: '数量', dataIndex: 'quantity', key: 'quantity' },
  { title: '标书费', dataIndex: 'tender_fee', key: 'tender_fee', render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
  { title: '投标保证金', dataIndex: 'bid_bond', key: 'bid_bond', render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
  { title: '开标时间', dataIndex: 'open_date', key: 'open_date', render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '中标结果', dataIndex: 'bid_result', key: 'bid_result', render: (v: string) => { /* Tag */ } },
  { title: '操作', key: 'action', render: (_: unknown, record: BiddingRecord) => (
    <Button type="link" onClick={() => navigate(`/sales/bidding/${record.id}`)}>查看</Button>
  )},
];
```

**文件**: `frontend/src/api/bidding-record.ts`

新增方法：

```typescript
getBySalesContract: async (contractId: string) => {
  return pb.collection('bidding_records').getList<BiddingRecord>(1, 100, {
    filter: `sales_contract = "${contractId}"`,
  });
},
```

#### 验证方法

1. PocketBase 后台确认 `bidding_records` 集合已创建
2. 销售端侧边栏显示「投标管理」菜单
3. 可以创建、编辑、删除、查看投标记录
4. 新建投标记录默认中标结果为「待开标」
5. 中标后可关联销售合同
6. 销售合同详情页底部显示关联的投标记录表格（如有）
7. 点击投标记录表格中的「查看」可跳转到投标详情页

---

### 步骤 I: 经理模块新增「其他业务」页面

**类型**: 代码修改  
**依赖**: 步骤 F、G 和 H 完成  
**预计时间**: 2-3 小时

#### I.1 新建页面

**文件**: 新建 `frontend/src/pages/manager/OtherBusinessPage.tsx`

页面结构：

```
OtherBusinessPage (/manager/other-business)
├── Tabs (服务合同 | 资金支出 | 投标记录)
│   ├── Tab 1: 服务合同
│   │   └── Table（只读）
│   │       ├── 合同编号
│   │       ├── 服务名称
│   │       ├── 客户 (expand customer)
│   │       ├── 签约日期
│   │       └── 操作（查看详情 Drawer）
│   ├── Tab 2: 资金支出
│   │   └── Table（只读）
│   │       ├── 编号
│   │       ├── 支出类型
│   │       ├── 描述
│   │       ├── 付款金额
│   │       ├── 付款日期
│   │       └── 操作（查看详情 Drawer）
│   └── Tab 3: 投标记录
│       └── Table（只读）
│           ├── 招标公司
│           ├── 招标编号
│           ├── 产品名称
│           ├── 标书费
│           ├── 投标保证金
│           ├── 开标时间
│           ├── 中标结果
│           └── 操作（查看详情 Drawer）
```

**数据获取**:

- 服务合同：直接调用 `pb.collection('service_contracts').getList()` （经理有读权限）
- 资金支出：直接调用 `pb.collection('expense_records').getList()`
- 投标记录：直接调用 `pb.collection('bidding_records').getList()`

**详情展示**: 点击「查看」按钮弹出 Drawer/Modal，使用 Descriptions 组件展示所有字段。

#### I.2 添加路由

**文件**: `frontend/src/routes/index.tsx`

1. 添加 lazy import：

```tsx
const OtherBusinessPage = lazy(() => import('@/pages/manager/OtherBusinessPage').then(m => ({ default: m.default })));
```

2. 在 `/manager` children 中添加：

```tsx
{ path: 'other-business', element: <OtherBusinessPage /> },
```

#### I.3 添加菜单项

**文件**: `frontend/src/layouts/MainLayout.tsx`

在 `MENU_CONFIG` 的 `manager` 数组中添加：

```tsx
{
  key: 'other-business',
  label: '其他业务',
  icon: <FileTextOutlined />,
  path: '/manager/other-business',
},
```

#### 验证方法

1. 访问 `/manager/other-business`，页面正常加载
2. 经理侧边栏显示「其他业务」菜单
3. 服务合同 Tab 显示所有服务合同记录
4. 资金支出 Tab 显示所有支出记录
5. 点击「查看」能弹出详情

---

## 实施顺序建议

```
A. 采购发票「是否验票」字段 (独立，优先级高)
    ├── A.1 [手动] PocketBase 添加字段
    ├── A.2 后端 hooks 设置默认值
    └── A.3-A.6 前端类型+页面修改

B. 经理模块业绩统计 (独立)
    ├── B.1 [手动] PocketBase 添加 creator_user 关系字段
    ├── B.2 后端 hooks 自动填充
    └── B.3-B.6 前端页面+路由+菜单

C. 流程可视化待确认数量标记 (独立)
    └── C.1 修改 ProgressFlowPage

D+E. 通知系统优化 (有依赖关系，建议一起做)
    ├── D.1-D.4 通知删除功能
    └── E.1-E.5 通知已读实时更新

F+G+H+I. 服务合同+资金支出+投标+经理查看 (有依赖关系)
    ├── F.1-F.7 佣金服务合同 + 佣金子订单 (销售端)
    │   ├── F.1 [手动] PocketBase 创建 service_contracts + service_orders 两个集合
    │   └── F.2-F.7 前端类型 + API + 页面 + 路由 + 菜单 + 后端 Hooks (仅子订单自动填充)
    ├── G.1-G.7 资金支出 (采购端)
    ├── H.1-H.7 投标管理 (销售端，独立于 F/G)
    └── I.1-I.3 经理端查看页面 (依赖 F、G 和 H)
```

---

## 修改文件总清单

### 后端 (Go)

| 文件 | 操作 | 步骤 |
|------|------|------|
| `backend/hooks/purchase_invoice.go` | 修改 | A |
| `backend/hooks/sales_contract.go` | 修改 | B |
| `backend/hooks/purchase_contract.go` | 修改 | B |
| `backend/hooks/main.go` | 修改 | F, G, H |
| `backend/hooks/service_contract.go` | **新建** | F |
| `backend/hooks/expense_record.go` | **新建** | G |
| `backend/hooks/bidding_record.go` | **新建** | H |

### 前端类型

| 文件 | 操作 | 步骤 |
|------|------|------|
| `frontend/src/types/purchase-contract.ts` | 修改 | A |
| `frontend/src/types/comparison.ts` | 修改 | A |
| `frontend/src/types/service-contract.ts` | **新建** | F |
| `frontend/src/types/expense-record.ts` | **新建** | G |
| `frontend/src/types/bidding-record.ts` | **新建** | H |

### 前端 API

| 文件 | 操作 | 步骤 |
|------|------|------|
| `frontend/src/api/notification.ts` | 修改 | D |
| `frontend/src/api/sales-notification.ts` | 修改 | D |
| `frontend/src/api/performance.ts` | **新建** | B |
| `frontend/src/api/service-contract.ts` | **新建** | F |
| `frontend/src/api/expense-record.ts` | **新建** | G |
| `frontend/src/api/bidding-record.ts` | **新建** | H |

### 前端页面

| 文件 | 操作 | 步骤 |
|------|------|------|
| `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 修改 | A |
| `frontend/src/pages/manager/ContractDetailPage.tsx` | 修改 | A |
| `frontend/src/pages/manager/ProgressFlowPage.tsx` | 修改 | A, C |
| `frontend/src/pages/purchase/notifications/NotificationList.tsx` | 修改 | D, E |
| `frontend/src/pages/sales/notifications/NotificationList.tsx` | 修改 | D, E |
| `frontend/src/pages/manager/PerformancePage.tsx` | **新建** | B |
| `frontend/src/pages/sales/services/ServiceList.tsx` | **新建** | F |
| `frontend/src/pages/sales/services/ServiceForm.tsx` | **新建** | F |
| `frontend/src/pages/sales/services/ServiceDetail.tsx` | **新建** | F |
| `frontend/src/pages/sales/services/ServiceOrderForm.tsx` | **新建** | F |
| `frontend/src/pages/purchase/expenses/ExpenseList.tsx` | **新建** | G |
| `frontend/src/pages/purchase/expenses/ExpenseForm.tsx` | **新建** | G |
| `frontend/src/pages/purchase/expenses/ExpenseDetail.tsx` | **新建** | G |
| `frontend/src/pages/sales/bidding/BiddingList.tsx` | **新建** | H |
| `frontend/src/pages/sales/bidding/BiddingForm.tsx` | **新建** | H |
| `frontend/src/pages/sales/bidding/BiddingDetail.tsx` | **新建** | H |
| `frontend/src/pages/manager/OtherBusinessPage.tsx` | **新建** | I |

### 前端路由/布局/Store

| 文件 | 操作 | 步骤 |
|------|------|------|
| `frontend/src/routes/index.tsx` | 修改 | B, F, G, H, I |
| `frontend/src/layouts/MainLayout.tsx` | 修改 | B, E, F, G, H |
| `frontend/src/stores/notification.ts` | **新建** | E |

---

## 阶段五：UI/UX 与 PWA

---

### 步骤 17: 新增页面样式统一

**类型**: CSS 修改  
**依赖**: 步骤 9-11 完成  
**预计时间**: 1-2 小时

**样式检查清单**:

| 检查项 | 规范 |
|--------|------|
| 按钮圆角 | 8px |
| 卡片圆角 | 12px，阴影 `0 4px 12px rgba(0, 0, 0, 0.08)` |
| 输入框圆角 | 8px，双层阴影 |
| 状态标签 | 圆角 8px，边框 1px solid currentColor |
| 进度条 | 圆角 8px |
| 表格 | 圆角 12px，悬停背景 `rgba(24, 144, 255, 0.04)` |
| 模态框 | 圆角 12px |
| 下拉菜单 | 圆角 8px，阴影 `0 4px 12px rgba(0, 0, 0, 0.15)` |
| 分页器 | 圆角 8px |

**需要检查的文件**:

- `frontend/src/pages/SystemSelect.css`
- `frontend/src/pages/manager/OverviewPage.tsx` (内联样式或 CSS 模块)
- `frontend/src/pages/manager/ProgressFlowPage.tsx` (内联样式或 CSS 模块)
- `frontend/src/pages/manager/ContractDetailPage.tsx` (合同详情独立页面)

---

### 步骤 18: PWA 配置

**类型**: 配置文件修改 + 手动上传图标  
**依赖**: 步骤 17 完成  
**预计时间**: 2-3 小时

**18.1 安装 vite-plugin-pwa**

```bash
cd frontend
npm install vite-plugin-pwa -D
```

**18.2 创建 manifest.json**

**文件路径**: `frontend/public/manifest.json`

```json
{
  "name": "企业采购销售管理系统",
  "short_name": "ERP系统",
  "description": "企业采购销售管理系统",
  "theme_color": "#1A1A1A",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait",
  "scope": "/",
  "start_url": "/",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**18.3 上传图标文件** [手动]

需要在 `frontend/public/` 目录下上传以下文件:

- `icon-192.png` (192x192 像素)
- `icon-512.png` (512x512 像素)

**此步骤需要人工准备并上传图标文件**

**18.4 配置 Vite PWA 插件**

**文件路径**: `frontend/vite.config.ts`

```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-*.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api.*\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|woff2)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-resources',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ]
});
```

**18.5 更新 index.html**

**文件路径**: `frontend/index.html`

```html
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/icon-512.png" />
  <meta name="theme-color" content="#1A1A1A" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="ERP系统" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
</head>
```

**验证方法**:

1. 构建项目: `npm run build`
2. 启动项目: `npm run preview`
3. 打开 Chrome DevTools → Application → Service Workers
4. 检查 Service Worker 是否已注册
5. 检查 Manifest 是否正确加载

**⚠️ 潜在问题与解决方案**:

| # | 问题 | 影响 | 解决方案 |
|---|------|------|----------|
| 1 | **`vite-plugin-pwa` 与 Vite 7 兼容性** | 安装后可能报错或构建失败 | 当前项目 Vite 版本为 `7.3.1`，`vite-plugin-pwa` 最新版可能未适配。安装后立即运行 `npm run build` 测试，若失败：① 查看 vite-plugin-pwa GitHub Issues 是否有 Vite 7 支持；② 如无则临时降级 Vite 到 `6.x`（需同时调整 `@vitejs/plugin-react` 版本）；③ 或等待插件更新 |
| 2 | **`npm run build`（`tsc -b`）的 TS 5.9 兼容问题** | 构建直接报错，无法生成 dist | `tsconfig.app.json` 中 `ignoreDeprecations: "6.0"` 在 TS 5.9 中会导致 `tsc -b` 失败。解决方案：移除 `ignoreDeprecations` 字段，或将 `npm run build` 脚本改为 `vite build`（跳过 tsc 检查，由 IDE 单独做类型检查）|
| 3 | **API 缓存的 `urlPattern` 不覆盖开发环境** | 开发环境 Service Worker 缓存不生效 | 文档中 `urlPattern: /^https:\/\/api.*\/.*/i` 只匹配 `https://api` 开头的 URL，开发环境 `http://127.0.0.1:8090` 不会被匹配。建议改为同时覆盖两种：`urlPattern: /^https?:\/\/(api.*\|127\.0\.0\.1:8090)\/.*/i`。生产环境不受影响 |
| 4 | **图标文件缺失** | PWA 安装时无图标、manifest 报错 | `frontend/public/` 下当前只有 `vite.svg`，需要手动准备 `icon-192.png`（192x192）和 `icon-512.png`（512x512）。没有图标不影响功能，但会影响"添加到主屏幕"的体验。可用在线工具（如 favicon.io）从 logo 生成 |
| 5 | **Service Worker 缓存导致更新不生效** | 用户看到的始终是旧版本 | 已配置 `registerType: 'autoUpdate'`，会在检测到新 SW 时自动刷新。但需注意：如果修改了缓存策略（`globPatterns` 或 `runtimeCaching`），旧的 SW 缓存名不会自动失效，可能需要用户手动清除浏览器缓存或修改 `cacheName` |
| 6 | **双系统（北京/兰州）的 PWA 冲突** | 同一浏览器安装两个系统时图标/缓存混淆 | 两个系统共用同一套前端代码和 manifest（相同的 `name` 和 `short_name`），PWA 会视为同一应用。解决方案：在 `pocketbase.ts` 的 `getApiBaseUrl()` 中根据 `erp_system` 值动态设置 manifest 的 `name`（如"ERP系统-北京"），或将 manifest 改为动态生成 |

---

### 步骤 19: 移动端适配

**类型**: CSS 修改  
**依赖**: 步骤 17 完成  
**预计时间**: 2-3 小时

**19.1 添加 CSS 媒体查询**

**文件路径**: `frontend/src/index.css`

在文件末尾添加:

```css
/* 移动端适配 */
@media screen and (max-width: 767px) {
  .ant-layout-sider {
    display: none;
  }
  
  .ant-layout-content {
    margin: 8px !important;
    padding: 12px !important;
  }
  
  .ant-table-wrapper {
    overflow-x: auto;
  }
  
  .ant-form-inline {
    display: flex;
    flex-direction: column;
  }
  
  .ant-form-inline .ant-form-item {
    margin-bottom: 12px;
  }
}

/* 平板适配 */
@media screen and (min-width: 768px) and (max-width: 1024px) {
  .ant-layout-sider {
    width: 200px !important;
  }
}
```

**19.2 优化 MainLayout 移动端逻辑**

**文件路径**: `frontend/src/layouts/MainLayout.tsx`

- 确保汉堡菜单在移动端正确显示
- 抽屉菜单宽度调整为屏幕宽度的 80%

**19.3 复杂页面移动端适配**

OverviewPage 和 ProgressFlowPage 在移动端:
- 改为单列纵向布局
- 进度条组件适当缩小
- 详情 Drawer 占满屏幕宽度

**验证方法**:

1. 使用 Chrome DevTools 模拟移动端 (iPhone/Android)
2. 检查各页面布局是否正常
3. 测试汉堡菜单是否正常显示
4. 测试表格横向滚动

**⚠️ 潜在问题与解决方案**:

| # | 问题 | 影响 | 解决方案 |
|---|------|------|----------|
| 1 | **MainLayout 移动端逻辑已基本就绪** | 重复工作 | `MainLayout.tsx` 已有 `isMobile` 判断（`window.innerWidth <= 767`）、Drawer 侧边栏、汉堡按钮等逻辑。步骤 19 主要只需补充 CSS 媒体查询，JS 层改动量很小 |
| 2 | **复杂页面的表格横向滚动** | 表格列太多，移动端溢出 | 大部分列表页已设置 `scroll={{ x: ... }}`，Ant Design Table 会自动横向滚动。需确保外层容器有 `overflow-x: auto`，已在文档的 CSS 媒体查询中覆盖（`.ant-table-wrapper { overflow-x: auto }`）|
| 3 | **经理模块复杂页面移动端体验差** | OverviewPage（卡片列表）和 ProgressFlowPage（ReactFlow 画布）在手机上难以操作 | 这两个页面交互复杂（拖拽、连线、多列布局），完整的移动端适配成本高。建议：① OverviewPage 在移动端改为单列列表，隐藏部分筛选器；② ProgressFlowPage 在移动端提示"建议在电脑端查看"，或仅显示简化的文字列表视图。优先级取决于是否需要在手机上使用经理模块 |
| 4 | **Drawer/Modal 在移动端的宽度** | Drawer 固定 280px 在小屏幕上可能太宽或太窄 | 文档建议 Drawer 宽度改为屏幕 80%。Ant Design Drawer 支持 `width: '80%'` 或 `width: window.innerWidth * 0.8`。其他 Modal 也应考虑 `width: '90%'` 或使用 `responsive` 配置 |
| 5 | **CSS `!important` 与媒体查询优先级冲突** | 现有 `index.css` 大量使用 `!important`，媒体查询中的覆盖可能不生效 | 现有样式（按钮、卡片等）已经用 `!important` 声明，移动端媒体查询中如果需要缩小间距或隐藏元素，也需要用 `!important`。建议媒体查询中的覆盖规则统一加上 `!important` |
| 6 | **Ant Design 组件自带响应式行为** | Ant Design v5+ 的 Grid 系统（Row/Col）有内置响应式，可能与自定义媒体查询冲突 | 项目中已使用 `<Row gutter={16}>` + `<Col span={12}>` 布局，在移动端 `span={12}` 仍然占一半宽度。建议改为响应式写法：`<Col xs={24} sm={24} md={12}>`，让移动端自动变为全宽。涉及所有 Form 页面 |



## 阶段六部署实施详细分析

> 基于项目现有配置和文档分析，整理出实际可执行的部署方案。
> 每个步骤标注 **[代码]** （助手可完成）或 **[手动]** （需人工操作）。

---

### 现状盘点

| 组件 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 前端 Dockerfile | `frontend/Dockerfile` | ✅ 可用 | Node 构建 + Nginx 运行，但缺少 nginx.conf |
| 后端 Dockerfile | `backend/Dockerfile` | ✅ 可用 | Go 构建 + Alpine 运行 |
| docker-compose | `docker-compose.yml` | ⚠️ 单系统 | 只有 1 套 frontend + pocketbase |
| Traefik 静态配置 | `traefik/traefik.yml` | ✅ 可用 | 80/443 入口，Let's Encrypt 已配置 |
| Traefik 动态路由 | `traefik/dynamic.toml` | ⚠️ 单域名 | 只有 `henghuacheng.cn` + `api.henghuacheng.cn` |
| SSL 证书 | `traefik/acme.json` | ✅ 已有 | root:600 权限，已有签发记录 |
| 前端 API 配置 | `frontend/src/lib/pocketbase.ts` | ✅ 可用 | 运行时按 localStorage 中 `erp_system` 值选择 API 域名，无需修改 |
| PWA 插件 | `frontend/vite.config.ts` | ✅ 已集成 | vite-plugin-pwa 已配置 |
| pb_migrations | `pb_migrations/` | ❌ 空目录 | 没有迁移脚本，兰州系统需手动建表 |
| 图标文件 | `frontend/public/icon-*.png` | ✅ 已有 | 192px 和 512px 图标都有 |
| Docker 代理 | `.docker/config.json` | ✅ 已配置 | 内网代理 10.255.255.254:7897 |

---

### 架构方案：统一前端入口 + 双后端

用户访问同一个前端域名，进入后在「系统选择页」选择北京或兰州系统，前端根据用户选择连接到不同的 PocketBase 后端。

| 用途 | 域名 | 说明 |
|------|------|------|
| 前端（统一入口） | `erp.henghuacheng.cn` | 所有用户共用，运行时选择系统 |
| 北京系统 API | `api-beijing.henghuacheng.cn` | 北京 PocketBase 后端 |
| 兰州系统 API | `api-lanzhou.henghuacheng.cn` | 兰州 PocketBase 后端 |

**前端构建策略**：只需构建 1 份前端镜像。`pocketbase.ts` 已实现运行时根据 `localStorage` 中的 `erp_system` 值选择 API 域名，无需修改。

**数据隔离**：两个 PocketBase 实例各自使用独立的数据目录（`pb_data_beijing` / `pb_data_lanzhou`）。

**用户访问流程**：

```
用户访问 erp.henghuacheng.cn
  → 进入系统选择页 (SystemSelect)
  → 选择「北京系统」或「兰州系统」
  → localStorage.setItem('erp_system', 'beijing'|'lanzhou')
  → 跳转登录页
  → 登录后前端自动连接对应系统的 API
```

---

### 部署步骤总览

```
步骤 1: DNS 解析配置                              [手动] ✅ 已完成
步骤 2: 前端构建验证 (npm run build)                [代码] ✅ 已完成
步骤 3: 新建 frontend/nginx.conf                   [代码] ✅ 已完成
步骤 4: 修改 frontend/Dockerfile                   [代码] ✅ 已完成
步骤 5: 重写 docker-compose.yml                    [代码] ✅ 已完成
步骤 6: 重写 traefik/dynamic.toml                  [代码] ✅ 已完成
步骤 7: 本地构建后端二进制文件 (Docker 编译 Go)      [代码] ✅ 已完成
步骤 8: 本地打包项目 (tar)                          [代码]
步骤 9: 上传压缩包到服务器 (scp)                    [手动]
步骤 10: 服务器上解压并准备                         [手动]
步骤 11: 启动 Docker 容器                           [手动]
步骤 12: PocketBase 管理员创建 + CORS 配置          [手动]
步骤 13: 兰州系统集合创建 (手动建表)                [手动]
步骤 14: 功能验证                                  [手动]
```

---

### 步骤 1: DNS 解析配置 [手动]

**操作人**: 需要到域名服务商（阿里云/腾讯云等）管理后台

**前置操作 — 删除旧记录**:

| 主机记录 | 操作 | 原因 |
|----------|------|------|
| `@` | 删除 | 根域名不再使用 |
| `www` | 删除 | 不再使用 |
| `api`（如有） | 删除 | 改用 api-beijing / api-lanzhou |

**新增 DNS A 记录**:

| 主机记录 | 记录类型 | 记录值 | 说明 |
|----------|----------|--------|------|
| erp | A | 服务器公网 IP | 统一前端入口 |
| api-beijing | A | 服务器公网 IP | 北京系统 API |
| api-lanzhou | A | 服务器公网 IP | 兰州系统 API |

共 3 条 A 记录，全部指向同一台服务器的公网 IP。

**验证方法**: 配置后等待 DNS 生效（通常 1-10 分钟），执行：

```bash
ping erp.henghuacheng.cn
ping api-beijing.henghuacheng.cn
ping api-lanzhou.henghuacheng.cn
```

均能解析到正确 IP 即为成功。

---

### 步骤 2: 前端构建验证 [代码]

**执行命令**:

```bash
cd frontend
npm run build
```

**注意事项**:

- `npm run build` = `tsc -b && vite build`，TS 5.9 可能导致 `tsc -b` 报错
- 如果 tsc 报错，需要将 `package.json` 中 build 脚本改为 `vite build`（跳过 tsc 检查）
- 构建成功后确认 `frontend/dist/` 目录生成

---

### 步骤 3: 新建 frontend/nginx.conf [代码]

**文件**: `frontend/nginx.conf`

**内容要点**:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA 路由回退：所有未匹配的请求返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1024;
}
```

**为什么需要**: React SPA 应用使用前端路由（如 `/sales/contracts`），刷新页面时 Nginx 默认会去查找对应文件并返回 404。`try_files` 回退到 `index.html` 让前端路由接管。

---

### 步骤 4: 修改 frontend/Dockerfile [代码]

> **为什么简化**: 服务器内存不足，无法在 Docker 内执行 `npm install` + `npm run build`。
> 改为使用步骤 2 本地已构建好的 `dist/` 目录，Dockerfile 只做 COPY，服务器上无需 Node.js 编译。

**修改为**：

```dockerfile
FROM nginx:alpine

COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**无需构建参数**：因为前端只有一份镜像，API 域名在运行时通过 `pocketbase.ts` 动态选择。

---

### 步骤 5: 重写 docker-compose.yml [代码]

**改动要点**:

```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: erp-frontend
    restart: unless-stopped
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`erp.henghuacheng.cn`)"
      - "traefik.http.routers.frontend.entryPoints=websecure"
      - "traefik.http.routers.frontend.tls.certResolver=letsencrypt"
      - "traefik.http.services.frontend.loadbalancer.server.port=80"

  pocketbase-beijing:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: erp-pocketbase-beijing
    command: ["./pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data_beijing"]
    volumes:
      - ./backend/pb_data_beijing:/pb_data_beijing
    restart: unless-stopped
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.beijing-api.rule=Host(`api-beijing.henghuacheng.cn`)"
      - "traefik.http.routers.beijing-api.entryPoints=websecure"
      - "traefik.http.routers.beijing-api.tls.certResolver=letsencrypt"
      - "traefik.http.services.beijing-pocketbase.loadbalancer.server.port=8090"

  pocketbase-lanzhou:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: erp-pocketbase-lanzhou
    command: ["./pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data_lanzhou"]
    volumes:
      - ./backend/pb_data_lanzhou:/pb_data_lanzhou
    restart: unless-stopped
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.lanzhou-api.rule=Host(`api-lanzhou.henghuacheng.cn`)"
      - "traefik.http.routers.lanzhou-api.entryPoints=websecure"
      - "traefik.http.routers.lanzhou-api.tls.certResolver=letsencrypt"
      - "traefik.http.services.lanzhou-pocketbase.loadbalancer.server.port=8090"

  traefik:
    image: traefik:v2.9
    container_name: erp-traefik
    command:
      - "--configFile=/etc/traefik/traefik.yml"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik:/etc/traefik
    networks:
      - web
    restart: unless-stopped

networks:
  web:
    driver: bridge
```

**关键变化**:
- 只有 **1 个前端容器**（不再是 2 个）
- 移除了 PocketBase 的 `ports: "8090:8090"` 直连映射（改为通过 Traefik 路由）
- 路由通过 Docker labels 定义，不再依赖 `dynamic.toml` 中的服务定义
- 两个 PocketBase 实例各自挂载独立数据目录
- 北京系统继续使用现有的 `pb_data`（需重命名为 `pb_data_beijing`）
- 移除了 `version: '3.8'`（新版 Docker Compose 不再需要）

---

### 步骤 6: 重写 traefik/dynamic.toml [代码]

使用 Docker labels 方式定义路由后，`dynamic.toml` 只需保留 HTTP→HTTPS 自动重定向：

```toml
# HTTP 自动跳转 HTTPS
[http.routers]
  [http.routers.http-catchall]
    rule = "PathPrefix(`/`)"
    entryPoints = ["web"]
    middlewares = ["redirect-to-https"]
    service = "noop@internal"

[http.middlewares]
  [http.middlewares.redirect-to-https.redirectScheme]
    scheme = "https"
    permanent = true
```

---

### 步骤 7: 本地构建后端二进制文件 [代码]

> **为什么需要**: 服务器内存不足，无法在 Docker 容器内编译 Go（CGO_ENABLED=1 编译 PocketBase 需要较大内存）。
> 改为在本地预先编译好 Linux x86_64 二进制文件，打包时直接带上，服务器上无需编译。

**操作位置**: 本地开发机

**构建命令**（使用 Docker 容器编译，本地不需要安装 Go）：

```bash
docker run --rm \
  -v /home/wzc11/projects/my-erp-system/backend:/app \
  -w /app \
  -e GOPROXY=https://goproxy.cn,direct \
  golang:1.24-alpine \
  sh -c "apk add --no-cache gcc musl-dev && CGO_ENABLED=1 GOOS=linux go build -ldflags='-s -w' -o pocketbase ."
```

**构建完成后验证**:

```bash
ls -lh backend/pocketbase
# 预期: ~25MB

file backend/pocketbase
# 预期: ELF 64-bit LSB executable, x86-64
```

> ⚠️ 此二进制文件是 Linux x86_64 架构，不能在本地 macOS/Windows 上直接运行，只在服务器上使用。

---

### 步骤 8: 本地打包项目 [代码]

**操作位置**: 本地开发机

**打包命令**（排除不需要的文件，**包含预编译的 pocketbase 二进制和前端 dist**）：

```bash
cd /home/wzc11/projects

tar -czf my-erp-system.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  --exclude='acme.json' \
  my-erp-system/
```

**排除说明**:

| 排除项 | 原因 |
|--------|------|
| `node_modules/` | 服务器上不需要安装依赖，上传浪费时间 |
| `.git/` | 部署不需要版本历史 |
| `*.db-shm` / `*.db-wal` | SQLite 临时文件，不应跨机器复制 |
| `acme.json` | root 权限文件无法读取，服务器上 Traefik 会自动重新签发证书 |

**包含说明**:

| 包含项 | 说明 |
|--------|------|
| `frontend/dist/` | 步骤 2 本地预构建的前端产物，服务器直接使用 |
| `backend/pocketbase` | 步骤 7 本地预编译的二进制文件（~25MB），服务器直接使用 |
| `backend/pb_data/` | 北京系统的完整数据库 + 上传文件 |
| `backend/Dockerfile` | 简化版，只做 `COPY pocketbase .`，不编译 |
| `frontend/Dockerfile` | 简化版，只做 `COPY dist/`，不编译 |
| `frontend/nginx.conf` | SPA 路由回退配置 |
| `docker-compose.yml` | 双系统部署配置 |
| `traefik/` | Traefik 配置文件（不含 acme.json） |

**打包后检查**:

```bash
ls -lh my-erp-system.tar.gz
# 预期大小约 20-30 MB
```

---

### 步骤 9: 上传压缩包到服务器 [手动]

**操作位置**: 本地开发机

```bash
scp /home/wzc11/projects/my-erp-system.tar.gz root@<服务器IP>:/root/
```

---

### 步骤 10: 服务器上解压并准备 [手动]

**操作位置**: SSH 登录服务器后

```bash
# 10.1 如果之前解压过旧版本，先清理
rm -rf /root/my-erp-system

# 10.2 解压
cd /root
tar -xzf my-erp-system.tar.gz
cd my-erp-system

# 10.3 确认预编译二进制文件存在
ls -la backend/pocketbase
# 应显示 ~25MB 的可执行文件

# 10.4 迁移北京系统数据目录
cd backend
mv pb_data pb_data_beijing

# 10.5 创建兰州系统数据目录（空目录，PocketBase 首次启动时自动初始化）
mkdir -p pb_data_lanzhou
chmod -R 777 pb_data_lanzhou

# 10.6 回到项目根目录，确认目录结构正确
cd /root/my-erp-system

ls -la backend/pocketbase           # ✅ 预编译二进制文件存在
ls -la backend/pb_data_beijing/     # ✅ 应能看到 data.db, storage/ 等
ls -la backend/pb_data_lanzhou/     # ✅ 应为空目录
ls -la docker-compose.yml           # ✅ 部署配置存在
ls -la traefik/                     # ✅ 应有 traefik.yml, dynamic.toml

# 10.7 创建 acme.json（Let's Encrypt 证书存储，Traefik 自动写入）
touch traefik/acme.json
chmod 600 traefik/acme.json
```

---

### 步骤 11: 启动 Docker 容器 [手动]

**操作位置**: 服务器 SSH 终端

```bash
cd /root/my-erp-system
docker compose up -d --build
```

**构建过程说明**：

前端和后端均在本地预构建，服务器上**无需任何编译**，只需要 COPY 文件到镜像：

| 顺序 | 服务 | 构建内容 | 预计耗时 |
|------|------|----------|----------|
| 1 | `frontend` | 仅 COPY `dist/` 到 Nginx 镜像（**无需 npm install / build**） | 2-3 秒 |
| 2 | `pocketbase-beijing` | 仅 COPY 预编译二进制到 Alpine 镜像 | 5-10 秒 |
| 3 | `pocketbase-lanzhou` | 同上（使用相同 Dockerfile，有 Docker 缓存） | 2-5 秒 |
| 4 | `traefik` | 直接拉取 `traefik:v2.9` 镜像 | 30-60 秒 |

> 总预计耗时：**约 1-2 分钟**（主要等待拉取基础镜像）。

**查看构建/启动日志**:

```bash
# 实时查看所有容器日志
docker compose logs -f

# 只看某个服务的日志
docker compose logs -f frontend
docker compose logs -f pocketbase-beijing
docker compose logs -f pocketbase-lanzhou
docker compose logs -f traefik
```

**检查容器状态**:

```bash
docker compose ps
```

**预期输出**（4 个容器全部 `Up`）:

```
NAME                    STATUS
erp-frontend            Up
erp-pocketbase-beijing  Up
erp-pocketbase-lanzhou  Up
erp-traefik             Up
```

**可能遇到的问题与解决方案**:

| 问题 | 排查命令 | 解决方案 |
|------|----------|----------|
| 前端容器 404 | `docker compose logs frontend` | 确认 `frontend/dist/` 目录存在且包含 `index.html` |
| PocketBase 报 `not found` 或 `permission denied` | `docker compose logs pocketbase-beijing` | 确认 `backend/pocketbase` 二进制存在且有执行权限：`chmod +x backend/pocketbase` |
| PocketBase 容器立即退出 | `docker compose logs pocketbase-beijing` | 检查数据目录权限：`chmod -R 777 ./backend/pb_data_beijing` |
| Let's Encrypt 证书签发失败 | `docker compose logs traefik` | 确认 DNS 已生效、80/443 端口开放、`acme.json` 权限 600 |
| Traefik 找不到路由 | `docker compose logs traefik` | 确认 `docker.sock` 已挂载：`ls /var/run/docker.sock` |

**重新构建（如果修改了代码后）**:

```bash
docker compose up -d --build
```

**完全清理后重建**:

```bash
docker compose down
docker compose up -d --build
```

---

### 步骤 12: PocketBase 管理员创建 + CORS 配置 [手动]

> 前提：步骤 11 容器全部启动成功，且 DNS 已生效。
> 验证方法：`docker compose ps` 显示 4 个容器全部 `Up`。

#### 12.1 北京系统

北京系统沿用已有数据（从本地 `pb_data` 迁移而来），管理员账号已存在。

1. 浏览器访问管理后台：`https://api-beijing.henghuacheng.cn/_/`
2. 使用已有管理员账号登录
3. 进入左侧菜单 **Settings** → 顶部 **Application**
4. 找到 **CORS (Cross-Origin Resource Sharing)** 区域
5. 在 **Allowed origins** 中添加：`https://erp.henghuacheng.cn`
6. 点击 **Save** 保存

#### 12.2 兰州系统

兰州系统是新实例，PocketBase 首次启动后数据库为空。

1. 浏览器访问管理后台：`https://api-lanzhou.henghuacheng.cn/_/`
2. 首次访问会提示 **创建超级管理员账号**，填写邮箱和密码后提交
3. 使用新创建的管理员账号登录
4. 进入左侧菜单 **Settings** → 顶部 **Application**
5. 找到 **CORS (Cross-Origin Resource Sharing)** 区域
6. 在 **Allowed origins** 中添加：`https://erp.henghuacheng.cn`
7. 点击 **Save** 保存

> **重要**:
> - 两个后端的 CORS 都允许同一个前端域名 `erp.henghuacheng.cn`
> - 不配置 CORS 会导致前端请求被浏览器拦截（浏览器控制台报 CORS 错误），所有 API 调用失败
> - 验证 CORS 是否生效：浏览器 F12 → Console，不应有 `Access-Control-Allow-Origin` 报错

---

### 步骤 13: 兰州系统集合创建 [手动]

> ⚠️ `pb_migrations/` 目录当前为空，没有自动迁移脚本。兰州系统的 PocketBase 数据库是空的，需要手动创建所有集合。

#### 13.1 创建集合

访问兰州系统管理后台 `https://api-lanzhou.henghuacheng.cn/_/`，进入左侧 **Collections** 页面，点击 **New collection**，按以下顺序逐个创建：

**创建顺序（按依赖关系排列，有 relation 的集合必须在被引用集合之后创建）**:

| # | 集合名 | 说明 | 关键字段注意点 |
|---|--------|------|---------------|
| 1 | `users` | 用户表 | PocketBase 内置，可能已自动创建，需确认有 `type` 字段（select: sales, purchasing, manager） |
| 2 | `customers` | 客户表 | 字段参照 `frontend/src/types/customer.ts` |
| 3 | `suppliers` | 供应商表 | 字段参照 `frontend/src/types/supplier.ts` |
| 4 | `sales_contracts` | 销售合同表 | 需 `creator_user` relation → users；`customer` relation → customers |
| 5 | `purchase_contracts` | 采购合同表 | 需 `creator_user` relation → users；`sales_contract` relation → sales_contracts；`supplier` relation → suppliers |
| 6 | `sales_shipments` | 销售发货表 | `contract` relation → sales_contracts |
| 7 | `purchase_arrivals` | 采购到货表 | `contract` relation → purchase_contracts |
| 8 | `sale_invoices` | 销售发票表 | `contract` relation → sales_contracts |
| 9 | `purchase_invoices` | 采购发票表 | `contract` relation → purchase_contracts；需 `is_verified` select（yes, no）；需 `manager_confirmed` select（pending, confirmed, rejected） |
| 10 | `sale_receipts` | 销售收款表 | `contract` relation → sales_contracts |
| 11 | `purchase_payments` | 采购付款表 | `contract` relation → purchase_contracts |
| 12 | `notifications` | 采购通知表 | 字段参照 `frontend/src/types/notification.ts` |
| 13 | `notifications_02` | 销售通知表 | 字段参照 `frontend/src/types/sales-notification.ts` |
| 14 | `service_contracts` | 服务大合同表 | 需 `creator_user` relation → users；`customer` relation → customers |
| 15 | `service_orders` | 佣金子订单表 | `service_contract` relation → service_contracts |
| 16 | `expense_records` | 资金支出表 | 需 `creator_user` relation → users |
| 17 | `bidding_records` | 投标记录表 | 需 `sales_contract` relation → sales_contracts（可选）；`bid_result` select（pending, won, lost） |

**每个集合的详细字段定义**:
- 参照本文档步骤 A-H 中各步骤的「PocketBase 后台创建集合」小节
- 参照 `frontend/src/types/` 下对应的 TypeScript 类型文件（类型字段名即 PocketBase 字段名）

#### 13.2 配置集合权限

每个集合创建后，点击集合名称进入详情，然后点击右上角 **齿轮图标（Settings）** → **API Rules** 标签页，配置规则：

**通用权限模板**（适用于大多数业务集合）:

| 规则类型 | 销售相关集合 | 采购相关集合 | users |
|----------|-------------|-------------|-------|
| List/View | `@request.auth.id != ""` | `@request.auth.id != ""` | `@request.auth.id != ""` |
| Create | `@request.auth.type = "sales"` | `@request.auth.type = "purchasing"` | 管理员仅通过后台创建 |
| Update | `@request.auth.id = creator` | `@request.auth.id = creator` | 仅管理员 |
| Delete | `@request.auth.id = creator` | `@request.auth.id = creator` | 仅管理员 |

**特殊集合权限**:

| 集合 | 说明 |
|------|------|
| `notifications` | 采购端通知，`List/View`: `recipient = @request.auth.id` |
| `notifications_02` | 销售端通知，`List/View`: `recipient = @request.auth.id` |
| `customers` | 销售 CRUD，采购/经理只读 |
| `suppliers` | 采购 CRUD，销售/经理只读 |

#### 13.3 创建测试用户

集合创建完成后，需要在兰州系统中创建测试用户：

1. 在管理后台左侧点击 **Collections** → 点击 **users** 集合
2. 点击右上角 **New record** 按钮
3. 创建以下测试账号:

| 角色 | email | password | type |
|------|-------|----------|------|
| 销售职员 | `sales@test.com` | `12345678` | `sales` |
| 采购职员 | `purchase@test.com` | `12345678` | `purchasing` |
| 经理 | `manager@test.com` | `12345678` | `manager` |

> **替代方案**: 如果有北京系统的 PocketBase 备份，可以通过管理后台的 Import 功能快速恢复集合结构和权限，无需手动创建。

---

### 步骤 14: 功能验证 [手动]

> 前提：步骤 11-13 全部完成。

**验证清单**:

| # | 验证项 | 操作方法 | 预期结果 |
|---|--------|----------|----------|
| 1 | HTTPS 证书 | 浏览器访问 `https://erp.henghuacheng.cn` | 地址栏显示小锁图标，无证书警告 |
| 2 | 系统选择页 | 访问 `erp.henghuacheng.cn` | 显示「北京系统」和「兰州系统」两个选项 |
| 3 | 北京系统登录 | 选择北京系统 → 用已有账号登录 | 能正常登录，看到已有数据（客户、合同等） |
| 4 | 兰州系统登录 | 退出 → 选择兰州系统 → 用 `sales@test.com` 登录 | 能正常登录，进入销售模块 |
| 5 | 系统切换验证 | 退出 → 切换到另一个系统 | API 请求指向正确的后端（浏览器 F12 → Network 面板可确认） |
| 6 | CRUD 操作 | 在任意模块创建/编辑/删除一条记录 | 操作成功，列表刷新后可见 |
| 7 | 文件上传 | 在任意表单中上传附件 | 上传成功，能下载查看 |
| 8 | 通知功能 | 销售创建合同后，采购端收到通知 | 采购通知列表出现新通知 |
| 9 | 经理模块 | 用经理账号登录，查看合同总览/进度/报表 | 页面正常加载，数据正确 |
| 10 | PWA | Chrome 浏览器地址栏 | 出现安装图标，可安装为桌面应用 |
| 11 | PB 管理后台 | 访问 `https://api-beijing.henghuacheng.cn/_/` 和 `https://api-lanzhou.henghuacheng.cn/_/` | 均能正常登录管理后台 |

---

### 文件修改清单汇总

| 文件 | 操作 | 步骤 | 类型 |
|------|------|------|------|
| `frontend/nginx.conf` | **新建** | 3 | [代码] ✅ 已完成 |
| `frontend/Dockerfile` | 简化为直接复制 dist | 4 | [代码] ✅ 已完成 |
| `docker-compose.yml` | 重写 | 5 | [代码] ✅ 已完成 |
| `traefik/dynamic.toml` | 重写 | 6 | [代码] ✅ 已完成 |
| `backend/pocketbase` | 本地预编译 | 7 | [代码] ✅ 已完成 |
| `backend/Dockerfile` | 简化为直接复制二进制 | 5 | [代码] ✅ 已完成 |

> `frontend/src/lib/pocketbase.ts` 无需修改，已实现运行时选择。
>
> **服务器上无需任何编译**：前端 dist 和后端二进制均在本地预构建，Docker 只做 COPY。

---

### 手动操作汇总

| # | 步骤 | 何时执行 | 说明 |
|---|------|----------|------|
| 1 | DNS 配置 | 最先执行 | ✅ 已完成 |
| 9 | 上传到服务器 | 打包后 | `scp` 上传 |
| 10 | 服务器解压+准备 | 上传后 | 解压 + 迁移 pb_data + 创建 acme.json |
| 11 | 启动容器 | 准备后 | `docker compose up -d --build`，约 1-2 分钟（前后端均无需编译） |
| 12 | PB 管理员 + CORS | 容器启动后 | 北京只配 CORS，兰州先创建管理员再配 CORS |
| 13 | 兰州建表 | CORS 配置后 | 手动创建 17 个集合 + 权限 + 测试用户 |
| 14 | 功能验证 | 全部完成后 | 按清单 11 项逐项验证 |

---

**文档结束**
