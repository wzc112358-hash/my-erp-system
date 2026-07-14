# 恒化成本地采集助手

面向员工的 Electron 招投标巡检应用。当前只覆盖三个试点站点：国能 E 购、易派克、裕龙招投标网。

## 产品主链路

```text
Electron 工作台
  → 本地 HTTP 工作台（127.0.0.1:17321）
  → Collection Run
      → 公开数据 collector（国能 E 购、易派克）
      → Browser Session（裕龙及后续复杂站点）
          → Playwright adapter
          → Electron CDP adapter
      → 确定性页面抽取 + LLM 页面/网络抽取
      → 产品范围匹配 + LLM 招投标判断
  → 筛选报告
  → 一键复制 / 可选上传云端
```

登录、验证码、安全挑战和员工接管都只发生在本机。LLM 输入不包含 Cookie、Authorization 或账号密码。

## 代码结构

```text
src/
  app/         本地 HTTP 工作台、任务状态、配置、云端上传
  browser/     BrowserSession、页面抽取、Playwright、Electron CDP、附件读取
  collection/  单一采集运行管线和运行日志
  domain/      产品知识、筛选结果、最终报告
  llm/         OpenAI-compatible 客户端、网页抽取、招投标判断
  sites/       三个试点站点的统一 registry 和公开数据 collector
  shell/       Electron 外壳与深链
  renderer/    最小化静态界面
```

新增站点时先在 `sites/registry.ts` 声明采集方式。只有存在稳定公开数据时才扩展 public collector；其他站点复用 BrowserSession 和 LLM 抽取。

## 浏览器策略

- 国能 E 购：公开 JSON/feed + 产品词深搜。
- 易派克：公开 HTML 公告列表。
- 裕龙：默认使用 Electron CDP 窗口。网络响应出现 `Punish-Type: sigchl`、网易盾或其他挑战时立即暂停，由员工完成验证，再继续读取当前会话。
- 非 Electron 调试入口默认使用 Playwright + 独立持久化 profile。

`chrome-devtools-mcp` 只用于开发诊断，不属于安装包运行时。安装包中的 CDP 能力由 `browser/electron-cdp-session.ts` 实现。

## LLM 职责

LLM 当前参与两处：

1. 从页面可见文字、链接和业务网络 JSON 中抽取统一候选公告。
2. 判断产品相关性、投标可能性、硬性条件、缺失信息和建议动作。

确定性代码继续负责安全挑战检测、URL 白名单、日期格式、过期判断、结果公告排除和输出结构校验。

## 开发命令

```bash
npm run typecheck
npm test
npm run build
npm run check
npm run start:electron
```

Windows 安装包：

```bash
npm run package:win
```

## 保留的本地接口

- `GET /health`
- `GET /site-profiles`
- `GET|POST /settings/llm`
- `POST /settings/llm/test`
- `GET|POST /tasks`
- `POST /tasks/:id/agent-run`
- `POST /tasks/:id/continue-run`
- `GET /tasks/:id/collection-report`
- `POST /tasks/:id/upload`
- `POST /cloud/pair`
- `GET /agent-runs`
- `GET /agent-runs/:id`

旧 scheduler、priority board、feedback learning、旧任务页和云端任务执行通道已经移除。
