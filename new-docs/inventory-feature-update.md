# ERP 系统库存管理功能更新文档

> 文档版本：v1.0
> 创建日期：2026-04-23
> 状态：已完成

---

## 更新总览

本次更新为 ERP 系统新增了完整的库存管理功能模块，包含后端 PocketBase 集合创建、前端管理页面开发以及附件上传查看功能。

| # | 更新类别 | 需求描述 | 涉及模块 | 优先级 | 状态 |
|---|---|---|---|---|---|
| 1 | 新功能 | 新增库存管理模块（库存记录 + 出入库记录） | 经理模块 | 高 | 已完成 |
| 2 | 后端 | 创建 inventory 和 stock_movements 集合 | PocketBase | 高 | 已完成 |
| 3 | 前端 | 库存列表页（CRUD + 出入库操作） | 经理模块 | 高 | 已完成 |
| 4 | 前端 | 库存详情页（基本信息 + 出入库记录） | 经理模块 | 高 | 已完成 |
| 5 | 前端 | 附件上传与查看（多附件支持） | 库存模块 | 高 | 已完成 |
| 6 | UI优化 | 操作按钮间距调整、大小优化 | 库存模块 | 中 | 已完成 |

---

## 第一部分：需求分析

### 1.1 功能需求

**库存记录管理**：
- 产品名称、剩余库存、累计入库、累计出库
- 最后入库日期、最后出库日期
- 备注、附件

**出入库记录管理**：
- 关联库存记录
- 出入库类型（入库/出库）
- 数量、备注、附件

**业务逻辑**：
- 初始剩余库存 = 0
- 入库操作：剩余 += 数量，累计入库 += 数量
- 出库操作：剩余 -= 数量，累计出库 += 数量
- 出库时检查库存是否充足

### 1.2 权限需求
- 仅经理角色可访问库存管理功能
- 北京和兰州两个系统都需要此功能

### 1.3 UI需求
- 操作按钮（入库、出库、查看、修改、删除）间距拉宽
- 按钮大小适中，不要太小
- 查看详情跳转到完整页面，而非弹窗
- 出入库记录表格展示备注和附件

---

## 第二部分：实施计划

### Phase 1 — 后端集合创建

1. **登录 PocketBase 管理后台**
   - api-lanzhou.henghuacheng.cn/_/
   - api-beijing.henghuacheng.cn/_/
   - 账号：wzc112358@qq.com / Wzc.112358

2. **创建 inventory 集合**
   ```
   - product_name: text (required)
   - remaining_quantity: number (default: 0)
   - total_in_quantity: number (default: 0)
   - total_out_quantity: number (default: 0)
   - last_in_date: date
   - last_out_date: date
   - remark: text
   - attachments: file (multiple)
   ```

3. **创建 stock_movements 集合**
   ```
   - inventory: relation → inventory (required)
   - movement_type: select ("in", "out")
   - quantity: number (required, min: 1)
   - remark: text
   - attachments: file (multiple)
   ```

4. **设置集合权限**
   - 两个集合都设置为管理员可读写

### Phase 2 — 前端开发

1. **创建类型定义**
   - `frontend/src/types/inventory.ts`
   - `frontend/src/types/stock-movement.ts`

2. **创建 API 层**
   - `frontend/src/api/inventory.ts`
   - `frontend/src/api/stock-movement.ts`

3. **创建库存列表页**
   - `frontend/src/pages/manager/InventoryPage.tsx`
   - 支持：搜索、新增、编辑、删除、出入库操作

4. **创建库存详情页**
   - `frontend/src/pages/manager/InventoryDetailPage.tsx`
   - 展示：基本信息 + 出入库记录表格

5. **更新路由配置**
   - `frontend/src/routes/index.tsx`
   - 添加 `/manager/inventory` 和 `/manager/inventory/:id`

6. **更新导航菜单**
   - `frontend/src/layouts/MainLayout.tsx`
   - 添加"库存管理"菜单项（仅经理可见）

### Phase 3 — 构建与部署

1. **本地构建**
   ```bash
   cd frontend
   npm run build
   ```

2. **部署到服务器**
   ```bash
   # 复制 dist 到服务器
   scp -r dist/* root@182.92.78.227:/actions-runner/_work/my-erp-system/my-erp-system/frontend/dist/
   
   # 重建容器
   docker compose up -d --build frontend
   ```

---

## 第三部分：详细修改记录

### 3.1 后端修改

**PocketBase 集合配置**：

| 集合名 | 字段 | 类型 | 说明 |
|---|---|---|---|
| inventory | product_name | text | 产品名称 |
| inventory | remaining_quantity | number | 剩余库存，默认0 |
| inventory | total_in_quantity | number | 累计入库，默认0 |
| inventory | total_out_quantity | number | 累计出库，默认0 |
| inventory | last_in_date | date | 最后入库时间 |
| inventory | last_out_date | date | 最后出库时间 |
| inventory | remark | text | 备注 |
| inventory | attachments | file | 附件，multiple |
| stock_movements | inventory | relation | 关联库存 |
| stock_movements | movement_type | select | in/out |
| stock_movements | quantity | number | 数量 |
| stock_movements | remark | text | 备注 |
| stock_movements | attachments | file | 附件，multiple |

### 3.2 前端文件修改

**新增文件**：
| # | 文件 | 说明 |
|---|---|---|
| 1 | `frontend/src/types/inventory.ts` | 库存类型定义 |
| 2 | `frontend/src/types/stock-movement.ts` | 出入库记录类型 |
| 3 | `frontend/src/api/inventory.ts` | 库存 API |
| 4 | `frontend/src/api/stock-movement.ts` | 出入库记录 API |
| 5 | `frontend/src/pages/manager/InventoryPage.tsx` | 库存列表页 |
| 6 | `frontend/src/pages/manager/InventoryDetailPage.tsx` | 库存详情页 |

**修改文件**：
| # | 文件 | 说明 |
|---|---|---|
| 1 | `frontend/src/types/index.ts` | 导出新增类型 |
| 2 | `frontend/src/routes/index.tsx` | 添加库存路由 |
| 3 | `frontend/src/layouts/MainLayout.tsx` | 添加库存菜单 |

### 3.3 关键代码实现

**附件上传处理**：
```typescript
// 编辑时保留已有附件 + 新增附件
const attachments = fileList.map((f) => {
  if (f.originFileObj) {
    return f.originFileObj as File;  // 新上传的文件
  } else {
    return f.name;  // 已有文件名，保留
  }
});
```

**附件链接生成**：
```typescript
// 使用标准 PocketBase 文件 URL 格式
const url = `${pb.baseUrl}/api/files/${collectionName}/${recordId}/${fileName}`;
```

**出入库业务逻辑**：
```typescript
// 入库
const newRemaining = inventory.remaining_quantity + quantity;
const newTotalIn = inventory.total_in_quantity + quantity;

// 出库（检查库存）
if (inventory.remaining_quantity < quantity) {
  message.error('库存不足，无法出库');
  return;
}
const newRemaining = inventory.remaining_quantity - quantity;
const newTotalOut = inventory.total_out_quantity + quantity;
```

---

## 第四部分：部署流程

### 4.1 本地构建

```bash
cd /home/wzc11/projects/my-erp-system/frontend
npm run build
```

**构建检查清单**：
- [ ] TypeScript 编译无错误
- [ ] 无 ESLint 错误
- [ ] dist 目录生成成功

### 4.2 服务器部署

**服务器信息**：
- IP: 182.92.78.227
- 项目路径: /actions-runner/_work/my-erp-system/my-erp-system/
- SSH 密钥: /home/wzc11/projects/my-erp-system/.ssh/id_ed25519

**部署步骤**：

1. **清空服务器旧文件**
   ```bash
   ssh -i id_ed25519 root@182.92.78.227 \
     "rm -rf /actions-runner/_work/my-erp-system/my-erp-system/frontend/dist/*"
   ```

2. **复制新构建文件**
   ```bash
   scp -i id_ed25519 -r dist/* \
     root@182.92.78.227:/actions-runner/_work/my-erp-system/my-erp-system/frontend/dist/
   ```

3. **重建 Docker 容器**
   ```bash
   ssh -i id_ed25519 root@182.92.78.227 \
     "cd /actions-runner/_work/my-erp-system/my-erp-system && docker compose up -d --build frontend"
   ```

4. **验证部署**
   ```bash
   # 检查容器状态
   docker ps | grep erp-frontend
   
   # 检查网站可访问
   curl -s https://erp.henghuacheng.cn | head -5
   ```

### 4.3 部署注意事项

- 使用 `docker compose`（v2）而非 `docker-compose`（v1）
- 如果遇到容器名冲突，先删除旧容器再重建
- 确保 `docker-compose.yml` 中的 `web` 网络存在
- 部署后强制刷新浏览器（Ctrl+Shift+R）清除缓存

---

## 第五部分：问题记录与解决方案

### 问题1：附件无法查看

**现象**：附件上传成功但点击无法查看

**原因**：使用了 `pb.files.getUrl()` 方法，参数格式不正确

**解决**：改为使用标准 URL 格式
```typescript
// 错误
const url = pb.files.getUrl({ id: recordId, collectionName } as any, file);

// 正确
const url = `${pb.baseUrl}/api/files/${collectionName}/${recordId}/${file}`;
```

### 问题2：修改按钮点击无反应

**现象**：点击修改按钮控制台报错 `TypeError: (e.attachments || []).map is not a function`

**原因**：PocketBase 返回的 `attachments` 字段不是数组（可能是 null）

**解决**：使用 `Array.isArray()` 检查
```typescript
const attachments = Array.isArray(record.attachments) ? record.attachments : [];
```

### 问题3：上传多附件覆盖旧附件

**现象**：编辑时上传新附件会覆盖已有附件

**原因**：API 只发送了新上传的文件，没有包含已有文件名

**解决**：编辑时同时传递已有文件名和新文件
```typescript
const attachments = fileList.map((f) => {
  if (f.originFileObj) {
    return f.originFileObj as File;  // 新文件
  } else {
    return f.name;  // 已有文件名
  }
});
```

### 问题4：详情页弹窗太小

**现象**：出入库记录表格内容太多，弹窗显示不全

**解决**：将详情查看改为独立页面（路由跳转）
- 原：Modal 弹窗显示详情
- 新：`/manager/inventory/:id` 独立页面

---

## 第六部分：验证清单

### 功能验证

- [x] 库存列表页正常显示
- [x] 新增库存记录
- [x] 编辑库存记录（含附件）
- [x] 删除库存记录
- [x] 入库操作（增加库存）
- [x] 出库操作（减少库存，检查库存充足）
- [x] 查看库存详情（独立页面）
- [x] 出入库记录显示
- [x] 附件上传（单文件）
- [x] 附件上传（多文件）
- [x] 附件查看
- [x] 编辑时保留已有附件
- [x] 仅经理角色可见
- [x] 北京和兰州系统都可用

### UI验证

- [x] 操作按钮间距合适
- [x] 按钮大小适中
- [x] 表格列宽合适
- [x] 响应式布局正常

---

## 附录：技术栈

| 类别 | 技术 |
|---|---|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| UI 组件库 | Ant Design 6 |
| 后端服务 | PocketBase |
| 部署方式 | Docker + Nginx |

---

**文档结束**
