# UI 设计样式修改文档

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 更新日期 | 2026-03-18 |
| 适用模块 | 采购销售管理系统前端 |
| 技术栈 | React + Ant Design |

---

## 一、总体布局修改

### 1.1 右侧内容区域

**修改文件**: `frontend/src/layouts/MainLayout.tsx`

| 修改项 | 当前状态 | 修改目标 |
|--------|----------|----------|
| 圆角 | `borderRadius: 8` | 四个角设计为圆角，建议 `12px` 或更大 |
| 背景色 | `#fff` (纯白) | 带灰度的渐变背景 |

**背景渐变参考**:
```css
background: linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 50%, #f0f0f0 100%);
```

---

## 二、按钮样式规范

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| 避免纯黑 | 不要使用纯黑色 (`#000000`)，使用深灰色替代 |
| 双层阴影 | 左上 + 右下的组合阴影 |
| 阴影参数 | 模糊半径 ≈ 偏移量 × 2 |
| 渐变叠加 | 使用背景色的加深/减淡版本作为渐变色 |

### 2.2 凹陷效果 (按下感)

**CSS 示例**:
```css
box-shadow: 
  /* 第一层：加深版阴影 */
  -2px -2px 4px rgba(255, 255, 255, 0.8),
  /* 第二层：减淡版阴影 */
  2px 2px 4px rgba(0, 0, 0, 0.1);
background: linear-gradient(145deg, #e6e6e6, #ffffff);
```

### 2.3 凸起效果 (弹出感)

**CSS 示例**:
```css
box-shadow: 
  /* 第一层：减淡版阴影 */
  -2px -2px 4px rgba(255, 255, 255, 0.1),
  /* 第二层：加深版阴影 */
  2px 2px 4px rgba(0, 0, 0, 0.1);
background: linear-gradient(145deg, #ffffff, #e6e6e6);
```

---

## 三、数据卡片/容器样式

**修改文件**: `frontend/src/index.css`

| 修改项 | 当前状态 | 修改目标 |
|--------|----------|----------|
| 卡片阴影 | 较浅 | 加深 drop shadow，建议 `0 4px 12px rgba(0, 0, 0, 0.15)` |

---

## 四、列表页面修改

### 4.1 销售/采购合同列表

**修改文件**: 
- `frontend/src/pages/sales/contracts/ContractList.tsx`
- `frontend/src/pages/purchase/contracts/ContractList.tsx`

#### 列宽调整

| 列名 | 当前宽度 | 修改目标 |
|------|----------|----------|
| 产品名称 | 自适应 | 宽度调小，建议 `120-150px` |
| 合同编号 | `150px` | 宽度调大，建议 `180-200px` |

#### 进度条样式

| 修改项 | 说明 |
|--------|------|
| 添加条纹 | 使用 Ant Design Progress 的 `strokeColor` 配合条纹效果 |
| 参考配置 | `strokeColor: { '0%': '#108ee9', '100%': '#87d068' }` 或使用 `trailColor` |

#### 状态显示

| 修改项 | 当前状态 | 修改目标 |
|--------|----------|----------|
| 边框 | 无 | 添加边框 |
| 圆角 | 小 | 调大圆角，建议 `8px` 或更大 |

**参考代码**:
```jsx
<Tag style={{ borderRadius: 8, border: '1px solid currentColor' }}>
  {statusText}
</Tag>
```

### 4.2 通知中心列表

**修改文件**: 
- `frontend/src/pages/sales/notifications/NotificationList.tsx`
- `frontend/src/pages/purchase/notifications/NotificationList.tsx`

#### 列宽调整

| 列名 | 当前宽度 | 修改目标 |
|------|----------|----------|
| 通知类型 | `140px` | 宽度调大，建议 `160-180px` |
| 标题 | 自适应 | 宽度调小 |

---

## 五、详情页面修改

### 5.1 销售/采购合同详情

**修改文件**:
- `frontend/src/pages/sales/contracts/ContractDetail.tsx`
- `frontend/src/pages/purchase/contracts/ContractDetail.tsx`

#### 基本信息表格

| 修改项 | 说明 |
|--------|------|
| 表格规范 | 使用 Ant Design `Descriptions` 组件，设置 `bordered` 属性 |
| 列数 | 建议 `column={2}` 或 `column={3}` |
| 标签对齐 | 设置 `labelAlign="right"` |
| 尺寸 | 设置 `size="small"` |

**参考代码**:
```jsx
<Descriptions bordered column={2} labelAlign="right" size="small">
  <Descriptions.Item label="合同编号">{contract.no}</Descriptions.Item>
  {/* ...其他字段 */}
</Descriptions>
```

---

## 六、经理页面修改

### 6.1 关联对比页面

**修改文件**: `frontend/src/pages/manager/ComparisonPage.tsx`

#### 销售合同信息布局

| 修改项 | 当前状态 | 修改目标 |
|--------|----------|----------|
| 布局 | 表格形式 (`Descriptions column={3}`) | 改为横向一行展示 |
| 字段对应 | 无对应关系 | 每项与下方采购合同对应显示 |

#### 字段对应关系

| 销售合同字段 | 对应采购合同字段 |
|--------------|------------------|
| 合同编号 | 合同编号 |
| 客户 | 供应商 |
| 销售负责人 | 采购负责人 |
| 产品名称 | 产品名称 |
| 签订日期 | 签订日期 |
| 产品单价 | 产品单价 |
| 总数量 | 总数量 |
| 总金额 | 总金额 |
| 已发货数量 | 已执行数量 |
| 已收款金额 | 已付款金额 |
| 已开票金额 | 已收票金额 |
| 状态 | 状态 |

#### 隐藏字段

| 字段 | 操作 |
|------|------|
| 欠款金额 | 移除不显示 |
| 欠款比例 | 移除不显示 |

#### 利润分析位置

| 修改项 | 当前状态 | 修改目标 |
|--------|----------|----------|
| 位置 | 在进度对比下方 | 移到进度对比上方 |

---

## 七、修改优先级

| 优先级 | 修改项 |
|--------|--------|
| P0 (高) | 右侧内容区域圆角 + 背景渐变 |
| P0 (高) | 按钮双层阴影效果 |
| P1 (中) | 合同列表列宽调整 |
| P1 (中) | 进度条条纹效果 |
| P1 (中) | 状态 Tag 边框圆角 |
| P1 (中) | 详情页 Descriptions 规范化 |
| P2 (低) | 通知列表列宽调整 |
| P2 (低) | 经理页面销售合同横向布局 |
| P2 (低) | 利润分析位置调整 |

---

## 八、注意事项

1. **保持一致性**: 所有页面按钮和卡片样式应保持一致
2. **响应式**: 考虑移动端适配，部分圆角和阴影效果可能需要调整
3. **Ant Design 组件**: 优先使用 Ant Design 内置的样式属性，减少自定义 CSS
4. **渐变色**: 渐变色的颜色值应在现有主题色基础上调整，保持整体协调
