# 本地招投标 Agent 第一阶段计划

## 阶段目标

把现有 Windows 本地助手改造成可独立工作的本地招投标 Agent。员工无需先连接云端，即可在本机创建采集任务、打开站点、完成人工验证、继续采集并得到结构化候选结果。

## 成功标准

- 安装包形式保持不变：继续产出 `hcz-local-helper-setup.exe` 和 zip 备用包。
- 应用首次启动默认进入“本地采集任务台”，不再强制配对云端。
- 员工可在本地创建招投标采集任务。
- 任务可使用站点 profile 自动补入口 URL。
- 点击“打开采集浏览器”后，真实浏览器使用持久 profile 打开站点。
- 遇到登录/验证码/短信/CA 时，任务停在等待员工处理状态。
- 员工点击“继续采集”后，应用生成 CandidateBundle、截图和 artifacts。
- 旧云端配对/任务通道仍可用，但只作为兼容路径。
- 本地测试和打包流程保持可运行。

## 本阶段范围

### 1. 产品主线调整

- 默认打开任务台。
- 任务台标题从“云端任务”改为“本地采集任务”。
- 增加本地任务创建表单：站点、搜索词、入口 URL。
- 站点列表来自 `site-profiles.ts`。
- 未配对云端时也能完整运行本地采集。

### 2. 本地 Agent Runner

- 新增 `local-agent-runner.ts`。
- 复用 `site-harness.ts` 和 `playwright-runtime.ts`。
- 提供两个核心动作：
  - `openLocalAgentTask`：打开站点并暂停给员工确认/验证。
  - `continueLocalAgentTaskAfterHuman`：继续观察页面并生成 CandidateBundle。
- 输出：
  - `status`
  - `humanReason`
  - `observation`
  - `candidateBundle`
  - `artifacts`
  - `resultSummary`

### 3. 本地 HTTP Interface

- `GET /site-profiles`：返回可选站点。
- `POST /tasks`：创建本地任务。
- `POST /tasks/:id/run`：打开本地采集浏览器。
- `POST /tasks/:id/continue-run`：继续采集并生成候选。
- 保留旧：
  - `POST /cloud/pair`
  - `GET /cloud/tasks`
  - `POST /cloud/tasks/:id/*`

### 4. 结果沉淀

- `task-store.ts` 保存最近一次：
  - 页面观察文本
  - 截图路径
  - 运行日志
  - CandidateBundle
  - artifacts
  - 结果摘要
- 第一阶段先在本地任务台展示，不强制上传。

### 5. 项目整理

- 文档中明确旧“云端主控”路径降级为兼容路径。
- 不再把华锦 pilot 当作唯一主线。
- 明显误导 UI 的“云端任务”文案改为“本地采集任务”。
- 暂不删除仍被测试引用的旧兼容 Module，避免误删已有改动；等本地主线测试覆盖稳定后再删。

## 后续阶段

### 阶段 1.1：工具层与受控 Agent

- 增加 `agent-search-adapter.ts`，提供 Firecrawl/Search Adapter。
- Firecrawl 通过本机 `FIRECRAWL_API_KEY` 或 `HCZ_FIRECRAWL_API_KEY` 启用；未配置时回退到任务入口 URL。
- 增加 `cdp-mcp-adapter.ts`，先把现有 Playwright/CDP runtime 包成受控浏览器工具。
- 增加 `controlled-local-agent.ts`，实现“搜索公开入口 -> 打开浏览器 -> 抽候选/暂停人工”的竖切。
- 本地任务台新增“Agent 自动发现”，并展示 Agent 发现入口。
- LLM 只作为摘要 Adapter 接入，不把 key 和模型写进安装包。

状态：已初始化。

### 阶段 2：产品研判与微信群增效

详见 [`docs/local-agent-phase2-intelligence-plan.md`](local-agent-phase2-intelligence-plan.md)。

下一阶段不再只追求“搜到更多公告”，而是围绕员工真实增效做：

- 从 ERP 历史产品、库存、投标记录和群聊样本初始化产品知识库。
- 把候选标题列表升级为商机卡片。
- 接入可配置的 OpenAI-compatible LLM：`baseUrl + apiKey + model`，模型可自选。
- LLM 输出结构化研判：能否做初判、硬性要求、风险、缺失信息、推荐动作。
- 生成可复制微信群摘要，ERP 上传后置。
- 增加员工反馈：有价值、不相关、待老板、已发群、已跟进。

状态：已形成计划，待实现。

### 阶段 2.1：微信摘要

- 先生成可复制微信群摘要，作为招投标信息的主要流转形式。
- 再考虑企业微信 webhook。

状态：基础确定性摘要已在 `local-llm-agent.ts` 初始化；Phase 2 将升级为基于商机卡片的日报/单条请示。

### 阶段 2.2：每日自动采集

- 本地 Scheduler 保存每日站点计划。
- 支持一键运行“今日采集”。
- 登录态过期时只暂停对应站点。
- 每日结果按“重点关注 / 待人工确认 / 无新增或低相关”生成微信群日报。

### 阶段 2.3：ERP 上传

- 增加 `result-sinks/erp-upload`。
- 复用云端 `local-helper-ingestion` 的 CandidateBundle 入库逻辑。
- 本地任务台显示上传成功/失败。
- 把商机卡片映射到 `bid_opportunities`，把附件解析结果映射到 `bid_documents`，把员工/老板反馈映射到 `opportunity_reviews`。
- ERP 上传作为后置能力，不阻塞微信群交流主流程。

## 验证命令

```bash
cd local-helper-app && npm test
cd local-helper-app && npm run build
cd local-helper-app && npm run package:release
```
