# 本地招投标 Agent 架构

## 背景

现有 Phase 3 方案把 `agent-service` 放在云端作为主控，再由 Windows 本地助手通过配对、心跳、拉取任务、执行、回传的链路协助处理登录/验证码站点。实测后，招投标站点的主要阻力不是单个采集 Adapter 不够强，而是云端 IP、登录态、验证码、短信、CA、站点风控和员工本机环境之间存在天然错位。

新方案把主控从云端翻到本地：

- 本地应用负责创建任务、打开真实浏览器、执行采集、暂停给员工处理验证、继续抽取候选。
- 云端 ERP 负责接收结果、展示商机、沉淀证据、分发安装包和可选通知。
- 云端任务通道保留为兼容能力，但不再是第一阶段的主路径。

## 目标架构

```text
恒化成本地采集 Agent
  ├─ Electron Shell
  │   ├─ 启动、托盘、深链、安装包
  │   └─ 默认打开本地任务台
  ├─ 本地任务台
  │   ├─ 创建采集任务
  │   ├─ 选择站点 profile
  │   ├─ 输入搜索词/入口 URL
  │   └─ 查看候选、截图、日志和上传状态
  ├─ Agent Runner
  │   ├─ 打开站点入口
  │   ├─ 识别登录/验证码/空白页
  │   ├─ 等待员工接管
  │   ├─ 继续观察页面
  │   └─ 产出 CandidateBundle + artifacts
  ├─ Browser Runtime
  │   ├─ Playwright/CDP
  │   ├─ 持久 Chrome profile
  │   ├─ 截图
  │   ├─ DOM 快照
  │   ├─ 链接采集
  │   └─ 网络响应摘要
  ├─ Site Harness
  │   ├─ 站点 profile
  │   ├─ 登录/验证码判断
  │   ├─ 公告候选抽取
  │   └─ 附件线索抽取
  └─ Result Sinks
      ├─ ERP 上传
      ├─ 微信群摘要
      └─ 本地导出/审计日志
```

## 模块分工

### `local-helper-app`

第一阶段的核心产品形态。继续使用 Electron + Node + Playwright，并继续沿用现有 Linux 打 Windows NSIS 安装包的方式。

关键 Module：

- `electron-main.ts`：桌面壳、托盘、深链、默认窗口。
- `local-api.ts`：本地任务台调用的 HTTP Interface。
- `task-store.ts`：本地任务、运行状态、最近观察、候选结果、证据摘要。
- `local-agent-runner.ts`：本地 Agent 主流程，第一阶段新增。
- `playwright-runtime.ts`：真实浏览器 Adapter。
- `site-harness.ts`：站点无关的观察分析和候选抽取。
- `site-profiles.ts`：中石油、中化、中海油、裕龙、能源一号等站点配置。
- `cloud-client.ts`：保留为云端上传/兼容旧任务通道的 Adapter，不再是默认主线。

### `agent-service`

新方案中从“主控”降为“结果接收与入库”。第一阶段保留：

- `local-helper-ingestion.js`：CandidateBundle 到 `bid_opportunities` 的转换。
- `local-helper-store.js` / `local-helper-api.js`：旧本地助手通道继续兼容。
- 后续新增轻量结果上传入口时，优先复用现有 ingestion Module。

### `frontend`

ERP 前端继续承担：

- 招投标商机池展示。
- 证据、截图、附件线索查看。
- 安装包下载和版本说明。
- 后续可增加“本地 Agent 上传结果”状态展示。

## 主流程

```text
员工打开本地 Agent
  -> 选择站点或输入自定义 URL
  -> 输入搜索词
  -> 点击打开采集浏览器
  -> Agent 打开真实浏览器 profile
  -> 如果出现登录/验证码/短信/CA，暂停
  -> 员工完成验证并筛选到公告列表/详情页
  -> 点击继续采集
  -> Agent 采集 DOM、链接、网络响应、截图、附件线索
  -> Site Harness 生成 CandidateBundle
  -> 员工确认候选
  -> 上传 ERP 或生成微信群摘要
```

## 第一阶段约束

- 不做通用 opencode 产品，先做窄的招投标采集 Agent。
- 不把公司 LLM key 写进安装包；如需 LLM，走员工配置或云端代理。
- 不让 Agent 获得任意 shell 权限。
- 不自动绕过验证码，只支持员工完成验证后继续。
- 不再要求先配对云端才能使用。
- 保留旧 `/cloud/*` 路由，避免已经部署的 ERP 深链和版本检查立刻失效。

## 站点分层

| 层级 | 处理方式 | 例子 |
| --- | --- | --- |
| 公开可采集 | 后续可继续云端或本地自动采集 | 国能 E 招、国能 E 购、易派克公开列表 |
| 本地优先 | 本地 Agent 打开，员工登录/验证后继续 | 中石油、中化、中海油、裕龙、隆道云、金能 |
| 半自动材料 | 员工粘贴或导入文本，Agent 结构化 | 微信群、邮件、下载文件 |
| 人工-only | 暂时只记录处理说明 | 缺入口 URL、强 CA、无法稳定打开站点 |

## 演进方向

第一阶段完成后，再逐步接入：

- Firecrawl/Search Adapter：用于公开网页搜索和链接发现。
- LLM Extractor Adapter：用于复杂公告详情页归纳、资质条件、产品匹配。
- Scheduler：本地每日定时采集。
- ERP Upload Adapter：直接上传 CandidateBundle 和 artifacts。
- WeChat Summary Adapter：生成群消息或接企业微信 webhook。
