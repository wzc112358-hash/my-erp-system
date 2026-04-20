# 附件上传修改无效问题修复（update3）

> 创建日期：2026-04-19
> 问题来源：员工反馈所有模块的附件上传后无法修改（删除/替换无效）

---

## 一、问题根因

### 1.1 Form 组件中的附件提取逻辑缺陷

所有表单组件（如 ShipmentForm, ReceiptForm, ContractForm 等）在提交时，使用如下逻辑提取附件：

```typescript
const attachments = fileList?.map((f) => f.originFileObj).filter(Boolean) as File[] || [];
```

**问题**：`originFileObj` 只存在于新上传的本地文件。对于已上传的文件（从服务器加载的初始值），其结构为 `{uid, name, status: 'done', url: 'filename.pdf'}`，**没有 `originFileObj`**。这导致：

| 场景 | 结果 | 问题 |
|------|------|------|
| 编辑记录，不修改附件 | `attachments = []` | API 不传递 `attachments` 字段 → PocketBase 保留旧文件 ✅ |
| 编辑记录，**添加**新附件 | `attachments = [新File]` | **旧文件丢失** ❌ |
| 编辑记录，**删除**所有附件 | `attachments = []` | API 不传递 `attachments` 字段 → **旧文件仍然保留** ❌ |

### 1.2 API 层 update 方法的处理缺陷

API 层的 update 方法使用如下逻辑：

```typescript
if (data.attachments && data.attachments.length > 0) {
    data.attachments.forEach((file) => {
        formData.append('attachments', file);
    });
}
```

**问题**：当 `attachments` 为空数组时（用户删除所有附件），条件不成立，不传递 `attachments` 字段，PocketBase 默认保留所有旧文件。

### 1.3 类型定义缺陷

类型定义中 `attachments` 字段类型为 `File[]`，不支持已有文件名（`string`），导致无法正确传递混合列表。

---

## 二、修复方案

### 2.1 通用工具函数

创建 `frontend/src/utils/file.ts`：

```typescript
export const extractAttachments = (fileList: any[]): (File | string)[] => {
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

### 2.2 类型定义修改

将所有 `attachments: File[]` 改为 `attachments: (File | string)[]`。

### 2.3 API 层 update 方法修改

统一修改为：

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

### 2.4 Form 组件修改

所有 Form 组件的 `handleFinish` 中，将：
```typescript
const attachments = fileList?.map((f) => f.originFileObj).filter(Boolean) as File[] || [];
```
改为：
```typescript
import { extractAttachments } from '@/utils/file';
const attachments = extractAttachments(fileList);
```

### 2.5 经理详情页附件上传修改

ContractDetailPage.tsx 中使用 `customRequest` 上传附件，当前逻辑每次只追加新文件，无法删除。需要：
- 保留现有上传功能
- 添加删除已有附件的功能（显示已有附件列表 + 删除按钮）

---

## 三、修改文件清单

### 3.1 新增文件

| 文件 | 说明 |
|------|------|
| `frontend/src/utils/file.ts` | 通用附件提取工具函数 |

### 3.2 类型定义修改

| 文件 | 字段 |
|------|------|
| `frontend/src/types/sales-contract.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/sales-shipment.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/sale-invoice.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/sale-receipt.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/bidding-record.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/service-contract.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/purchase-contract.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/purchase-arrival.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/purchase-invoice.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/purchase-payment.ts` | `attachments: (File \| string)[]` |
| `frontend/src/types/expense-record.ts` | `attachments: (File \| string)[]` |

### 3.3 API 层修改

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

### 3.4 Form 组件修改

| 文件 | 组件 |
|------|------|
| `frontend/src/pages/sales/contracts/ContractForm.tsx` | handleFinish |
| `frontend/src/pages/sales/shipments/ShipmentForm.tsx` | handleFinish |
| `frontend/src/pages/sales/invoices/InvoiceForm.tsx` | handleFinish |
| `frontend/src/pages/sales/receipts/ReceiptForm.tsx` | handleFinish |
| `frontend/src/pages/sales/bidding/BiddingForm.tsx` | handleFinish |
| `frontend/src/pages/sales/services/ServiceForm.tsx` | handleFinish |
| `frontend/src/pages/sales/services/ServiceOrderForm.tsx` | handleFinish |
| `frontend/src/pages/purchase/contracts/ContractForm.tsx` | handleFinish |
| `frontend/src/pages/purchase/arrivals/ArrivalForm.tsx` | handleFinish |
| `frontend/src/pages/purchase/invoices/InvoiceForm.tsx` | handleFinish |
| `frontend/src/pages/purchase/payments/PaymentForm.tsx` | handleFinish |
| `frontend/src/pages/purchase/expenses/ExpenseForm.tsx` | handleFinish |

### 3.5 经理详情页修改

| 文件 | 修改内容 |
|------|---------|
| `frontend/src/pages/manager/ContractDetailPage.tsx` | 添加已有附件删除功能 |

---

## 四、验证方法

1. **销售合同**：编辑已有销售合同 → 添加新附件 → 保存 → 确认旧附件和新附件都在
2. **销售合同**：编辑已有销售合同 → 删除所有附件 → 保存 → 确认附件为空
3. **销售发货**：编辑发货记录 → 替换附件 → 保存 → 确认附件已替换
4. **采购付款**：编辑付款记录 → 删除附件 → 保存 → 确认附件已删除
5. **经理详情页**：点击子记录附件上传 → 上传新附件 → 确认追加成功 → 删除已有附件 → 确认删除成功
