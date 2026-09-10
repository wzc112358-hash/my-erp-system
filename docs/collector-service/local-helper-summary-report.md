# 恒化成本地采集助手总结汇报

更新时间：2026-06-26  
项目位置：`local-helper-app`  
应用形态：Electron 桌面应用 + 本地 HTTP API + 本机浏览器采集 Agent

## 一、项目定位

本地采集助手的目标是把员工每天查看招投标网站、登录网站、处理验证码、筛选公告、判断是否与恒化成产品相关、整理微信群消息的工作流程，沉淀成一个可在员工电脑上运行的本地 Agent 应用。

当前版本已经从早期的“打开网页辅助采集 Demo”升级为：

```text
本地招投标情报 Agent
  = Electron 本地应用
  + 真实浏览器登录态
  + 站点采集 Harness
  + ReAct Agent 循环
  + LLM 可选研判
  + 产品知识库
  + 商机卡片
  + 微信群摘要
  + 人工反馈学习
  + ERP 安装包分发
```

它的核心价值不是完全绕过登录和验证码，而是在必须使用员工本机账号、验证码、CA、短信或企业内网页面时，把人工操作和自动采集合并成一个可控流程：能自动采的自动采，必须人工接管的明确暂停，人工处理后继续抽取、研判和输出。

## 二、当前已包含的主要功能

### 1. Electron 本地桌面应用

- Windows 安装包形式分发，保持原来的 Electron 打包方式。
- 本地启动后运行 HTTP API，默认服务地址为 `http://127.0.0.1:17321`。
- 支持托盘、任务台、深链协议和本机浏览器任务。
- 本地模式可独立使用，不强依赖云端配对。
- 保留云端配对和 ERP 上传通道，兼容后续集中管理。
- 源码模式下 `npm start` 也可以直接访问任务台页面，便于开发测试。

### 2. 本地任务台 UI

任务台目前支持：

- 新建本地采集任务。
- 按站点 profile 自动填充入口 URL、搜索词和操作提示。
- 查看任务状态：待处理、采集中、等待人工、已完成、失败等。
- 一键运行 `Agent 自动发现`。
- 打开本机浏览器等待人工登录、验证码或筛选。
- 人工完成后继续采集。
- 展示采集结果摘要。
- 展示商机卡片。
- 复制微信群消息、站点日报、今日重点清单。
- 查看 Agent 运行轨迹。
- 本地模型配置和测试连接。
- 每日巡检计划。
- 商机看板和反馈学习状态。

本轮 UI 优化重点：

- 左侧改为小导航栏 + 内容侧栏，减少左侧信息拥挤。
- 结果摘要和商机卡片放在前面，用户先看到结论。
- Agent 思考、工具调用、原始过程日志放入 `Agent 思考/行动过程` 折叠块，默认收起，避免用户每次翻到底部才能看结果。
- LLM 测试连接按钮现在会立即显示“正在连接模型接口”，并最终显示成功或失败状态。

界面截图：

![本地任务台桌面端：结果摘要、商机卡片和左侧小导航](../local-helper-app/output/playwright/tasks-agent-layout-after-llm.png)

移动端适配截图：

<img src="../local-helper-app/output/playwright/tasks-mobile.png" alt="本地任务台移动端：Agent 设置、任务操作和结果区域" width="360" />

### 3. 站点 Profile 和站点 Skill

系统已经把站点差异拆为两层：

- `site-profiles.ts`：站点入口、默认搜索词、默认操作提示、公告抽取规则、噪声过滤规则。
- `site-skills.ts`：给 Agent/LLM 的站点级采集说明，包括负责人、要看栏目、重点产品、人工接管条件、必须抽取字段和失败兜底方案。

当前已覆盖的站点包括：

- 中石油招投标网
- 云梦泽询价网
- 易派克
- 能源一号（兰州恒化成）
- 能源一号（北京恒化成）
- 能源一号（天津宜远）
- 华锦兵器网 / 华北兵器网
- 隆道云
- 金能招标网
- 延长石油
- 中化
- 中海油
- 国能E招
- 国能E购
- 国能网
- 东华能源网
- 裕龙招投标网

站点 skill 不保存账号密码，账号、密码、验证码仍由员工在本机处理。

### 4. Agent Harness 和 ReAct 循环

当前应用已经不是单纯自动化脚本，而是本地 Agent Harness 架构：

```text
创建任务
  -> 读取站点 profile 和 skill
  -> 链接发现 / 公开 feed / 入口 URL 回退
  -> ReAct planner 决定下一步动作
  -> 调用工具：搜索、打开浏览器、观察页面、读取附件
  -> 抽取候选公告
  -> 产品知识库筛选
  -> LLM/规则研判
  -> 输出商机卡片和微信群摘要
  -> 记录 Agent 轨迹
```

ReAct 支持的动作包括：

- `search`：发现公开入口和公告链接。
- `open_url`：打开候选入口。
- `observe`：观察当前浏览器页面。
- `read_documents`：读取 PDF、DOCX、文本类附件线索。
- `finish`：完成采集。
- `request_human`：需要人工登录、验证码、CA、短信、补入口或确认网络。

每次 Agent 运行会记录：

- 计划步骤。
- 工具调用。
- 浏览器观察结果。
- 候选抽取结果。
- 商机研判结果。
- 人工接管原因。
- 最终状态。

这些记录可在 UI 的 `Agent 思考/行动过程` 中查看。

Agent 运行轨迹截图：

![Agent 运行轨迹：计划、工具调用和结果记录](../local-helper-app/output/playwright/agent-run-timeline-desktop.png)

### 5. LLM 集成

当前 LLM 采用 OpenAI-compatible 接口方式，不绑定具体厂商。

支持配置：

- 接口地址 `baseUrl`
- API Key
- 模型名 `model`
- 是否启用 LLM

可以接入 DeepSeek、OpenAI-compatible 私有模型或其他兼容 `/chat/completions` 的服务。

已接入 LLM 的位置：

- LLM 连接测试。
- ReAct planner，可由模型决定下一步动作。
- 采集结果摘要。
- 商机研判 `bid-assessment`。

安全策略：

- API Key 不写入代码。
- API Key 不打包进安装包。
- UI 保存后只显示是否已配置，不回显 Key。
- 未配置 LLM 时自动降级到确定性规则，不影响基础采集。
- LLM 失败时保留规则结果和原始证据。

LLM 配置和测试反馈截图：

![LLM 配置、工具状态和测试连接反馈](../local-helper-app/output/playwright/tasks-llm-test-feedback.png)

### 6. 产品知识库和商机卡片

当前产品知识库来自：

- ERP 历史产品。
- 群聊记录中的历史询价、投标和报价信息。
- 人工整理的产品别名。
- 负向排除词和噪声规则。
- 员工反馈学习。

重点产品示例：

- 白油、工业白油、食品级白油、基础油
- 凡士林脂、凡士林油
- TCP、TCP2
- 四氯乙烯、全氯乙烯
- 抗氧剂 168、390、618
- 阻聚剂、丁二烯阻聚剂、协同阻聚剂、B596、S600、S620、MEHQ、对苯二酚
- EDTA、乙二胺四乙酸二钠、乙二胺四乙酸四钠
- BHT、TBEC、AMSD
- 硅油、二甲基硅油
- 硫酸亚铁、硫酸羟胺
- 单乙醇胺、分散剂、消泡剂、抗静电剂
- 亚硫酸钠、焦亚硫酸钠
- 起泡剂、捕收剂、部分催化剂类线索

商机卡片字段包括：

- 公告标题
- 来源站点
- 链接
- 采购方
- 发布日期
- 报价/投标截止时间
- 命中产品
- 相关度分数
- 建议动作
- 硬性要求
- 风险提示
- 缺失信息
- 原文证据
- 微信群摘要
- 员工反馈状态

建议动作包括：

- 建议发群请老板确认
- 建议继续查附件/详情
- 建议人工判断后再问老板
- 建议跟踪截止时间
- 建议忽略

### 7. 微信群协作输出

系统目前支持生成：

- 单条商机微信群摘要。
- 单站点日报。
- 今日重点清单。

输出内容会包含：

- 来源站点。
- 标题。
- 命中产品。
- 相关度。
- 关键要求。
- 需要确认的问题。
- 风险提示。
- 原文链接。

这符合群公告里的协作方式：发现相关招标信息后，先表达是否能做的判断，再问王总是否同意做。

### 8. 人工反馈学习

员工可以对商机卡片做反馈：

- 有价值
- 不相关
- 待老板确认
- 已发群
- 已跟进

反馈会影响后续排序和判断：

- 正反馈提高相关产品词权重。
- 负反馈降低重复误报权重。
- 已判定过的公告可复用历史判断。
- 反馈信息可形成 ERP `opportunity_reviews` 草稿。

## 三、技术架构

### 1. 应用结构

```text
local-helper-app
  ├─ Electron Shell
  │   ├─ electron-main.ts
  │   ├─ electron-shell.ts
  │   └─ deep-link.ts
  ├─ Local API
  │   ├─ main.ts
  │   ├─ local-api.ts
  │   ├─ task-store.ts
  │   └─ local-config-store.ts
  ├─ Agent Harness
  │   ├─ controlled-local-agent.ts
  │   ├─ react-collection-agent.ts
  │   ├─ react-planner.ts
  │   ├─ agent-toolbox.ts
  │   └─ agent-harness.ts
  ├─ Tools
  │   ├─ playwright-runtime.ts
  │   ├─ cdp-mcp-adapter.ts
  │   ├─ agent-search-adapter.ts
  │   ├─ document-reader.ts
  │   └─ site-public-feed.ts
  ├─ Site Adaptation
  │   ├─ site-profiles.ts
  │   ├─ site-skills.ts
  │   └─ site-harness.ts
  ├─ Intelligence
  │   ├─ local-llm-agent.ts
  │   ├─ bid-assessment.ts
  │   ├─ product-knowledge.ts
  │   ├─ feedback-learning.ts
  │   ├─ priority-board.ts
  │   └─ wechat-summary.ts
  └─ Renderer
      ├─ renderer/tasks.html
      ├─ renderer/tasks.js
      ├─ renderer/pair.html
      └─ renderer/pair.js
```

### 2. 工具层设计

当前工具层包括：

- Playwright 本地浏览器 runtime：真实 Chrome、持久化 profile、复用登录态。
- Chrome DevTools MCP 适配规划：用于后续接入 CDP MCP。
- Firecrawl Search Adapter：用于公开搜索和链接发现；没有 key 时回退入口 URL。
- Public Feed Collector：用于国能 E 购这类公开 JSON feed。
- Document Reader：用于读取 PDF、DOCX、TXT 和附件线索。
- 站点 Harness：从可见文本、链接和网络响应中抽取候选公告。

### 3. 本地 API 主要接口

```text
GET  /health
GET  /site-profiles
GET  /tasks
POST /tasks
POST /tasks/:id/run
POST /tasks/:id/continue-run
POST /tasks/:id/agent-run
POST /tasks/:id/cancel

GET  /agent-tools
GET  /agent-runs
GET  /agent-runs/:id

GET  /settings/llm
POST /settings/llm
POST /settings/llm/test

GET  /opportunities/priority-board
GET  /wechat/daily-report
GET  /wechat/priority-report
```

### 4. 数据流

```text
站点公告 / feed / 浏览器页面 / 附件
  -> BrowserObservation / PublicFeedResult
  -> CandidateBundle
  -> Product Matcher
  -> Opportunity Cards
  -> Bid Assessor
  -> WeChat Summary
  -> Feedback Learning
  -> ERP Review Draft / 后续上传
```

### 5. 打包部署

当前仍使用原 Electron 安装包方式：

- `npm run build`
- `npm run package:win`
- `npm run package:release`

安装包产物发布到：

```text
frontend/public/downloads/
  ├─ hcz-local-helper-setup.exe
  ├─ hcz-local-helper-setup.exe.blockmap
  ├─ hcz-local-helper-release.json
  └─ SHA256SUMS.txt
```

服务器配置较低时，推荐在本地完成 Electron 打包，再上传到 ERP 下载目录，不在服务器上执行 Electron Builder。

## 四、已完成的站点适配和实测结论

### 公开可采或部分可采

| 站点 | 当前结果 | 说明 |
| --- | --- | --- |
| 国能E招 | 可采集 | 可抓公开公告列表，低相关公告会自动忽略 |
| 国能E购 | 可采集 | 页面抓取不稳定，但 OSS JSON feed 稳定，已接入 public feed |
| 国能网 | 可采集 | 覆盖国能 E 招/E 购方向，当前以 E 招入口为主 |
| 易派克 | 可采集公开列表 | 详情、8 位码、买标等仍可能需要登录 |
| 延长石油 | 可采集部分列表 | JS 渲染列表，当前可抽取公开内容 |
| 云梦泽询价网 | 可进入公开入口 | 详情或买标书仍需要人工登录确认 |
| 金能招标网 | 可采集首页公告 | 登录框验证码不再误判为阻塞；再生类催化剂误报已降低 |
| 中化 | 可采集公开入口部分内容 | 已过滤平台系统通知和 URL token 误报 |
| 隆道云 | 可采集公开首页项目 | 登录后详情仍需人工接管 |

### 需要人工接管或外部条件

| 站点 | 当前结果 | 原因 |
| --- | --- | --- |
| 中石油招投标网 | 需要人工 | 验证码/登录态/SPA 限制 |
| 裕龙招投标网 | 需要人工 | 安全验证/滑块 |
| 中海油 | 需要人工 | 当前访问返回真实 502 Bad Gateway |
| 华锦兵器网 | 需要人工或网络环境 | 当前环境 Empty Response |
| 能源一号三类 | 需要人工或确认入口 | `https://www.energyahead.com/` 当前环境导航超时，资料中群公告强调能源一号群消息需人工查看 |
| 东华能源网 | 需要补充入口 | 当前资料没有入口 URL |

### 端到端对照测试

对 `国能E购` 做过一轮“外部抓取 vs 应用采集”对照：

- 外部抓取公开 OSS JSON feed：32 条公告。
- 按恒化成产品词库判断：0 条命中重点产品。
- 应用 UI 中创建国能E购任务并运行 Agent：
  - 采集 30 条候选。
  - 生成 30 张商机卡片。
  - 全部低相关，建议忽略。
- 结论：应用采集和外部对照判断一致。

Firecrawl 对该站普通搜索和交互式页面抓取效果不稳定，说明国能E购更适合走公开 JSON feed，而不是页面交互抓取。

## 五、关键问题和已修复点

### 1. LLM 测试连接无反应

问题：

- 浏览器直接打开 `/ui/tasks` 时，前端默认 API 地址固定为 `127.0.0.1:17321`。
- 开发测试使用 `17322` 时，请求打错端口，表现为按钮一直停在连接中。

修复：

- 前端默认 API 改为当前页面 `location.origin`。
- Electron 带 `?api=` 时仍优先使用显式 API。
- LLM 测试请求增加 35 秒超时。
- 未配置模型时会显示明确结果：`LLM 研判未启用。`

### 2. 金能站误判 502

问题：

- 金能页脚备案号中包含 `502`，被裸 `502` 正则误判为 Bad Gateway。

修复：

- 502 规则改为只匹配真实错误页，如 `502 Bad Gateway`。
- 增加测试覆盖备案号场景。

### 3. ReAct 旧人工原因污染后续结果

问题：

- 某次观察到空页或验证码后，`lastHumanReason` 没有在后续正常页面中清空。
- 导致后面已打开公告页仍被判为需要人工。

修复：

- 页面分析 ready 后清空旧人工原因。
- 增加回归测试。

### 4. 平台噪声和误报

已处理的误报类型：

- 平台系统公告。
- 操作手册、培训通知、政策法规。
- 导航栏目链接。
- 已废旧物资出售/废包装桶/处置竞价。
- URL 签名 token 误命中 BHT 等短英文产品词。
- 催化剂检测装置、催化剂再生服务等低相关场景。

## 六、测试情况

当前自动化测试：

```text
npm test
167 个测试全部通过
```

覆盖范围包括：

- Local API。
- LLM 配置和连接测试。
- OpenAI-compatible JSON 输出和降级。
- ReAct planner。
- ReAct collection agent。
- Agent tool runner。
- Site harness。
- Site profiles。
- Site skills。
- 国能E购 public feed。
- Product knowledge。
- Bid assessment。
- Document reader。
- Playwright runtime。
- Task store。
- Feedback learning。
- WeChat summary。
- Priority board。
- Electron shell。

UI 实测：

- `http://127.0.0.1:17322/ui/tasks` 可打开。
- LLM 测试按钮有连接中状态和最终状态。
- `Agent 思考/行动过程` 折叠块存在，默认关闭。
- 创建国能E购任务并运行 Agent 成功。

## 七、当前限制

1. LLM 已接入，但真实模型效果还需要按站点逐轮调 prompt 和 skill。
2. Firecrawl 对部分中文招投标站点搜索效果有限，需要和公开 feed、CDP 浏览器工具结合使用。
3. 部分站点必须人工处理验证码、短信、CA、滑块或内网页面。
4. 东华能源网资料中缺入口 URL，无法自动采集。
5. 能源一号当前入口访问超时，且群公告要求大家看群内招标信息，后续需要支持“群消息粘贴采集”。
6. PDF、图片、扫描件 OCR 能力还有继续增强空间。
7. ERP 上传和本地反馈闭环已经有基础，但还需要定义最终入库字段和审核流程。

## 八、下一阶段建议

### 1. 真实 LLM 分站点调试

建议按站点逐个跑：

```text
站点测试
  -> 看 Agent 轨迹
  -> 看候选抽取
  -> 看 LLM 判断
  -> 修站点 skill
  -> 修产品词库
  -> 修负向规则
  -> 记录测试结论
```

优先顺序：

1. 国能E购、国能E招：公开数据稳定，适合做基准。
2. 易派克、延长石油、中化：公开/半公开，适合调详情和附件。
3. 金能、云梦泽、隆道云：需要本地浏览器和人工登录。
4. 中石油、裕龙、中海油、华锦：重点处理验证码、网关、网络环境和人工接管。
5. 能源一号、东华能源：先补入口和群消息采集方案。

### 2. 群消息粘贴采集

能源一号群公告明确要求每天看群内招标信息，因此建议新增：

- 粘贴群消息。
- 自动识别采购方、产品、数量、截止时间、历史价格。
- 自动生成商机卡片。
- 和网页采集结果统一进入今日重点清单。

### 3. 附件深读和 OCR

建议增强：

- PDF 附件读取。
- DOC/DOCX 附件读取。
- 图片/扫描件 OCR。
- 附件中的规格、数量、检测要求、代理商限制、8 位码、危化资质抽取。

可继续接入：

- PDF Reader MCP。
- OCR MCP。
- 本地文档解析 fallback。

### 4. ERP 入库闭环

建议把本地商机卡片映射到 ERP：

- `bid_opportunities`
- `bid_documents`
- `opportunity_reviews`
- `product_terms`
- `feedback_learning`

并支持：

- 本地先审。
- 员工确认后上传。
- 老板反馈回写。
- 历史投标和合同价格反向强化产品知识库。

### 5. 安装包和发布

继续保持：

- 本地打包 Electron 安装包。
- 上传到 ERP 下载目录。
- 服务器只负责分发，不在低配置服务器上构建 Electron。

后续发布前建议补充：

- 公司图标。
- 版本说明。
- 安装包签名。
- 启动失败日志提示。
- 自动更新或版本检测。

## 九、阶段性结论

当前本地助手已经具备可用的 Agent Harness 雏形：

- 能以 Electron 应用形式分发。
- 能在员工本机运行。
- 能处理公开站点和本地浏览器站点。
- 能在需要登录/验证码时暂停给人工。
- 能用 ReAct 循环组织采集动作。
- 能接入 LLM 做可选研判。
- 能用产品知识库生成商机卡片。
- 能生成微信群可复制摘要。
- 能记录 Agent 思考和工具调用过程。
- 能通过反馈学习降低重复误报。

下一阶段的重点不是重做架构，而是继续按真实站点逐个调试：

```text
站点适配精度
  + LLM prompt/skill 稳定性
  + 附件深读能力
  + 群消息采集
  + ERP 入库闭环
```

如果按这个路径推进，本地助手可以逐步从“网页采集工具”变成“恒化成招投标情报工作台”。
