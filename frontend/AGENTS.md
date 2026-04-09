# AGENTS.md - 企业采购销售管理系统

## 项目概述

本项目是一个企业采购销售管理系统，采用 React + Vite + TypeScript 技术栈，后端使用 PocketBase。系统实现采购和销售业务流程的数字化管理，包括客户/供应商管理、合同管理、发货/到货跟踪、发票管理、收款/付款管理等功能。

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18+ |
| 构建工具 | Vite |
| 开发语言 | TypeScript |
| UI组件库 | Ant Design 或 Material-UI |
| 后端服务 | PocketBase |
| API | RESTful API |
| 状态管理 | React Context / Zustand |

## 开发环境

- 前端开发服务器：`http://localhost:5173`（Vite 默认）
- 后端服务器：`http://127.0.0.1:8090`
- Base URL: `http://127.0.0.1:8090/api/`
- 认证方式: Bearer Token（JWT）

## 测试账号

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 销售职员 | sales@test.com | 12345678 |
| 采购职员 | purchase@test.com | 12345678 |
| 经理 | manager@test.com | 12345678 |

---

## 构建与测试命令

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

### 生产构建
```bash
npm run build
```

### 类型检查
```bash
npm run typecheck
# 或
npx tsc --noEmit
```

### 代码检查
```bash
npm run lint
```

### 运行单个测试
```bash
# Vitest
npm run test -- --run src/__tests__/specific-test.spec.ts

# Jest
npm test -- --testPathPattern="specific-test"
```

### 测试覆盖
```bash
npm run test:coverage
```

---

## 代码风格指南

### 目录结构
```
src/
├── api/              # API 请求封装
├── assets/           # 静态资源
├── components/       # 公共组件
│   ├── common/       # 通用组件
│   └── forms/        # 表单组件
├── layouts/          # 布局组件
├── pages/            # 页面组件
│   ├── sales/        # 销售模块
│   ├── purchase/     # 采购模块
│   └── manager/     # 经理模块
├── routes/          # 路由配置
├── stores/           # 状态管理
├── types/            # TypeScript 类型定义
├── utils/           # 工具函数
└── App.tsx
```

### 导入顺序
1. React/React Router 导入
2. 第三方库导入
3. 项目内部导入（components, pages, api, utils, types）
4. 相对路径导入
```typescript
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Table, Form } from 'antd';
import { CustomerAPI } from '@/api/customer';
import { useAuthStore } from '@/stores/auth';
import type { Customer } from '@/types';
import { formatDate } from '@/utils/date';
```

### 命名约定

| 类型 | 规则 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `CustomerList.tsx`, `SalesContract.vue` |
| 工具函数 | camelCase | `formatDate.ts`, `validateForm.ts` |
| 类型/接口 | PascalCase | `Customer`, `SalesContract` |
| 常量 | UPPER_SNAKE_CASE | `MAX_UPLOAD_SIZE`, `API_BASE_URL` |
| 组件名 | PascalCase | `CustomerList`, `SalesContractForm` |
| 变量/函数 | camelCase | `customerList`, `handleSubmit` |

### TypeScript 规范

- 始终使用显式类型标注，避免 `any`
- 优先使用接口定义数据模型
- 使用类型别名简化复杂类型
```typescript
// Good
interface Customer {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
}

type CustomerList = Customer[];

// Avoid
const customer: any = { ... };
```

### 组件规范

- 使用函数式组件 + Hooks
- 组件文件不超过 300 行，复杂组件拆分
- Props 使用接口定义，添加 JSDoc 注释
- 条件渲染使用 && 或三元运算符，避免嵌套
```typescript
interface CustomerFormProps {
  visible: boolean;
  customer?: Customer;
  onSubmit: (data: Customer) => void;
  onCancel: () => void;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({
  visible,
  customer,
  onSubmit,
  onCancel,
}) => {
  // ...
};
```

### 错误处理

- API 错误使用 try-catch 捕获
- 使用统一的错误提示组件
- 关键操作添加确认对话框
```typescript
try {
  await CustomerAPI.create(data);
  message.success('创建成功');
} catch (error) {
  message.error('创建失败，请重试');
  console.error('Create customer error:', error);
}
```

### 状态管理

- 使用 Zustand 或 React Context 管理全局状态
- 页面局部状态使用 useState
- 服务端数据使用 React Query / SWR

---

## API 规范

### PocketBase 集合

| 集合名 | 说明 |
|--------|------|
| users | 用户表 |
| customers | 客户表 |
| suppliers | 供应商表 |
| sales_contracts | 销售合同表 |
| purchase_contracts | 采购合同表 |
| sales_shipments | 销售发货批次表 |
| purchase_arrivals | 采购到货批次表 |
| sale_invoices | 销售发票表 |
| purchase_invoices | 采购发票表 |
| sale_receipts | 销售收款表 |
| purchase_payments | 采购付款表 |
| notifications | 通知表 |

### API 调用封装模式
```typescript
// api/customer.ts
import { pb } from '@/lib/pocketbase';

export const CustomerAPI = {
  list: (params?: QueryParams) => 
    pb.collection('customers').getList<Customer>(params),
  
  create: (data: CreateCustomerDTO) => 
    pb.collection('customers').create(data),
  
  update: (id: string, data: UpdateCustomerDTO) => 
    pb.collection('customers').update(id, data),
  
  delete: (id: string) => 
    pb.collection('customers').delete(id),
};
```

---

## 权限矩阵

| 功能/角色 | 销售 (sales) | 采购 (purchasing) | 经理 (manager) |
|----------|-------------|------------------|----------------|
| customers | CRUD 本人创建 | 仅读取 | 仅读取 |
| suppliers | 仅读取 | CRUD 本人创建 | 仅读取 |
| sales_contracts | CRUD 本人创建 | 仅读取 | 仅读取 |
| purchase_contracts | 仅读取 | CRUD 本人创建 | 仅读取 |
| 通知 | 读取本人 | 读取本人 | 读取本人 |

---

## 开发步骤

按以下顺序开发功能：

| 步骤 | 分支 | 功能 |
|------|------|------|
| 01 | feature/init-project | 项目初始化 |
| 02 | feature/pocketbase-sdk | PocketBase SDK 集成 |
| 03 | feature/router-auth | 路由与认证基础 |
| 04 | feature/login-page | 登录页面 |
| 05 | feature-layout | 系统布局框架 |
| 06 | feature-sales-customer | 销售-客户管理 |
| 07 | feature-sales-contract | 销售-合同管理 |
| 08 | feature-sales-shipment | 销售-发货管理 |
| 09 | feature-sales-invoice | 销售-发票管理 |
| 10 | feature-sales-receipt | 销售-收款管理 |
| 11 | feature-sales-progress | 销售-进度跟踪 |
| 12 | feature-purchase-supplier | 采购-供应商管理 |
| 13 | feature-purchase-contract | 采购-合同管理 |
| 14 | feature-purchase-arrival | 采购-到货管理 |
| 15 | feature-purchase-invoice | 采购-发票管理 |
| 16 | feature-purchase-payment | 采购-付款管理 |
| 17 | feature-purchase-progress | 采购-进度跟踪 |
| 18 | feature-manager-dashboard | 经理-总览仪表盘 |
| 19 | feature-manager-progress | 经理-进度跟踪 |
| 20 | feature-manager-comparison | 经理-关联对比 |
| 21 | feature-manager-report | 经理-数据报表 |
| 22 | feature-manager-history | 经理-历史记录 |
| 23 | feature-notification | 通知中心 |
| 24 | feature-bugfix | Bug修复与优化 |

---

## 核心业务流程

```
销售流程：客户管理 → 签订销售合同 → 分批发货 → 开具发票 → 登记收款
                                    ↓
                                系统通知采购

采购流程：接收通知 → 查看销售合同 → 关联采购 → 分批到货 → 收票 → 付款

经理流程：合同总览 → 进度跟踪 → 关联对比 → 数据报表
```

---

## 注意事项

1. 后端依赖 PocketBase 服务，确保后端正常运行
2. 采购合同必须关联销售合同
3. 所有金额字段使用数字类型，保留两位小数
4. 日期字段使用 ISO 8601 格式
5. 文件上传使用 PocketBase 的文件上传功能
6. 合同状态变更自动触发通知
