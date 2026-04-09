# 企业采购销售管理系统 (MY-ERP-SYSTEM)

## 项目概述

企业采购销售管理系统是一个完整的 ERP 系统，实现了采购和销售业务流程的数字化管理。系统支持多角色权限控制，包括销售职员、采购职员和经理三种角色，提供客户/供应商管理、合同管理、物流跟踪、发票管理、收款付款管理、关联对比分析和数据报表等功能。

## 技术架构

### 前端技术栈
| 技术 | 说明 |
|------|------|
| React 19 | 前端框架 |
| Vite 7 | 构建工具 |
| TypeScript | 开发语言 |
| Ant Design 6 | UI 组件库 |
| Zustand | 状态管理 |
| React Router DOM 7 | 路由管理 |
| PocketBase SDK | 后端通信 |
| Axios | HTTP 请求 |
| xlsx | Excel 导出 |

### 后端技术栈
| 技术 | 说明 |
|------|------|
| PocketBase | 后端框架/数据库 |
| Go 1.24 | 后端语言 |
| SQLite | 数据库 |

### 部署架构
| 技术 | 说明 |
|------|------|
| Docker | 容器化 |
| Docker Compose | 服务编排 |
| Traefik | 反向代理/负载均衡 |
| Let's Encrypt | SSL 证书 |
| GitHub Actions + Self-hosted Runner | CI/CD 自动化部署 |
| 阿里云 | 生产服务器 |

## 功能模块

### 销售模块
- **客户管理**：客户档案的 CRUD 操作，支持搜索和详情查看
- **销售合同管理**：合同全生命周期管理，包含发货、收款、开票进度跟踪
- **销售运输管理**：客户到货批次记录管理
- **销售发票管理**：发票开具记录，支持自动计算金额
- **销售收款管理**：回款登记和跟踪

### 采购模块
- **供应商管理**：供应商档案的 CRUD 操作
- **采购合同管理**：采购合同管理，必须关联销售合同
- **采购运输管理**：到货和物流跟踪，支持中专仓库费用管理
- **采购发票管理**：收票登记和记录
- **采购付款管理**：付款申请和跟踪

### 管理模块
- **合同总览**：全局查看所有销售和采购合同
- **进度跟踪**：监控所有合同的执行进度
- **关联对比**：销售与采购的关联进度和利润分析
- **数据报表**：按时间段生成财务报表，支持 Excel 导出

### 系统功能
- **通知中心**：基于规则的业务通知（销售创建合同时通知采购，反之亦然）
- **角色权限控制**：销售、采购、经理三种角色
- **附件管理**：各模块支持文件上传下载

## 系统架构图

```
用户访问 (henghuacheng.cn)
        │
        ▼
┌─────────────────────────────────────┐
│           Traefik 反向代理           │
│  (HTTP 80 / HTTPS 443 / Dashboard)  │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌─────────────┐    ┌─────────────┐
│   Frontend  │    │  PocketBase │
│   (React)   │    │   (Go)      │
│   Nginx     │    │   REST API  │
└─────────────┘    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  SQLite    │
                    │  pb_data   │
                    └─────────────┘
```

## 部署方案

### Docker 服务组成
- **frontend**：React 前端应用，基于 Nginx 运行
- **pocketbase**：Go 后端服务，暴露 8090 端口
- **traefik**：反向代理和路由管理

### 域名配置
| 域名 | 服务 | 说明 |
|------|------|------|
| henghuacheng.cn | Frontend | 前端访问 |
| api.henghuacheng.cn | PocketBase | API 访问 |

### CI/CD 流程
1. 开发者推送代码到 feature 分支
2. 创建 Pull Request 到 master
3. GitHub Actions 自动触发构建
4. 构建 Docker 镜像并打包为 tar.gz
5. 通过 SCP 传输到阿里云服务器
6. 服务器加载镜像并使用 Docker Compose 重启服务

## 项目结构

```
my-erp-system/
├── .github/
│   └── workflows/
│       └── deploy.yml           # CI/CD 部署配置
├── frontend/
│   ├── Dockerfile              # 前端构建配置
│   ├── package.json
│   └── src/
│       ├── api/                # API 请求封装
│       ├── components/         # 公共组件
│       ├── contexts/           # React Context
│       ├── layouts/            # 布局组件
│       ├── pages/              # 页面组件
│       │   ├── sales/          # 销售模块
│       │   ├── purchase/       # 采购模块
│       │   └── manager/        # 经理模块
│       ├── routes/             # 路由配置
│       ├── stores/             # Zustand 状态管理
│       ├── types/              # TypeScript 类型定义
│       └── lib/                # 工具库
├── backend/
│   ├── Dockerfile              # 后端构建配置
│   ├── go.mod / go.sum        # Go 依赖
│   ├── main.go                # 入口文件
│   ├── hooks/                 # PocketBase 业务钩子
│   │   ├── main.go
│   │   ├── sales_contract.go
│   │   ├── purchase_contract.go
│   │   ├── sale_invoice.go
│   │   ├── purchase_invoice.go
│   │   ├── sale_receipt.go
│   │   ├── purchase_payment.go
│   │   ├── sales_shipment.go
│   │   └── purchase_arrival.go
│   └── pb_migrations/          # 数据库迁移脚本
├── traefik/
│   ├── traefik.yml            # Traefik 主配置
│   └── dynamic.toml           # 动态路由配置
└── docker-compose.yml          # Docker 服务编排
```

## 核心业务流程

### 流程一：销售先签订合同
```
销售：客户管理 → 签订销售合同 → 客户到货 → 开具发票 → 登记收款
                                    ↓
                              系统通知采购

采购：接收通知 → 查看销售合同 → 新建关联采购合同 → 采购运输 → 收票 → 付款
```

### 流程二：采购先签订合同
```
采购：供应商管理 → 签订采购合同 → 系统通知销售

销售：接收通知 → 查看采购合同 → 签订销售合同 → 客户到货 → 开具发票 → 登记收款
```

## 关键特性

1. **自动通知机制**：销售合同和采购合同互相关联，一方创建合同后自动通知另一方
2. **进度实时跟踪**：合同详情页可查看发货、收款、开票等进度百分比
3. **利润自动计算**：支持营业利润和净利润计算，包含税费的精确计算
4. **多合同关联**：支持一个销售合同对应多个采购合同（或反之）
5. **数据报表导出**：支持按时间段筛选数据并导出为 Excel

## 利润计算公式

```
营业利润 = 销售总金额 - 采购总金额 - 运费1 - 运费2(如有时) - 杂费(如有时)

净利润 = 销售总金额 - 采购总金额 - 税 - 运费及杂费

税 = (销售总价 × 1.13 - 采购总价 × 1.13) × 0.1878
```

## 技术亮点

- **前后端分离架构**：前端 SPA + 后端 REST API
- **容器化部署**：全 Docker 化，支持快速部署和扩展
- **自动 HTTPS**：Traefik 集成 Let's Encrypt 自动证书
- **CI/CD 自动化**：GitHub Actions 实现代码提交到部署的自动化
- **数据库迁移**：PocketBase migration 脚本管理数据库变更
- **业务钩子**：使用 Go 编写 PocketBase 业务逻辑钩子
