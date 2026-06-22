# 本地招投标 Agent Phase 2：产品研判与微信群增效计划

## 阶段目标

把当前“搜索/采集候选公告”的本地助手，升级为能给员工节省阅读和整理时间的招投标情报 Agent。

Phase 2 的目标不是全自动投标决策，而是让员工每天看到：

- 今天哪些站点已查、哪些没有新信息。
- 哪些公告和公司产品高度相关。
- 每条疑似商机缺哪些关键判断信息。
- 哪些可以直接发微信群请老板确认。
- 哪些明显不相关，可以跳过。

## 成功标准

- 本地应用可以配置 LLM `baseUrl + apiKey + model`，模型可自选。
- 未配置 LLM 时，仍可用规则和产品词库输出基础判断。
- 产品词库从 ERP 历史数据和 `网页信息分工说明/` 初始化。
- 候选结果从“标题列表”升级为“商机卡片”。
- 商机卡片能输出：
  - 产品命中词和来源。
  - 相关度分数。
  - 初步能否做判断。
  - 硬性要求和风险。
  - 缺失信息。
  - 推荐动作。
  - 可复制微信群摘要。
- 员工可以给每条商机反馈“有价值/不相关/待老板/已发群/已跟进”。
- 每日可生成一份微信群日报。

## 数据依据

### 服务器 ERP 现状

读取服务器 `root@182.92.78.227` 上 PocketBase 数据后，关键集合如下：

| 集合 | 当前用途 | Phase 2 用法 |
| --- | --- | --- |
| `sales_contracts` | 历史销售合同，含 `product_name` | 强产品词来源，证明公司卖过 |
| `purchase_contracts` | 历史采购合同，含 `product_name` | 强产品词来源，证明公司采购过/有供应链 |
| `inventory` | 库存产品 | 强产品词来源，证明可优先关注 |
| `bidding_records` | 投标记录 | 强产品词来源，证明历史参与过 |
| `monitor_sources` | 站点、负责人、关键词、策略 | 站点计划和每日巡检来源 |
| `bid_opportunities` | 商机池 | 后续上传商机卡片 |
| `bid_documents` | 招标文件 | 后续保存附件解析结果 |
| `opportunity_reviews` | 人工评审 | 保存员工/老板反馈 |
| `product_terms` | 产品词库 | 当前为空，Phase 2 需要初始化 |

ERP 历史产品种子：

- 白油、食品级白油、工业白油、基础油
- 凡士林脂、凡士林油
- TCP、TCP2
- 四氯乙烯、全氯乙烯
- 抗氧剂 168、390、618
- 协同阻聚剂、丁二烯阻聚剂 B596/S600/S620、苯乙烯阻聚剂
- 乙二胺四乙酸二钠/四钠、EDTA-4Na
- 对苯二酚、MEHQ、BHT、TBEC、AMSD
- 硅油、二甲基硅油、矿物油
- 硫酸亚铁、硫酸羟胺、碳酸铜
- 单乙醇胺、分散剂、消泡剂

### 本地分工资料和群聊

`网页信息分工说明/` 提供三类知识：

- 站点分工：中石油、云梦泽、能源一号、华锦、易派克、延长石油、中化、国能、中海油、裕龙等。
- 搜索方式：看哪些栏目、按日期还是关键词、是否需要登录。
- 业务判断：是否能做不是看标题，而是看代理商、检测、业绩、8 位码、危品资质、交货期、历史价格等。

群聊中的高频/潜在线索产品：

- 抗静电剂、亚硫酸钠、焦亚硫酸钠
- 起泡剂、捕收剂
- 脱硝/脱氧/脱氢催化剂
- 二甲基二硫、PAO、聚醚基础油
- 紫外线吸收剂、DMPP 硝化抑制剂、表面活性剂
- 碳酸铵、碳酸氢钠、碳酸二甲酯
- 苯基三甲氧基硅烷、六甲基二硅氧烷
- 2-硝基二苯胺、磷酸二氢镁、铜盐、对甲苯磺酸

硬性判断项：

- 是否接受代理商投标。
- 是否要求生产商/制造商。
- 是否需要中石油/中石化 8 位码。
- 是否需要第三方检测、质检单、业绩。
- 是否属于危险品，危品登记证、危品运输、包装回收是否满足。
- 交货期、分批供货、储备量、付款方式、质保金是否可接受。
- 标书费、保证金、服务费、报价截止、开标时间是否可操作。
- 历史中标人、历史报价、我司是否做过、之前排名如何。
- 产品具体装置、用途、纯度、规格、包装是否明确。

## LLM 接入决策

Phase 2 需要接入 LLM，但必须保持可替换和可降级。

### 配置方式

本地应用支持 OpenAI-compatible 配置：

```text
HCZ_LOCAL_AGENT_LLM_BASE_URL
HCZ_LOCAL_AGENT_LLM_API_KEY
HCZ_LOCAL_AGENT_LLM_MODEL
```

后续 UI 中增加“模型设置”：

- 接口地址。
- API Key。
- 模型名。
- 测试连接。
- 是否启用 LLM 研判。

### 模型选择

模型可以自选，只要求兼容 `/chat/completions` 或通过一个轻量 Adapter 适配。

选择标准：

- 中文公告理解能力好。
- 能稳定输出 JSON。
- 上下文长度足够处理公告详情和附件摘要。
- 成本可控。
- 网络稳定。

### 不配置 key 时的行为

- 可以继续本地采集。
- 可以用产品词库做基础匹配。
- 可以生成基础微信群摘要。
- 商机卡片标记为 `needs_human_check`。
- 不执行深度“能否做”判断。

## Phase 2 Module 设计

### 1. `Product Knowledge Base`

建议新增本地 Module：

```text
local-helper-app/src/product-knowledge.ts
```

Interface：

```ts
loadProductTerms(): ProductTerm[]
matchProductTerms(text: string): ProductMatchResult
recordFeedback(feedback: OpportunityFeedback): void
```

职责：

- 载入 ERP 历史产品词。
- 载入群聊/分工资料种子词。
- 支持别名、权重、来源、启停状态。
- 输出命中词、证据片段、负面词、基础分数。

词来源建议：

- `erp_history`：销售/采购/库存/投标记录。
- `chat_history`：群聊中出现过的线索产品。
- `curated`：人工维护重点产品。
- `alias`：别名。
- `feedback_positive`：员工/老板确认有价值。
- `feedback_negative`：员工/老板确认不相关。

### 2. `LLM Bid Assessor`

建议新增本地 Module：

```text
local-helper-app/src/bid-assessment.ts
```

Interface：

```ts
assessOpportunity(input: AssessmentInput): Promise<OpportunityAssessment>
```

输入：

- 候选标题。
- 原文链接。
- 页面正文。
- 附件解析文本。
- 产品命中结果。
- 站点 profile。
- ERP 历史产品摘要。
- 员工分工规则。

输出结构：

```ts
type OpportunityAssessment = {
  relevanceScore: number;
  matchedTerms: string[];
  matchedSources: string[];
  bidability: 'likely_can_do' | 'needs_manual_check' | 'likely_cannot_do';
  hardRequirements: string[];
  riskFlags: string[];
  missingInfo: string[];
  recommendedAction: 'send_to_group' | 'deep_read_document' | 'ignore' | 'ask_boss' | 'track_deadline';
  evidenceText: string;
  wechatSummary: string;
  confidence: number;
};
```

LLM 要求：

- 只根据给定文本和知识库判断。
- 不允许编造采购方、截止日期、历史价格、资质要求。
- 不确定时输出 `needs_manual_check`。
- 每个结论必须有 `evidenceText`。

### 3. `Document Reader`

建议新增：

```text
local-helper-app/src/document-reader.ts
```

第一版范围：

- PDF 文本抽取。
- Word 文本抽取。
- 附件链接保存。
- OCR 后置。

用途：

- 读取标书/附件中的规格、技术参数、资质要求。
- 回答“这条到底用在什么装置上”“是否限制厂家”“是否要 8 位码”等问题。

### 4. `WeChat Summary Generator`

建议新增：

```text
local-helper-app/src/wechat-summary.ts
```

输出两类消息：

单条请示：

```text
【待确认】中化 - 阻聚剂采购询源
产品：阻聚剂，命中公司关注产品
需确认：具体装置/用途、是否接受代理商、是否有制造商限制
风险：当前页面未找到完整技术参数，建议查看附件
链接：...
```

每日报告：

```text
今日招投标信息汇总：

一、建议重点关注
1. ...

二、待人工确认
1. ...

三、今日无新增/低相关站点
金能：无招标信息。
```

## 实施计划

### Task 1：产品知识库初始化

文件：

- 新增 `local-helper-app/src/product-knowledge.ts`
- 新增 `local-helper-app/src/product-knowledge.test.ts`
- 新增 `local-helper-app/src/data/product-terms.seed.json`
- 可选新增 `scripts/export-product-terms-from-pocketbase.mjs`

步骤：

- [x] 从 ERP 历史产品整理种子词。
- [x] 从 `网页信息分工说明/` 整理聊天线索词。
- [x] 支持 term、aliases、source、weight、status。
- [x] 为强历史产品设置高权重。
- [x] 为“化工、烯、酸、盐”等过宽词设置低权重或负面保护，避免误报。
- [x] 写测试覆盖白油、凡士林脂、TCP2、阻聚剂、抗静电剂、焦亚硫酸钠等。

验收：

- 输入公告标题能返回命中词、来源、分数和证据。
- 办公用品、物业、土建、系统运维等能被降权或排除。

### Task 2：商机卡片数据结构

文件：

- 修改 `local-helper-app/src/task-store.ts`
- 修改 `local-helper-app/src/site-harness.ts`
- 修改 `local-helper-app/src/renderer/tasks.js`
- 新增类型测试。

步骤：

- [x] 在任务结果中保存 `OpportunityCard[]`。
- [x] 每条候选附带产品命中、分数、推荐动作、证据。
- [x] UI 从普通候选列表升级为商机卡片。
- [x] 保留原始 CandidateBundle，便于回溯。

验收：

- 采集完成后，页面不只显示标题，还显示“为什么相关”和“下一步做什么”。

### Task 3：LLM 配置与连接测试

文件：

- 修改 `local-helper-app/src/local-llm-agent.ts`
- 新增或修改 `local-helper-app/src/local-config-store.ts`
- 新增 `local-helper-app/src/renderer/settings.html`
- 新增 `local-helper-app/src/renderer/settings.js`

步骤：

- [x] 支持 UI 配置 `baseUrl/apiKey/model`。
- [x] 支持测试连接。
- [x] key 存本机配置，不进入日志。
- [x] 未配置时使用 deterministic fallback。
- [x] 单元测试覆盖未配置、配置错误、接口失败、正常返回。

验收：

- 员工可自行填 key 和模型。
- 模型可替换。
- 不配置 key 也不影响采集流程。

### Task 4：LLM 商机研判 Adapter

文件：

- 新增 `local-helper-app/src/bid-assessment.ts`
- 新增 `local-helper-app/src/bid-assessment.test.ts`
- 修改 `local-helper-app/src/controlled-local-agent.ts`

步骤：

- [x] 设计结构化 JSON prompt。
- [x] 输入候选、正文、产品命中、站点规则。
- [x] 校验 LLM 返回 JSON；无效则降级。
- [x] 合并规则分数和 LLM 判断。
- [x] 输出 `bidability`、`hardRequirements`、`riskFlags`、`missingInfo`、`recommendedAction`、`wechatSummary`。

验收：

- “阻聚剂”样本应输出需要确认装置/用途。
- “凡士林脂/白油/TCP2”样本应识别为历史强相关。
- 低相关工程/服务类公告应输出忽略或人工复核。

### Task 5：单条“查清楚”流程

文件：

- 修改 `local-helper-app/src/local-api.ts`
- 修改 `local-helper-app/src/renderer/tasks.js`
- 新增 `local-helper-app/src/document-reader.ts`

步骤：

- [x] 商机卡片增加“查清楚”按钮。
- [x] 打开详情页或复用当前浏览器页面。
- [x] 抓正文、附件链接、截图。
- [x] 解析 PDF/Word 文本。
- [x] 调用 `assessOpportunity` 生成深度研判。

验收：

- 员工被老板追问后，可以点一次按钮生成“补充说明”。
- 第一版可解析公开附件和浏览器已下载附件；登录态附件如果本地 fetch 拿不到，会保留附件链接和失败提示，后续再接 CDP 下载或 OCR。

### Task 6：微信群摘要

文件：

- 新增 `local-helper-app/src/wechat-summary.ts`
- 新增 `local-helper-app/src/wechat-summary.test.ts`
- 修改 `local-helper-app/src/renderer/tasks.js`

步骤：

- [x] 每条商机生成单条请示文案。
- [x] 任务组生成站点日报。
- [x] 全部任务生成今日汇总。
- [x] 提供复制按钮。

验收：

- 员工可以直接复制到微信群。
- 摘要按“重点关注/待确认/低相关或无新增”分组。

### Task 7：反馈闭环

文件：

- 修改 `local-helper-app/src/task-store.ts`
- 修改 `local-helper-app/src/local-api.ts`
- 修改 `local-helper-app/src/renderer/tasks.js`
- 后续修改 `agent-service/src/local-helper-ingestion.js`

步骤：

- [x] 每条商机支持反馈：有价值、不相关、待老板、已发群、已跟进。
- [x] 反馈写入本地 store。
- [x] 后续上传 ERP 时映射到 `opportunity_reviews`。
- [x] 正负反馈可以调整产品词权重。

验收：

- 员工每天的判断能沉淀，不会一直重复筛同类无关公告。

### Task 8：本地反馈学习

文件：

- 新增 `local-helper-app/src/feedback-learning.ts`
- 新增 `local-helper-app/src/feedback-learning.test.ts`
- 修改 `local-helper-app/src/local-config-store.ts`
- 修改 `local-helper-app/src/task-store.ts`
- 修改 `local-helper-app/src/local-api.ts`
- 修改 `local-helper-app/src/local-agent-runner.ts`
- 修改 `local-helper-app/src/controlled-local-agent.ts`
- 修改 `local-helper-app/src/renderer/tasks.js`

步骤：

- [x] 将员工反馈持久化到本地配置文件。
- [x] 按产品词累计正向/负向权重。
- [x] 后续生成商机卡片时使用“种子词库 + 本地反馈权重”。
- [x] 同一公告再次出现时自动套用过往员工判断。
- [x] 在任务台展示反馈学习摘要，并支持清空本地学习数据。

验收：

- 员工标记“不相关”的同类公告，后续相关度会被降权或自动忽略。
- 员工标记“有价值/已发群/已跟进”的产品词，后续会提升排序优先级。
- 学习数据只保存在本地安装环境，不依赖云端连接。

### Task 9：每日重点清单

文件：

- 新增 `local-helper-app/src/priority-board.ts`
- 新增 `local-helper-app/src/priority-board.test.ts`
- 修改 `local-helper-app/src/local-api.ts`
- 修改 `local-helper-app/src/renderer/tasks.js`

步骤：

- [x] 综合相关度、推荐动作、员工反馈、本地反馈学习和截止时间生成优先级分。
- [x] 提供 `/opportunities/priority-board` JSON 工作台接口。
- [x] 提供 `/wechat/priority-report` 复制到微信群的重点清单。
- [x] 在任务台左侧展示今日 Top 3 重点商机。
- [x] 在任务详情操作区支持复制重点清单。

验收：

- 员工每天打开应用后，可以先看“今日重点”，不用从所有卡片里逐条翻。
- 重点清单排除已忽略/明显不相关商机，优先展示可发群、待老板确认、临近截止的商机。
- 重点清单能直接复制到微信群，作为日报前的行动清单。

### Task 10：每日自动巡检调度

文件：

- 新增 `local-helper-app/src/local-scheduler.ts`
- 新增 `local-helper-app/src/local-scheduler.test.ts`
- 修改 `local-helper-app/src/local-config-store.ts`
- 修改 `local-helper-app/src/task-store.ts`
- 修改 `local-helper-app/src/local-api.ts`
- 修改 `local-helper-app/src/renderer/tasks.html`
- 修改 `local-helper-app/src/renderer/tasks.js`

步骤：

- [x] 支持本地每日计划：站点、搜索词、入口 URL、操作提示、每日时间、运行方式、启停状态。
- [x] 支持运行方式：`Agent 自动发现`、`打开浏览器等待人工`、`只创建任务`。
- [x] 计划持久化到本地配置文件，重启后保留。
- [x] 服务启动后按固定间隔扫描到期计划，避免同一时间重复运行。
- [x] 提供 `/schedules`、`/schedules/run-due`、`/schedules/:id/run-now`、`/schedules/:id/delete` 接口。
- [x] 在任务台配置、编辑、立即运行和删除每日巡检计划。

验收：

- 员工可以配置每天 09:00、15:00 自动创建/运行某站点采集任务。
- 到点后任务会进入本地任务台；需要登录/验证码时保持等待人工继续。
- 计划运行完成后的商机卡片会进入今日重点清单和微信群摘要链路。

## 推荐开发顺序

1. 产品知识库初始化。
2. 商机卡片 UI。
3. LLM 配置。
4. LLM 商机研判。
5. 微信群摘要。
6. “查清楚”附件/详情深读。
7. 反馈闭环和 ERP 上传。
8. 本地反馈学习。
9. 每日重点清单。
10. 每日自动巡检调度。

原因：

- 先做产品知识库，即使没有 LLM 也能马上提升筛选质量。
- 先做商机卡片，员工能立刻感受到不是在看标题列表。
- LLM 只负责加深判断，不承担兜底能力。
- 微信群摘要是当前业务协作的最短增效路径。

## 验证命令

```bash
cd local-helper-app && npm test
cd local-helper-app && npm run build
cd local-helper-app && npm run package:release
```

## 风险与约束

- LLM 可能幻觉：必须强制 JSON、证据字段、降级逻辑。
- 产品词过宽会误报：`化工`、`酸`、`盐`、`烯` 这类词不能单独作为高相关。
- 附件解析可能不稳定：第一版先保留链接和文本抽取，OCR 后置。
- 账号密码不能进入文档、日志、安装包。
- 最终是否投标仍由员工和老板决定，Agent 只做研判辅助。
