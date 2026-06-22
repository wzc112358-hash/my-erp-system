# 本地招投标情报 Agent 架构

## 背景

第一版本地助手已经验证了关键路径：

```text
本地任务台创建任务
  -> 打开真实浏览器
  -> 员工处理登录/验证码/筛选
  -> 继续采集
  -> 页面显示候选结果
```

这个路径解决了“云端采集被反爬、登录态不在服务器、人机验证无法自动通过”的问题。但它还没有真正解决员工每天的核心负担：员工仍要逐条阅读公告、判断能不能做、补查规格/装置/资质要求，再整理成微信群消息请老板判断。

因此下一阶段的产品定位从“采集工具”升级为：

```text
本地招投标情报 Agent
  = 本地采集 + 产品知识库 + LLM 研判 + 微信群汇报 + 人工反馈闭环
```

ERP 上传仍保留，但第一优先级是让微信群里的日常协作更省事。

## 目标架构

```text
恒化成本地招投标情报 Agent
  ├─ Electron Shell
  │   ├─ 安装包、托盘、深链、自动启动本地任务台
  │   └─ 本机配置：LLM baseUrl/apiKey/model、Firecrawl key、云端上传
  ├─ 本地任务台
  │   ├─ 每日巡检任务
  │   ├─ 站点任务和人工登录/验证码接管
  │   ├─ 商机卡片、研判结果、证据、微信群摘要
  │   └─ 员工反馈：有价值/不相关/待老板/已发群/已跟进
  ├─ Collection Layer
  │   ├─ Firecrawl/Search Adapter：公开网页搜索和链接发现
  │   ├─ CDP Browser Tool Adapter：真实 Chrome 登录态和人工接管
  │   ├─ Site Harness：站点 profile、公告列表/详情抽取
  │   └─ Document Reader：PDF/Word/图片/OCR 附件解析（下一阶段）
  ├─ Intelligence Layer
  │   ├─ Product Knowledge Base：ERP 历史产品、库存、投标记录、群聊样本、人工维护词
  │   ├─ Rule Matcher：高召回产品命中、负面词、截止时间、去重
  │   ├─ LLM Bid Assessor：公告详情研判、硬条件提取、能否做初判
  │   ├─ WeChat Summary Generator：生成可复制群消息
  │   └─ Feedback Learner：把员工/老板反馈沉淀成词库和规则
  ├─ Local Store
  │   ├─ task-store：任务、运行状态、候选、证据、摘要
  │   ├─ product-terms：产品词库和别名
  │   ├─ opportunity-cache：商机卡片、去重指纹、历史反馈
  │   └─ secure-config：本机 key 和模型配置
  └─ Result Sinks
      ├─ 微信群摘要：第一优先级，先复制，后续可接企业微信 webhook
      ├─ ERP 上传：写入 bid_opportunities、bid_documents、opportunity_reviews
      └─ 本地导出：JSON/Markdown/审计日志
```

## 主流程

```text
员工打开本地 Agent 或每日定时触发
  -> Agent 按站点 profile 搜索/打开公告列表
  -> 如遇登录/验证码/短信/CA，暂停给员工处理
  -> Agent 继续采集列表、详情页、附件和截图
  -> Rule Matcher 用产品知识库做高召回筛选
  -> LLM Bid Assessor 对疑似商机做深度研判
  -> 生成商机卡片：
       产品匹配、采购方、数量、规格、截止时间、硬条件、风险、推荐动作
  -> 员工快速确认/修正
  -> 生成微信群日报或单条请示
  -> 员工/老板反馈回流到词库和判断规则
```

## 关键 Module

### `local-helper-app`

第一阶段主线已经在这里，下一阶段继续把情报能力放在本地应用内，避免登录态、验证码和企业微信协作被云端链路卡住。

- `electron-main.ts`：桌面壳、托盘、深链、本地任务台。
- `local-api.ts`：本地任务台 HTTP Interface；下一阶段新增 LLM 配置、商机研判、微信群摘要路由。
- `task-store.ts`：本地任务、候选、证据和结果摘要；下一阶段扩展商机卡片字段。
- `controlled-local-agent.ts`：受控 Agent 编排，负责链接发现、打开浏览器、抽取候选。
- `agent-search-adapter.ts`：Firecrawl/Search Adapter；无 key 时回退到入口 URL。
- `cdp-mcp-adapter.ts`：浏览器工具 Interface，当前复用 Playwright runtime。
- `local-llm-agent.ts`：当前只做摘要；下一阶段升级为 `LLM Bid Assessor`，输出结构化 JSON。
- `site-profiles.ts`：站点入口、默认搜索词、操作提示。
- 新增建议：
  - `product-knowledge.ts`：产品词库加载、别名、权重、来源。
  - `bid-assessment.ts`：规则匹配 + LLM 研判 + 降级逻辑。
  - `wechat-summary.ts`：群消息模板和日报模板。
  - `secure-config.ts`：本机 LLM key/model 配置。

### `agent-service`

新架构下从“云端主控”变为“ERP 结果接收与兼容通道”。

- 保留 `local-helper-api.js`、`local-helper-store.js`，兼容旧本地助手通道。
- 保留 `local-helper-ingestion.js`，后续接收本地商机卡片。
- `bid_opportunities`、`bid_documents`、`opportunity_reviews`、`product_terms` 已经具备下一阶段需要的大部分字段。
- 云端可以做公司统一词库、安装包分发和可选模型代理，但不再负责登录重站点的主流程。

### `frontend`

ERP 前端后续承担：

- 招投标商机池展示。
- 产品词库维护。
- 证据、截图、附件摘要查看。
- 机会状态和员工/老板反馈沉淀。
- 安装包下载、版本说明、可选上传状态。

## 产品知识库来源

下一阶段“能不能做”的判断不能只靠标题关键词，需要把公司历史经验组织成知识库。

### ERP 历史数据

服务器 PocketBase 中已存在相关集合：

- `sales_contracts`：销售合同，包含历史成交产品。
- `purchase_contracts`：采购合同，包含历史采购产品和供应来源。
- `inventory`：库存产品。
- `bidding_records`：投标记录，包含投标产品、开标、保证金、结果。
- `bid_opportunities`：已预留 `relevance_score`、`matched_terms`、`hard_requirements`、`recommended_action`、`confirmation_package` 等字段。
- `product_terms`：已建表，但当前为空，需要下一阶段初始化。

从 ERP 历史中可作为第一批强命中产品的样例包括：

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

### 群聊和员工分工资料

`网页信息分工说明/` 中沉淀了站点分工、搜索方式和业务判断规则。可作为第二批线索产品和研判规则来源：

- 抗静电剂、亚硫酸钠、焦亚硫酸钠
- 起泡剂、捕收剂
- 脱硝/脱氧/脱氢催化剂
- 二甲基二硫、PAO、聚醚基础油
- 紫外线吸收剂、DMPP 硝化抑制剂、表面活性剂
- 碳酸铵、碳酸氢钠、碳酸二甲酯
- 苯基三甲氧基硅烷、六甲基二硅氧烷
- 2-硝基二苯胺、磷酸二氢镁、铜盐、对甲苯磺酸

群公告和聊天样本明确了硬性判断项：

- 是否允许代理商投标。
- 是否限制生产商/制造商。
- 是否需要中石油/中石化 8 位码。
- 是否需要第三方检测、质检单、业绩。
- 是否属于危险品，危品登记证和运输/包装回收是否满足。
- 交货期、分批供货、储备量、付款方式、质保金是否可接受。
- 标书费、保证金、服务费、报价截止、开标时间是否可操作。
- 历史中标人、历史报价、我司是否做过、之前排名如何。
- 产品具体装置、用途、纯度、规格、包装是否明确。

## LLM 配置策略

下一阶段需要 LLM，但 key 不能写进安装包。

本地应用提供 OpenAI-compatible 配置：

```text
HCZ_LOCAL_AGENT_LLM_BASE_URL
HCZ_LOCAL_AGENT_LLM_API_KEY
HCZ_LOCAL_AGENT_LLM_MODEL
```

也可以在 UI 中提供等价配置项：

- 接口地址：例如兼容 `/chat/completions` 的服务地址。
- API Key：存本机安全配置，不进入日志、不上传。
- 模型名：员工或管理员自选。

模型能力要求：

- 中文长文本理解较好。
- 能稳定输出 JSON。
- 能处理公告、附件摘要和业务规则。
- 成本可控，失败时不影响规则兜底。

降级原则：

- 未配置 LLM：仍可采集、去重、产品词命中、生成基础摘要。
- LLM 调用失败：保留规则判断和原始证据，标记 `needs_human_check`。
- LLM 只能输出建议，不能自动替员工/老板作最终投标决定。

## 研判输出形态

每条候选公告升级为商机卡片：

```json
{
  "title": "公告标题",
  "source_name": "来源站点",
  "url": "原文链接",
  "buyer_name": "采购方",
  "matched_terms": ["白油", "凡士林脂"],
  "matched_sources": ["erp_history", "chat_history"],
  "relevance_score": 0.86,
  "bidability": "likely_can_do | needs_manual_check | likely_cannot_do",
  "hard_requirements": [
    "需确认是否接受代理商投标",
    "需提供质检单",
    "报价截止 2026-05-06 14:00"
  ],
  "risk_flags": [
    "截止时间紧",
    "可能有制造商限制"
  ],
  "missing_info": [
    "未找到装置用途",
    "未找到历史中标价格"
  ],
  "recommended_action": "发群请老板确认 / 继续查附件 / 忽略",
  "wechat_summary": "可直接复制到微信群的一段话",
  "evidence_text": "命中依据和原文片段"
}
```

## 第一阶段约束继续保留

- 不自动绕过验证码，只支持员工完成验证后继续。
- 不开放任意 shell 权限。
- 不把公司 LLM key、Firecrawl key、站点账号密码写进安装包。
- 登录凭据只留在员工本机浏览器 profile 或安全配置中。
- 云端 ERP 上传后置，微信群摘要优先。
- 所有 LLM 结论必须带证据，不能凭空编造采购方、截止日期、资质要求或历史价格。

