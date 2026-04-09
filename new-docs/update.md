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

### 步骤 F: 新建服务费业务表（销售端）

**类型**: 手动 + 代码修改  
**依赖**: 无  
**预计时间**: 4-6 小时

#### F.1 PocketBase 后台创建集合 [手动]

**集合名**: `service_contracts`

| 字段名 | 类型 | 说明 |
|--------|------|------|
| no | text | 合同编号 |
| customer | relation → customers | 客户 |
| product_name | text | 服务名称 |
| total_amount | number | 总金额 |
| unit_price | number | 单价 |
| receipted_amount | number | 已收金额 |
| receipt_percent | number | 收款比例 |
| debt_amount | number | 欠款金额 |
| debt_percent | number | 欠款比例 |
| invoiced_amount | number | 已开票金额 |
| invoice_percent | number | 开票比例 |
| uninvoiced_amount | number | 未开票金额 |
| uninvoiced_percent | number | 未开票比例 |
| sign_date | date | 签约日期 |
| status | select | executing / completed |
| remark | text | 备注 |
| attachments | file | 附件 |
| sales_manager | text | 销售负责人 |
| creator | text | 创建者 |
| creator_user | relation → users | 关联用户（步骤 B） |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限**: 与 `sales_contracts` 一致。

#### F.2 新建类型文件

**文件**: 新建 `frontend/src/types/service-contract.ts`

```typescript
export interface ServiceContract {
  id: string;
  no: string;
  customer: string;
  product_name: string;
  total_amount: number;
  unit_price: number;
  receipted_amount: number;
  receipt_percent: number;
  debt_amount: number;
  debt_percent: number;
  invoiced_amount: number;
  invoice_percent: number;
  uninvoiced_amount: number;
  uninvoiced_percent: number;
  sign_date: string;
  status: 'executing' | 'completed';
  remark?: string;
  attachments?: string | string[];
  sales_manager?: string;
  creator: string;
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    customer?: { id: string; name: string };
    creator_user?: { id: string; name: string };
  };
}

export interface ServiceContractFormData { ... }
export interface ServiceContractListParams { ... }
```

#### F.3 新建 API 文件

**文件**: 新建 `frontend/src/api/service-contract.ts`

参照 `frontend/src/api/sales-contract.ts` 模式，封装 `ServiceContractAPI`（list / getById / create / update / delete），操作 `service_contracts` 集合。

#### F.4 新建页面文件

按照现有销售模块的模式创建以下页面：

| 文件 | 说明 |
|------|------|
| `frontend/src/pages/sales/services/ServiceList.tsx` | 服务合同列表 |
| `frontend/src/pages/sales/services/ServiceForm.tsx` | 新建/编辑表单 |
| `frontend/src/pages/sales/services/ServiceDetail.tsx` | 服务合同详情 |

**列表页字段**: 合同编号、服务名称、客户、总金额、签约日期、状态

**表单字段**: 合同编号、客户、服务名称、单价、总金额、签约日期、备注、附件

#### F.5 添加路由

**文件**: `frontend/src/routes/index.tsx`

在 `/sales` children 中添加：

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

参照 `backend/hooks/sales_contract.go` 的模式：

- `OnRecordCreate`: 自动计算 `total_amount`，初始化各进度字段为 0，设置 `status = executing`，自动填充 `creator_user`
- `OnRecordAfterCreateSuccess`: 通知采购端有新服务合同
- 注册到 `main.go` 的 `RegisterHooks` 中

**文件**: `backend/hooks/main.go`

添加：

```go
RegisterServiceContractHooks(app)
```

#### 验证方法

1. PocketBase 后台确认 `service_contracts` 集合已创建
2. 销售端侧边栏显示「服务合同」菜单
3. 可以创建、编辑、删除、查看服务合同
4. 新建后自动计算总金额

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
| total_amount | number | 总金额 |
| paid_amount | number | 已付金额 |
| paid_percent | number | 付款比例 |
| pay_date | date | 付款日期 |
| method | text | 付款方式 |
| status | select | executing / completed |
| remark | text | 备注 |
| attachments | file | 附件 |
| purchasing_manager | text | 采购负责人 |
| creator | text | 创建者 |
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
  total_amount: number;
  paid_amount: number;
  paid_percent: number;
  pay_date: string;
  method?: string;
  status: 'executing' | 'completed';
  remark?: string;
  attachments?: string | string[];
  purchasing_manager?: string;
  creator: string;
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

**列表页字段**: 编号、支出类型、描述、总金额、付款日期、状态

**表单字段**: 编号、支出类型、描述、总金额、付款日期、付款方式、备注、附件

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

- `OnRecordCreate`: 自动填充 `creator_user`，设置 `status = executing`，初始化 `paid_amount = 0`
- 注册到 `main.go` 的 `RegisterHooks` 中

#### 验证方法

1. PocketBase 后台确认 `expense_records` 集合已创建
2. 采购端侧边栏显示「资金支出」菜单
3. 可以创建、编辑、删除、查看支出记录

---

### 步骤 H: 经理模块新增「其他业务」页面

**类型**: 代码修改  
**依赖**: 步骤 F 和 G 完成  
**预计时间**: 2-3 小时

#### H.1 新建页面

**文件**: 新建 `frontend/src/pages/manager/OtherBusinessPage.tsx`

页面结构：

```
OtherBusinessPage (/manager/other-business)
├── Tabs (服务合同 | 资金支出)
│   ├── Tab 1: 服务合同
│   │   └── Table（只读）
│   │       ├── 合同编号
│   │       ├── 服务名称
│   │       ├── 客户 (expand customer)
│   │       ├── 总金额
│   │       ├── 签约日期
│   │       ├── 状态
│   │       └── 操作（查看详情 Drawer）
│   └── Tab 2: 资金支出
│       └── Table（只读）
│           ├── 编号
│           ├── 支出类型
│           ├── 描述
│           ├── 总金额
│           ├── 付款日期
│           ├── 状态
│           └── 操作（查看详情 Drawer）
```

**数据获取**:

- 服务合同：直接调用 `pb.collection('service_contracts').getList()` （经理有读权限）
- 资金支出：直接调用 `pb.collection('expense_records').getList()`

**详情展示**: 点击「查看」按钮弹出 Drawer/Modal，使用 Descriptions 组件展示所有字段。

#### H.2 添加路由

**文件**: `frontend/src/routes/index.tsx`

1. 添加 lazy import：

```tsx
const OtherBusinessPage = lazy(() => import('@/pages/manager/OtherBusinessPage').then(m => ({ default: m.default })));
```

2. 在 `/manager` children 中添加：

```tsx
{ path: 'other-business', element: <OtherBusinessPage /> },
```

#### H.3 添加菜单项

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

F+G+H. 服务合同+资金支出+经理查看 (有依赖关系)
    ├── F.1-F.7 服务合同 (销售端)
    ├── G.1-G.7 资金支出 (采购端)
    └── H.1-H.3 经理端查看页面 (依赖 F 和 G)
```

---

## 修改文件总清单

### 后端 (Go)

| 文件 | 操作 | 步骤 |
|------|------|------|
| `backend/hooks/purchase_invoice.go` | 修改 | A |
| `backend/hooks/sales_contract.go` | 修改 | B |
| `backend/hooks/purchase_contract.go` | 修改 | B |
| `backend/hooks/main.go` | 修改 | F, G |
| `backend/hooks/service_contract.go` | **新建** | F |
| `backend/hooks/expense_record.go` | **新建** | G |

### 前端类型

| 文件 | 操作 | 步骤 |
|------|------|------|
| `frontend/src/types/purchase-contract.ts` | 修改 | A |
| `frontend/src/types/comparison.ts` | 修改 | A |
| `frontend/src/types/service-contract.ts` | **新建** | F |
| `frontend/src/types/expense-record.ts` | **新建** | G |

### 前端 API

| 文件 | 操作 | 步骤 |
|------|------|------|
| `frontend/src/api/notification.ts` | 修改 | D |
| `frontend/src/api/sales-notification.ts` | 修改 | D |
| `frontend/src/api/performance.ts` | **新建** | B |
| `frontend/src/api/service-contract.ts` | **新建** | F |
| `frontend/src/api/expense-record.ts` | **新建** | G |

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
| `frontend/src/pages/purchase/expenses/ExpenseList.tsx` | **新建** | G |
| `frontend/src/pages/purchase/expenses/ExpenseForm.tsx` | **新建** | G |
| `frontend/src/pages/purchase/expenses/ExpenseDetail.tsx` | **新建** | G |
| `frontend/src/pages/manager/OtherBusinessPage.tsx` | **新建** | H |

### 前端路由/布局/Store

| 文件 | 操作 | 步骤 |
|------|------|------|
| `frontend/src/routes/index.tsx` | 修改 | B, F, G, H |
| `frontend/src/layouts/MainLayout.tsx` | 修改 | B, E, F, G |
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

---

## 阶段六：部署配置 (系统拆分时执行)

---

### 步骤 20: Docker Compose 配置

**类型**: 手动操作 (根据实际部署环境)  
**依赖**: 前后端代码冻结  
**预计时间**: 2 小时

**架构方案**: 不同子域名

| 系统 | 前端域名 | API 域名 |
|------|----------|----------|
| 北京系统 | https://beijing.henghuacheng.cn | https://api-beijing.henghuacheng.cn |
| 兰州系统 | https://lanzhou.henghuacheng.cn | https://api-lanzhou.henghuacheng.cn |

**docker-compose.yml 结构**:

```yaml
version: '3.8'

services:
  frontend-beijing:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: erp-frontend-beijing
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.beijing.rule=Host(`beijing.henghuacheng.cn`)"
      - "traefik.http.routers.beijing.entrypoints=websecure"
      - "traefik.http.services.beijing-frontend.loadbalancer.server.port=80"

  pocketbase-beijing:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: erp-pocketbase-beijing
    command: ["./pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data_beijing"]
    volumes:
      - ./backend/pb_data_beijing:/pb_data_beijing
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.beijing-api.rule=Host(`api-beijing.henghuacheng.cn`)"
      - "traefik.http.routers.beijing-api.entrypoints=websecure"
      - "traefik.http.services.beijing-pocketbase.loadbalancer.server.port=8090"

  frontend-lanzhou:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: erp-frontend-lanzhou
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.lanzhou.rule=Host(`lanzhou.henghuacheng.cn`)"
      - "traefik.http.routers.lanzhou.entrypoints=websecure"
      - "traefik.http.services.lanzhou-frontend.loadbalancer.server.port=80"

  pocketbase-lanzhou:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: erp-pocketbase-lanzhou
    command: ["./pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data_lanzhou"]
    volumes:
      - ./backend/pb_data_lanzhou:/pb_data_lanzhou
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.lanzhou-api.rule=Host(`api-lanzhou.henghuacheng.cn`)"
      - "traefik.http.routers.lanzhou-api.entrypoints=websecure"
      - "traefik.http.services.lanzhou-pocketbase.loadbalancer.server.port=8090"

  traefik:
    image: traefik:v2.10
    container_name: erp-traefik
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik:/etc/traefik
```

---

### 步骤 21: Traefik 路由配置

**类型**: 手动操作 (根据实际部署环境)  
**依赖**: 步骤 20 完成  
**预计时间**: 1 小时

**文件路径**: `traefik/dynamic.toml`

```toml
# 北京系统路由
[http.routers.beijing]
rule = "Host(`beijing.henghuacheng.cn`)"
service = "beijing-frontend"
tls = true

[http.services.beijing-frontend]
[[http.services.beijing-frontend.loadBalancer.servers]]
url = "http://frontend-beijing:80"

[http.routers.beijing-api]
rule = "Host(`api-beijing.henghuacheng.cn`)"
service = "beijing-pocketbase"
tls = true

[http.services.beijing-pocketbase]
[[http.services.beijing-pocketbase.loadBalancer.servers]]
url = "http://pocketbase-beijing:8090"

# 兰州系统路由
[http.routers.lanzhou]
rule = "Host(`lanzhou.henghuacheng.cn`)"
service = "lanzhou-frontend"
tls = true

[http.services.lanzhou-frontend]
[[http.services.lanzhou-frontend.loadBalancer.servers]]
url = "http://frontend-lanzhou:80"

[http.routers.lanzhou-api]
rule = "Host(`api-lanzhou.henghuacheng.cn`)"
service = "lanzhou-pocketbase"
tls = true

[http.services.lanzhou-pocketbase]
[[http.services.lanzhou-pocketbase.loadBalancer.servers]]
url = "http://pocketbase-lanzhou:8090"
```

**CORS 配置**:

如果 PocketBase 后端未配置 CORS，需要在构建时检查并配置:
- 北京 API: 允许 beijing.henghuacheng.cn 跨域访问
- 兰州 API: 允许 lanzhou.henghuacheng.cn 跨域访问

---

**文档结束**
