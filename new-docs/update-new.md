# MY-ERP-SYSTEM 更新需求文档

> 文档版本：v1.0
> 创建日期：2026-04-22
> 状态：待实施

---

## 需求总览

| # | 需求类别 | 需求描述 | 涉及模块 | 优先级 | 状态 |
|---|---------|---------|---------|--------|------|
| 1 | 数据报表 | 数据报表筛选逻辑优化——仅按销售合同签订时间筛选 | 经理模块-数据报表 | 高 | ⏳ 待实施 |
| 2 | 功能重构 | 流程进度图从侧边栏移除，集成到关联对比总览页面 | 经理模块 | 高 | ⏳ 待实施 |
| 3 | UI优化 | 使用 react-bits 组件优化前端界面视觉效果 | 全局 | 中 | ⏳ 待实施 |

---

## 需求1：数据报表筛选逻辑优化

### 1.1 问题描述

当前数据报表的最大筛选范围是**一年**。当销售合同的签订时间与关联采购合同的签订时间**跨年度**时（例如：销售合同签订于2025年，采购合同签订于2026年），会导致该组合同在数据报表中**无法显示**。

**原因**：系统同时按照销售合同和采购合同的签订时间进行筛选，当两个时间不在同一年度范围内时，数据被过滤掉。

### 1.2 期望行为

- 数据报表的筛选应**仅基于销售合同的签订时间**
- 无论关联采购合同的签订时间是什么，只要销售合同在筛选范围内，就应显示该组合同的数据
- 保持现有的一年最大筛选范围限制

### 1.3 修改范围

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `frontend/src/pages/manager/ReportPage.tsx` | 修改 | 调整筛选逻辑 |
| 2 | `frontend/src/api/report.ts` | 修改 | 调整数据查询的 filter 条件 |

### 1.4 技术方案

**当前逻辑**：
```
筛选条件 = (销售合同签订时间在范围内) AND (采购合同签订时间在范围内)
```

**修改后逻辑**：
```
筛选条件 = (销售合同签订时间在范围内)
```

即移除对采购合同签订时间的筛选限制，只保留对销售合同签订时间的筛选。

---

## 需求2：流程进度图功能重构

### 2.1 问题描述

当前经理模块侧边栏包含**"流程进度图"**独立的导航入口，用户需要跳转到独立页面查看合同的流程进度。这增加了操作步骤，不够直观。

### 2.2 期望行为

1. **移除**经理模块侧边栏的"流程进度图"导航键
2. 将流程进度图功能**集成**到"关联对比总览"页面
3. 在关联对比总览中，对**需要查看进度流程图**的合同添加**查看按钮**（小眼睛图标）
4. 点击按钮后，在页面内展示对应的流程图（复用原有的流程图组件和代码）
5. 保留原有的筛选逻辑：按照时间和确认节点判断哪些合同需要显示进度流程图

### 2.3 交互设计

#### 2.3.1 查看按钮位置

在"关联对比总览"页面的**销售合同卡片**上，添加一个小眼睛图标按钮（👁️ 或 EyeOutlined）：

```
┌─────────────────────────────────────┐
│ 销售合同: LZX2510085          [👁️] │  <-- 小眼睛按钮
│ 品名: AMSD                          │
│ 总金额: ¥421238.880000              │
│ ...                                 │
└─────────────────────────────────────┘
```

#### 2.3.2 流程图展示方式

点击小眼睛按钮后：
- **直接跳转到流程图页面**，URL 例如：`/manager/flow-graph?contractId=xxx&type=sales`
- 流程图页面顶部需要添加**返回按钮**，点击后返回到关联对比总览页面
- 流程图内容保持不变，复用原有的 `ProgressFlowPage` 中的流程图组件

**跳转逻辑**：
```typescript
// 在 OverviewPage 中
const handleViewFlowGraph = (contractId: string) => {
  navigate(`/manager/flow-graph?contractId=${contractId}&type=sales`);
};
```

#### 2.3.3 筛选逻辑

哪些销售合同需要显示小眼睛按钮？使用与原有"流程进度图"页面相同的筛选逻辑：
- 按照**时间**判断（合同创建时间、最后更新时间）
- 按照**确认节点**判断（是否有待确认的节点）

### 2.4 修改范围

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `frontend/src/components/layout/AppLayout.tsx` | 修改 | 移除侧边栏"流程进度图"导航项 |
| 2 | `frontend/src/pages/manager/OverviewPage.tsx` | 修改 | 在销售合同卡片上添加查看按钮，点击跳转流程图页面 |
| 3 | `frontend/src/pages/manager/ProgressFlowPage.tsx` | 修改 | 添加返回按钮，支持从URL参数获取合同ID |
| 4 | `frontend/src/router/index.tsx` | 修改 | 保留流程进度图路由，添加URL参数支持 |

### 2.5 技术方案

1. **提取公共组件**：将 `ProgressFlowPage` 中的流程图展示逻辑提取为一个可复用的组件 `FlowGraphView`，支持传入 `contractId` 和 `type` 参数
2. **修改 OverviewPage**：
   - 在 `SalesContractCard` 组件上添加条件渲染的小眼睛按钮
   - 使用 `useState` 管理当前查看的合同ID和Modal显示状态
   - 点击按钮时打开Modal/Drawer，传入合同ID
3. **移除导航**：从侧边栏菜单配置中移除"流程进度图"项

---

## 需求3：UI界面优化（react-bits组件）

### 3.1 需求概述

使用已安装的 **react-bits** 组件库，对系统UI进行视觉优化。要求：
- 整体排版位置**不要变动太多**
- 保持现有功能完整
- 增加适当的动效和视觉提升，但**不要太花里胡哨**

### 3.2 具体优化项

#### 3.2.1 亮色/暗色模式切换

**需求**：
- 添加一个**亮色/暗色模式切换按钮**，放置在**侧边栏底部**
- 点击按钮切换全局主题
- 使用 localStorage 保存用户偏好

**推荐组件**：自定义实现（使用 React Context + CSS Variables）

**实现方案**：
```typescript
// 创建 ThemeContext
const ThemeContext = createContext({
  isDarkMode: false,
  toggleTheme: () => {}
});

// 在 AppLayout 侧边栏底部添加切换按钮
<Button 
  icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
  onClick={toggleTheme}
>
  {isDarkMode ? '亮色模式' : '暗色模式'}
</Button>
```

**修改文件**：
- `frontend/src/contexts/ThemeContext.tsx` — 新建
- `frontend/src/components/layout/AppLayout.tsx` — 添加切换按钮
- `frontend/src/App.tsx` — 包裹 ThemeProvider

---

#### 3.2.2 暗色模式背景与边缘辉光效果

**需求**：
- 暗色模式背景不要纯黑，使用**深色渐变背景**（如深蓝紫色渐变）
- 对关键按钮和数据卡片添加**边缘辉光效果**
- 辉光颜色与主题色相协调

**推荐组件**：`BorderGlow`（边缘辉光）

**组件说明**：
- `BorderGlow` — 发光网格渐变边框，跟随光标方向，在边缘处增强亮度
- 适用于：查看按钮、修改按钮、删除按钮、进度卡片等

**应用位置**：

| 元素 | 效果 | 说明 |
|------|------|------|
| 查看按钮 | BorderGlow | 蓝色辉光 |
| 修改按钮 | BorderGlow | 橙色辉光 |
| 删除按钮 | BorderGlow | 红色辉光 |
| 进度卡片 | BorderGlow | 主色调辉光 |
| 数据卡片 | BorderGlow | 微弱白色辉光 |

**实现示例**：
```tsx
import { BorderGlow } from '@react-bits/BorderGlow';

// 查看按钮
<BorderGlow color="#1890ff" intensity={0.6}>
  <Button type="primary" icon={<EyeOutlined />}>查看</Button>
</BorderGlow>

// 进度卡片
<BorderGlow color="#52c41a" intensity={0.4}>
  <Card>...</Card>
</BorderGlow>
```

**暗色模式背景渐变方案**：
```css
.dark-mode {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
}
```

---

#### 3.2.3 导航切换效果（Gooey Nav）

**需求**：
在暗色模式下，对以下导航切换区域使用 `GooeyNav` 组件，提供**黏液 blob 过渡动画**：

| 页面/模块 | 导航项 | 当前组件 |
|----------|--------|---------|
| 经理模块-关联对比总览 | 销售合同 / 采购合同 切换 | Tabs |
| 经理模块-业绩统计 | 销售业绩 / 采购业绩 / 佣金业绩 切换 | Tabs |
| 经理模块-其他业务 | 佣金合同 / 资金支出 / 投标记录 切换 | Tabs |
| 销售/采购/经理侧边栏 | 主导航选择 | Menu |

**推荐组件**：`GooeyNav`（黏液导航）

**组件说明**：
- `GooeyNav` — 导航指示器使用黏液 blob 变形过渡效果，在选项之间平滑变形

**实现示例**：
```tsx
import { GooeyNav } from '@react-bits/GooeyNav';

// 销售/采购合同切换
<GooeyNav 
  items={[
    { key: 'sales', label: '销售合同' },
    { key: 'purchase', label: '采购合同' }
  ]}
  activeKey={activeTab}
  onChange={setActiveTab}
/>
```

**注意**：仅在**暗色模式**下使用 GooeyNav，亮色模式下保持原有 Tabs 组件。

---

#### 3.2.4 其他推荐组件应用

根据 react-bits 组件库，以下组件也适合用于本系统，增强视觉体验：

##### a. GlassSurface / GlassIcons（玻璃拟态）

**适用场景**：卡片背景、图标按钮

**效果**：磨砂玻璃模糊效果，增加现代感和层次感

**应用位置**：
- 数据卡片背景
- 侧边栏图标
- 顶部导航栏

```tsx
import { GlassSurface } from '@react-bits/GlassSurface';

<GlassSurface blur={10} opacity={0.7}>
  <Card>...</Card>
</GlassSurface>
```

##### b. GlareHover（悬停光泽）

**适用场景**：表格行、卡片

**效果**：悬停时产生真实移动的光泽高光

**应用位置**：
- 合同列表表格行
- 数据卡片

```tsx
import { GlareHover } from '@react-bits/GlareHover';

<GlareHover>
  <tr>...</tr>  <!-- 表格行 -->
</GlareHover>
```

##### c. FadeContent / AnimatedContent（内容动画）

**适用场景**：页面内容加载、列表渲染

**效果**：内容进入时带有淡入/滑动动画

**应用位置**：
- 页面初次加载
- 表格数据刷新
- 卡片列表渲染

```tsx
import { FadeContent } from '@react-bits/FadeContent';

<FadeContent direction="up" distance={20}>
  <Table dataSource={data} />
</FadeContent>
```

##### d. Noise（噪点纹理）

**适用场景**：背景叠加

**效果**：微妙的噪点纹理，增加质感，避免纯色背景的单调

**应用位置**：
- 暗色模式背景叠加
- 弹窗背景

```tsx
import { Noise } from '@react-bits/Noise';

<div className="page-container">
  <Noise opacity={0.03} />
  {children}
</div>
```

### 3.3 修改文件清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| **主题系统** |
| 1 | `frontend/src/contexts/ThemeContext.tsx` | 新建 | 主题上下文管理 |
| 2 | `frontend/src/App.tsx` | 修改 | 包裹 ThemeProvider |
| 3 | `frontend/src/components/layout/AppLayout.tsx` | 修改 | 添加主题切换按钮 |
| **辉光效果** |
| 4 | `frontend/src/components/common/ActionButtons.tsx` | 新建/修改 | 封装带BorderGlow的操作按钮 |
| 5 | `frontend/src/pages/manager/OverviewPage.tsx` | 修改 | 卡片添加BorderGlow |
| 6 | `frontend/src/pages/sales/contracts/ContractDetail.tsx` | 修改 | 进度卡片添加BorderGlow |
| 7 | `frontend/src/pages/purchase/contracts/ContractDetail.tsx` | 修改 | 进度卡片添加BorderGlow |
| **导航效果** |
| 8 | `frontend/src/components/common/GooeyTabs.tsx` | 新建 | 封装GooeyNav的Tabs替代组件 |
| 9 | `frontend/src/pages/manager/OverviewPage.tsx` | 修改 | 销售/采购切换使用GooeyTabs |
| 10 | `frontend/src/pages/manager/ReportPage.tsx` | 修改 | 业绩类型切换使用GooeyTabs |
| 11 | `frontend/src/pages/manager/OtherBusinessPage.tsx` | 修改 | 业务类型切换使用GooeyTabs |
| **玻璃拟态** |
| 12 | `frontend/src/components/layout/AppLayout.tsx` | 修改 | 侧边栏使用GlassSurface |
| 13 | `frontend/src/components/common/DataCard.tsx` | 新建/修改 | 封装玻璃拟态卡片 |
| **动画效果** |
| 14 | `frontend/src/pages/*/ContractList.tsx` | 修改 | 表格添加FadeContent |
| 15 | `frontend/src/pages/manager/OverviewPage.tsx` | 修改 | 合同行添加GlareHover |
| **全局样式** |
| 16 | `frontend/src/styles/theme.css` | 新建/修改 | 定义CSS Variables支持主题切换 |
| 17 | `frontend/src/styles/dark-mode.css` | 新建 | 暗色模式样式（渐变背景等） |

### 3.4 实施注意事项

1. **渐进式实施**：建议按以下顺序逐步实施：
   - 第一步：主题切换功能（基础）
   - 第二步：BorderGlow辉光效果（视觉冲击）
   - 第三步：GooeyNav导航效果（交互体验）
   - 第四步：GlassSurface玻璃拟态（质感提升）
   - 第五步：FadeContent/GlareHover动画（细节打磨）

2. **性能考虑**：
   - BorderGlow 和 GlassSurface 涉及 GPU 渲染，在大量使用时注意性能
   - 建议仅在关键元素上使用辉光效果，避免全局滥用

3. **兼容性**：
   - react-bits 组件可能依赖特定的 CSS 属性（如 backdrop-filter），确保浏览器兼容性
   - 提供降级方案：如果浏览器不支持某些特性，回退到原有样式

4. **暗色模式适配**：
   - 所有现有页面需要适配暗色模式下的文字颜色、边框颜色、背景色
   - 使用 CSS Variables 管理颜色，便于主题切换

---

## 实施顺序建议

```
Phase 1 — 数据报表优化
1. 修改 ReportPage.tsx 筛选逻辑
2. 修改 api/report.ts filter 条件
3. 测试验证

Phase 2 — 流程进度图重构
4. 提取 FlowGraphView 公共组件
5. 修改 OverviewPage.tsx 添加查看按钮
6. 移除侧边栏流程进度图导航
7. 测试验证

Phase 3 — UI优化（分步实施）
8. 实现主题切换功能（Context + CSS Variables）
9. 添加 BorderGlow 辉光效果到关键按钮和卡片
10. 添加 GooeyNav 导航效果（暗色模式）
11. 添加 GlassSurface 玻璃拟态效果
12. 添加 FadeContent/GlareHover 动画效果
13. 全局暗色模式样式适配
14. 测试验证

Phase 4 — 部署
15. TypeScript 编译检查
16. 构建 + 部署
```

---

## 附录：react-bits 组件参考

| 组件名 | 用途 | 适用场景 |
|--------|------|---------|
| **BorderGlow** | 边缘辉光效果 | 按钮、卡片、重要元素 |
| **GooeyNav** | 黏液导航切换 | Tabs、导航栏（暗色模式） |
| **GlassSurface** | 玻璃拟态背景 | 卡片、导航栏、面板 |
| **GlareHover** | 悬停光泽效果 | 表格行、卡片 |
| **FadeContent** | 淡入动画 | 页面内容、列表 |
| **Noise** | 噪点纹理 | 背景叠加 |
| **AnimatedContent** | 滚动/挂载动画 | 页面区块 |

---

**文档结束**
