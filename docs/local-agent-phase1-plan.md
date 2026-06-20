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

### 阶段 1.1：ERP 上传

- 增加 `result-sinks/erp-upload`。
- 复用云端 `local-helper-ingestion` 的 CandidateBundle 入库逻辑。
- 本地任务台显示上传成功/失败。

### 阶段 1.2：微信摘要

- 先生成可复制微信群摘要。
- 再考虑企业微信 webhook。

### 阶段 1.3：搜索与 LLM

- 接入 Firecrawl/Search Adapter 做公开网页发现。
- 接入 LLM Extractor Adapter 做公告详情归纳。
- LLM key 走本地配置或云端代理，不写死在安装包。

### 阶段 1.4：每日自动采集

- 本地 Scheduler 保存每日站点计划。
- 支持一键运行“今日采集”。
- 登录态过期时只暂停对应站点。

## 验证命令

```bash
cd local-helper-app && npm test
cd local-helper-app && npm run build
cd local-helper-app && npm run package:release
```
