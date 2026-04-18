# MY-ERP-SYSTEM 项目文档总汇

> 本文档将 `new-docs/` 目录下的所有 MD 文档整理汇总，方便一站式查阅。
> 生成日期：2026-04-16

---

## 目录

1. [项目概述与技术栈](#1-项目概述与技术栈)
2. [系统架构](#2-系统架构)
3. [实施指南（完整步骤 1-21）](#3-实施指南完整步骤-1-21)
4. [后续实施步骤 (A-I)](#4-后续实施步骤-a-i)
5. [附件系统修复（问题 1-13）](#5-附件系统修复问题-1-13)
6. [服务合同跨境支持改造](#6-服务合同跨境支持改造)
7. [部署指南](#7-部署指南)
8. [使用手册](#8-使用手册)

---

## 1. 项目概述与技术栈

### 1.1 系统简介

企业采购销售管理系统（MY-ERP-SYSTEM），支持北京和兰州两套独立业务系统，包含**销售模块**、**采购模块**和**经理模块**三大功能区域。

### 1.2 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript + Vite 7 |
| UI 组件库 | Ant Design 6 |
| 流程图 | ReactFlow (@xyflow/react) |
| 状态管理 | Zustand |
| 后端 | PocketBase (Go) |
| 数据库 | SQLite |
| 部署 | Docker Compose + Traefik（反向代理 + 自动 HTTPS） |

### 1.3 环境要求

| 环境 | 版本要求 |
|------|----------|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |
| Go | >= 1.24 |
| Docker | >= 24.0 |
| Docker Compose | >= 2.20 |

---

## 2. 系统架构

### 2.1 架构方案：统一前端入口 + 双后端

| 用途 | 域名 | 说明 |
|------|------|------|
| 前端（统一入口） | `erp.henghuacheng.cn` | 所有用户共用，运行时选择系统 |
| 北京系统 API | `api-beijing.henghuacheng.cn` | 北京 PocketBase 后端 |
| 兰州系统 API | `api-lanzhou.henghuacheng.cn` | 兰州 PocketBase 后端 |

**数据隔离**：两个 PocketBase 实例各自使用独立数据目录（`pb_data_beijing` / `pb_data_lanzhou`）。

### 2.2 用户访问流程

```
用户访问 erp.henghuacheng.cn
  → 进入系统选择页 (SystemSelect)
  → 选择「北京系统」或「兰州系统」
  → localStorage.setItem('erp_system', 'beijing'|'lanzhou')
  → 跳转登录页
  → 登录后前端自动连接对应系统的 API
```

### 2.3 核心数据集合

| 集合 | 说明 | 角色 |
|------|------|------|
| `users` | 用户表 | 内置，type 字段区分角色 |
| `customers` | 客户表 | 销售 CRUD |
| `suppliers` | 供应商表 | 采购 CRUD |
| `sales_contracts` | 销售合同 | 销售 CRUD |
| `purchase_contracts` | 采购合同 | 采购 CRUD |
| `sales_shipments` | 销售发货 | 销售 CRUD |
| `purchase_arrivals` | 采购到货 | 采购 CRUD |
| `sale_invoices` | 销售发票 | 销售 CRUD |
| `purchase_invoices` | 采购发票 | 采购 CRUD |
| `sale_receipts` | 销售收款 | 销售 CRUD |
| `purchase_payments` | 采购付款 | 采购 CRUD |
| `notifications` | 采购通知 | 系统 |
| `notifications_02` | 销售通知 | 系统 |
| `service_contracts` | 服务大合同 | 销售 CRUD |
| `service_orders` | 佣金子订单 | 销售 CRUD |
| `expense_records` | 资金支出 | 采购 CRUD |
| `bidding_records` | 投标记录 | 销售 CRUD |
| `settings` | 全局配置（汇率等） | 经理 |

---

## 3. 实施指南（完整步骤 1-21）

> 来源：`实施指南.md`

### 3.1 实施阶段总览

```
阶段一：数据库与后端 (基础层)
    ├── 步骤 1: PocketBase 后台添加 manager_confirmed 字段 [手动]
    ├── 步骤 2: PocketBase 后台配置字段权限 [手动]
    ├── 步骤 3: 修改后端 Hooks 添加通知逻辑

阶段二：前端基础设施
    ├── 步骤 4: 修改 pocketbase.ts 支持多系统
    ├── 步骤 5: 创建 SystemSelect.tsx 系统选择页面
    ├── 步骤 6: 改造 LoginPage 显示系统名称
    ├── 步骤 7: 调整路由配置
    ├── 步骤 8: 调整 MainLayout 菜单

阶段三：经理模块重构
    ├── 步骤 9: 创建 OverviewPage.tsx (合同总览)
    ├── 步骤 10: 创建合同详情独立页面 (ContractDetailPage)
    ├── 步骤 11: 创建 ProgressFlowPage.tsx (流程进度)
    ├── 步骤 12: 改造 ReportPage.tsx 支持 URL 参数
    ├── 步骤 13: 确认经理模块重构完成 [确认点]
    ├── 步骤 14: 删除废弃页面

阶段四：销售/采购页面改造
    ├── 步骤 15: 销售页面显示确认状态标签
    ├── 步骤 16: 采购页面显示确认状态标签

阶段五：UI/UX 与 PWA
    ├── 步骤 17: 新增页面样式统一
    ├── 步骤 18: PWA 配置
    ├── 步骤 19: 移动端适配

阶段六：部署配置
    ├── 步骤 20: Docker Compose 配置
    ├── 步骤 21: Traefik 路由配置
```

### 3.2 各步骤要点

#### 阶段一：数据库与后端

**步骤 1 — 添加 manager_confirmed 字段**：为 5 个集合（`sale_invoices`, `purchase_invoices`, `sale_receipts`, `purchase_payments`, `purchase_arrivals`）添加 `manager_confirmed` select 字段，可选值 `pending/approved/rejected`。

**步骤 2 — 配置权限**：销售/采购角色只读，经理角色可读写。

**步骤 3 — 后端 Hooks**：
- OnRecordCreate 时设置默认值 `pending`
- OnRecordUpdate 时（pending → approved）发送通知
- 通知存储规则：销售相关 → `notifications_02`，采购相关 → `notifications`

#### 阶段二：前端基础设施

**步骤 4 — pocketbase.ts 支持多系统**：根据 `localStorage` 中 `erp_system` 值切换 API 地址（北京/兰州）。

**步骤 5 — SystemSelect 页面**：居中显示两个系统选择卡片，选择后存入 localStorage 并跳转登录。

**步骤 6 — LoginPage 改造**：标题显示系统名称（"北京"或"兰州"）。

**步骤 7 — 路由调整**：添加 `/select-system` 路由，经理模块路由重构。

**步骤 8 — 菜单调整**：经理菜单改为 3 项（关联合同总览、流程进度、数据报表）。

#### 阶段三：经理模块重构

**步骤 9 — OverviewPage（合同总览）**：
- CSS Grid 左右双栏 50%/50% 布局
- 左侧销售合同卡片，右侧多采购合同汇总卡片
- 关联对齐（销售合同卡片高度 = 关联采购合同汇总高度）
- 筛选（客户/供应商/品名/时间段）、排序、批量勾选与导出
- 点击右侧汇总卡片弹出 Modal 显示各采购合同详情

**步骤 10 — ContractDetailPage（合同详情）**：
- 路由：`/manager/overview/contract/:id`
- 两标签页：销售合同信息 / 采购合同信息
- 每个标签页含基本信息 + 3 个子表（发货/发票/收付款）
- 利润分析模块（营业利润、税额、净利润）
- 附件管理内嵌在各表格 expandable 行中

**步骤 11 — ProgressFlowPage（流程进度）**：
- ReactFlow 流程图
- 8 种节点类型（销售合同/采购合同/发货/到货/发票/收付款等）
- 待确认节点红色虚线边框
- 下拉选择合同 + 筛选待确认 + 点击确认

**步骤 12 — ReportPage 改造**：支持 URL 参数从总览页跳转筛选。

**步骤 14 — 删除废弃页面**：删除 ProgressPage、ProgressDetailPage、ComparisonPage。

#### 阶段四：销售/采购页面改造

**步骤 15-16**：销售/采购发票、收付款、发货列表中添加确认状态标签（待确认/已确认/已驳回）。

#### 阶段五：UI/UX 与 PWA

**步骤 17 — 样式统一**：按钮圆角 8px、卡片圆角 12px、输入框圆角 8px 等。

**步骤 18 — PWA 配置**：安装 vite-plugin-pwa、创建 manifest.json、配置 Service Worker 缓存策略。

**步骤 19 — 移动端适配**：CSS 媒体查询（<767px 隐藏侧边栏、表格横向滚动等）。

#### 阶段六：部署配置

**步骤 20-21**：Docker Compose 双系统部署 + Traefik 路由配置。详见下方部署指南。

---

## 4. 后续实施步骤 (A-I)

> 来源：`update.md`

### 实施顺序建议

```
A. 采购发票「是否验票」字段 (独立)
B. 经理模块业绩统计 (独立)
C. 流程可视化待确认数量标记 (独立)
D+E. 通知系统优化 (删除 + 已读实时更新)
F+G+H+I. 服务合同 + 资金支出 + 投标 + 经理查看 (有依赖)
```

### 4.1 步骤 A：采购发票添加「是否验票」字段

- PocketBase `purchase_invoices` 集合新增 `is_verified` select 字段 (yes/no)
- 后端 hooks 设置默认值 `no`
- 采购合同详情页、经理合同详情页、流程可视化页面均显示验票状态

### 4.2 步骤 B：经理模块新增业绩统计页面

- `sales_contracts` / `purchase_contracts` 集合新增 `creator_user` relation → users
- 后端 hooks 自动填充 `creator_user`
- 新建 `api/performance.ts` + `pages/manager/PerformancePage.tsx`
- 路由：`/manager/performance`
- 三个标签页：销售业绩 / 采购业绩 / 佣金业绩
- 按业务员统计合同数量、总金额、已收款/已付款金额

### 4.3 步骤 C：流程可视化待确认数量红色标记

- ProgressFlowPage 下拉选项中用红色 Badge 显示待确认数量
- 侧边栏「流程进度」菜单项也显示红色数字

### 4.4 步骤 D：通知中心添加删除功能

- API 层添加 `delete` 方法
- 采购/销售通知列表添加删除按钮（带确认框）

### 4.5 步骤 E：通知已读状态实时更新

- 新建 `stores/notification.ts`（Zustand 全局 store）
- MainLayout 使用全局 store 管理 unreadCount
- 通知列表标记已读/删除后立即更新侧边栏红色标记

### 4.6 步骤 F：新建佣金服务费业务（销售端）

- PocketBase 创建 `service_contracts`（大合同）和 `service_orders`（子订单）集合
- 大合同 + 子订单结构（一个客户一个合同，多个子订单）
- 新建类型文件、API 文件、4 个页面文件
- 路由：`/sales/services`、`/sales/services/:id`
- 后端 hooks：自动填充 `creator_user`

### 4.7 步骤 G：新建资金流出表（采购端）

- PocketBase 创建 `expense_records` 集合
- 新建类型文件、API 文件、3 个页面文件
- 路由：`/purchase/expenses`、`/purchase/expenses/:id`

### 4.8 步骤 H：新建投标管理（销售端）

- PocketBase 创建 `bidding_records` 集合
- 新建类型文件、API 文件、3 个页面文件
- 路由：`/sales/bidding`、`/sales/bidding/:id`
- 投标记录可关联销售合同
- 销售合同详情页底部显示关联投标记录表格

### 4.9 步骤 I：经理模块新增「其他业务」页面

- 依赖步骤 F、G、H 完成
- 新建 `pages/manager/OtherBusinessPage.tsx`
- 三个标签页：服务合同 / 资金支出 / 投标记录（均为只读表格）
- 路由：`/manager/other-business`

### 4.10 修改文件总清单

| 类别 | 新建文件 | 修改文件 |
|------|----------|----------|
| 后端 | `service_contract.go`, `expense_record.go`, `bidding_record.go` | `purchase_invoice.go`, `sales_contract.go`, `purchase_contract.go`, `main.go` |
| 前端类型 | `service-contract.ts`, `expense-record.ts`, `bidding-record.ts` | `purchase-contract.ts`, `comparison.ts` |
| 前端 API | `performance.ts`, `service-contract.ts`, `expense-record.ts`, `bidding-record.ts` | `notification.ts`, `sales-notification.ts` |
| 前端页面 | `PerformancePage`, `ServiceList/Form/Detail/OrderForm`, `ExpenseList/Form/Detail`, `BiddingList/Form/Detail`, `OtherBusinessPage` | `ContractDetail`(采购), `ContractDetailPage`, `ProgressFlowPage`, `NotificationList`(采购/销售) |
| 前端其他 | `stores/notification.ts` | `routes/index.tsx`, `layouts/MainLayout.tsx` |

---

## 5. 附件系统修复（问题 1-13）

> 来源：`fix-attachments.md`
> 修复日期：2026-04-12

### 5.1 已完成修复清单

| # | 问题 | 修复方案 | 涉及文件数 |
|---|------|----------|-----------|
| 1 | iPad 上传附件失败（autoCancellation） | `pb.autoCancellation = false` | 1 |
| 2 | 附件链接域名错误（硬编码 `api.henghuacheng.cn`） | 改为 `${pb.baseUrl}/api/files/...` | 12 |
| 3 | 附件字段 single→multiple 适配 | 类型简化为 `string[]`，删除 single-string 分支 | 15 |
| 4 | 销售合同详情页发货表格多余列（运费/运费状态/发票状态） | 删除三列 | 1 |
| 5 | 销售合同详情页收款日期字段名错误 | `receipt_date` → `receive_date` | 1 |
| 6 | 采购合同详情页子信息表格字段不匹配 | 重写三个表格列定义（到货/收票/付款） | 2 |
| 7 | 合同详情页子记录表格缺少点击跳转 | 添加操作列（查看按钮） | 2 |
| 8 | 投标记录查看按钮样式不统一 | `Button type="link"` → `Button size="small"` | 1 |
| 9 | 通知中心添加快捷跳转创建关联合同按钮 | URL search params 传递预填充参数 | 4 |
| 10 | 采购模块不应显示销售合同单价和总金额 | 删除单价/金额相关 Descriptions.Item | 2 |
| 11 | 经理模块进度流程图改进 | 侧边栏红点 + 子节点连线 | 3 |
| 12 | 销售合同支持「不含税」单价填写模式 | 新增 `is_price_excluding_tax` 字段 + 利润公式适配 | 16 |
| 13 | 销售/采购合同支持跨境美元交易 | 新增 `is_cross_border` 字段 + 双币种显示 + 汇率工具 | 32 |

### 5.2 关键新增功能

**不含税单价模式（问题 12）**：
- 销售合同新增 `is_price_excluding_tax` 布尔字段
- 前端表单增加「按不含税单价填写」开关
- 经理利润分析中含税/不含税金额自动换算

**跨境美元交易（问题 13）**：
- 销售/采购合同新增 `is_cross_border` 布尔字段
- 新建 `lib/exchange-rate.ts` 汇率工具（从 `settings` 集合读取）
- 所有金额展示页面同时显示 USD 和 CNY
- 利润计算统一换算为 CNY
- 涉及 32 个文件的修改

---

## 6. 服务合同跨境支持改造

> 来源：`update-service-contract.md`
> 创建日期：2026-04-15
> 状态：待实施

### 6.1 改造范围

| 改动 | 说明 |
|------|------|
| 大合同新增 `is_cross_border` 字段 | 区分国内/跨境佣金 |
| 跨境子订单新增字段 | 服务费比例、出港时间、客户付款时间、银行收汇时间、实际收款金额(USD) |
| 跨境子订单标签改名 | "收款金额RMB"→"兑换人民币金额"、"收款日期RMB"→"兑换日期"、"开票时间"→"佣金发票提供时间" |
| 非跨境子订单精简字段 | 只显示订单号、负责人、数量、单价、总金额、服务费比例、开票时间、收款时间、收款金额 |

### 6.2 数据模型变更

**`service_contracts` 新增**：`is_cross_border` (Bool, 默认 false)

**`service_orders` 新增 9 个字段**：`service_fee_rate`, `departure_date`, `customer_payment_date`, `bank_settlement_date`, `actual_receipt_amount_usd`, `total_amount`, `invoice_time`, `payment_date`, `payment_amount`

### 6.3 前端修改要点

- **ServiceOrderForm**：新增 `isCrossBorder` prop，根据值条件渲染不同字段组
- **ServiceDetail**：子订单表格列根据 `is_cross_border` 动态切换
- **ServiceList**：列表新增「类型」列（跨境/国内 Tag）
- **OtherBusinessPage**：经理模块适配（列表加类型列、详情 Modal 加跨境标签、子订单表格列动态切换）

### 6.4 修改文件清单

| 类别 | 文件 | 操作 |
|------|------|------|
| 后端 | `backend/hooks/service_contract.go` | 修改（新增 OnRecordCreate hook） |
| 类型 | `frontend/src/types/service-contract.ts` | 修改（新增字段） |
| API | `frontend/src/api/service-contract.ts` | 修改（新增字段提交） |
| 页面 | `ServiceForm.tsx`, `ServiceOrderForm.tsx`, `ServiceDetail.tsx`, `ServiceList.tsx`, `OtherBusinessPage.tsx` | 修改 |

### 6.5 实施顺序

```
1. PocketBase 后台操作 [手动]
2. 后端 hooks（service_contract.go）
3. 前端类型（service-contract.ts）
4. 前端 API（service-contract.ts）
5. 前端页面（ServiceForm → ServiceOrderForm → ServiceDetail → ServiceList → OtherBusinessPage）
```

---

## 7. 部署指南

> 来源：`deploy-guide.md` + `update.md` 阶段六

### 7.1 前置条件

- 本地已完成 `npm run build`（前端）和 `go build`（后端）
- 服务器地址：`182.92.78.227`
- 服务器项目目录：`/root/my-erp-system`

### 7.2 快速部署步骤

```bash
# 1. 上传前端
ssh root@182.92.78.227 "rm -rf /root/my-erp-system/frontend/dist"
scp -r ~/projects/my-erp-system/frontend/dist root@182.92.78.227:/root/my-erp-system/frontend/dist

# 2. 上传后端
scp ~/projects/my-erp-system/backend/pocketbase root@182.92.78.227:/root/my-erp-system/backend/pocketbase

# 3. 重建容器
ssh root@182.92.78.227 "cd /root/my-erp-system && docker compose build --no-cache && docker compose up -d"
```

只改前端或只改后端时可单独重建对应容器。

### 7.3 首次部署详细步骤

| 步骤 | 类型 | 说明 |
|------|------|------|
| 1. DNS 配置 | 手动 | 3 条 A 记录（erp, api-beijing, api-lanzhou） |
| 2. 前端构建 | 代码 | `npm run build` |
| 3. nginx.conf | 代码 | SPA 路由回退 |
| 4. Dockerfile 简化 | 代码 | 只 COPY dist/ 和预编译二进制 |
| 5. docker-compose.yml | 代码 | 1 前端 + 2 PocketBase + Traefik |
| 6. dynamic.toml | 代码 | HTTP→HTTPS 重定向 |
| 7. 后端编译 | 代码 | 本地 Docker 编译 Go |
| 8. 打包 | 代码 | tar 打包（排除 node_modules/.git） |
| 9. 上传 | 手动 | scp 到服务器 |
| 10. 解压准备 | 手动 | 迁移 pb_data、创建 acme.json |
| 11. 启动容器 | 手动 | docker compose up -d --build（约 1-2 分钟） |
| 12. PB 管理员 + CORS | 手动 | 两端分别配置 CORS 允许 `erp.henghuacheng.cn` |
| 13. 兰州建表 | 手动 | 17 个集合 + 权限 + 测试用户 |
| 14. 功能验证 | 手动 | 11 项验证清单 |

### 7.4 常见问题

| 问题 | 解决方案 |
|------|----------|
| 上传后页面没变化 | 必须 `--no-cache` 构建；清除 PWA Service Worker 缓存 |
| scp 产生嵌套目录 | 先 `rm -rf` 删除旧目录再上传 |
| 后端更新影响数据？ | 不会，数据存储在独立的 pb_data 目录 |
| Let's Encrypt 证书签发失败 | 确认 DNS 生效、80/443 开放、acme.json 权限 600 |

### 7.5 PocketBase 后台新增字段

部署后如新增字段，需在北京和兰州两个系统的 PocketBase 后台分别操作：
1. 访问 `https://api-beijing.henghuacheng.cn/_/` 和 `https://api-lanzhou.henghuacheng.cn/_/`
2. 进入对应集合 → Edit → New field 添加字段
3. 旧记录会自动获得默认值（hooks 中设置的）

---

## 8. 使用手册

> 来源：`user-guide.md`

### 8.1 登录与系统选择

1. 首次打开进入系统选择页面，选择**北京系统**或**兰州系统**
2. 使用分配的账号密码登录，根据角色自动进入对应模块

### 8.2 销售模块

| 功能 | 路径 | 说明 |
|------|------|------|
| 客户管理 | 侧边栏 → 客户管理 | 新建/查看客户及其关联合同 |
| 销售合同 | 侧边栏 → 销售合同 | 新建合同（支持不含税/跨境模式），查看详情（发货/发票/收款进度） |
| 运输（发货） | 侧边栏 → 运输 | 新建发货记录，自动更新发货进度 |
| 发票 | 侧边栏 → 发票 | 新建发票，提交后待经理确认 |
| 收款 | 侧边栏 → 收款 | 新建收款，提交后待经理确认 |
| 服务合同 | 侧边栏 → 服务合同 | 管理佣金服务合同（大合同+子订单） |
| 投标管理 | 侧边栏 → 投标管理 | 记录投标信息（标书费、保证金、中标结果） |
| 通知中心 | 侧边栏 → 通知中心 | 接收采购合同创建/经理确认/汇率变更通知 |
| 汇率设置 | 侧边栏 → 汇率设置 | 查看汇率（修改需经理操作） |

### 8.3 采购模块

| 功能 | 路径 | 说明 |
|------|------|------|
| 供应商管理 | 侧边栏 → 供应商管理 | 新建/查看供应商及其关联合同 |
| 采购合同 | 侧边栏 → 采购合同 | 从通知创建（推荐）或手动创建，关联销售合同 |
| 运输（到货） | 侧边栏 → 运输 | 新建到货记录，待经理确认 |
| 收票 | 侧边栏 → 收票 | 新增收票记录，待经理确认 |
| 付款 | 侧边栏 → 付款 | 新增付款记录，待经理确认 |
| 资金支出 | 侧边栏 → 资金支出 | 记录非合同资金支出 |
| 通知中心 | 侧边栏 → 通知中心 | 接收销售合同创建/经理确认/汇率变更通知 |
| 汇率设置 | 侧边栏 → 汇率设置 | 查看汇率 |

### 8.4 经理模块

| 功能 | 路径 | 说明 |
|------|------|------|
| 关联合同总览 | 侧边栏 → 关联合同总览 | 左右双栏查看销售/采购合同关联关系，支持筛选、勾选、导出 |
| 合同详情页 | 总览页点击卡片进入 | 完整合同信息 + 子表明细 + 附件管理 + 利润分析 |
| 流程进度 | 侧边栏 → 流程进度 | 流程图展示，待确认节点红色标注，点击确认/驳回 |
| 数据报表 | 侧边栏 → 数据报表 | 按时间段查看利润报表，支持 Excel 导出 |
| 业绩统计 | 侧边栏 → 业绩统计 | 按业务员统计合同数量和金额 |
| 其他业务 | 侧边栏 → 其他业务 | 查看服务合同、投标记录、资金支出 |
| 汇率设置 | 侧边栏 → 汇率设置 | 查看/修改美元汇率，保存后自动通知所有人员 |

### 8.5 利润分析

**计算公式**：
- 营业利润 = 销售金额 - 采购金额 - 运费 - 杂费
- 税额 = (销售金额 - 采购金额) × 18.81%
- 净利润 = 营业利润 - 税额

**跨境合同双币种分析**：当销售和采购合同均为跨境时，利润分析显示「人民币分析」和「美元分析」两个标签页。

---

**文档结束**
