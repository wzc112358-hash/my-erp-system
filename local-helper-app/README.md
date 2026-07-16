# 恒化成本地采集助手

面向员工的 Electron 招投标巡检应用。当前覆盖国能 E 购、易派克、裕龙招投标网、中国石油招标投标网、中化采购供应链平台和云梦泽智慧平台。

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
      → LLM 列表初筛
      → 相关公告详情 + PDF.js 文本 + OCR 扫描件
      → 产品范围匹配 + LLM 最终判断
  → 筛选报告
  → 一键复制 / 可选上传云端
```

登录、验证码、安全挑战和员工接管都只发生在本机。LLM 输入不包含 Cookie、Authorization 或账号密码。

## 代码结构

```text
src/
  app/         本地 HTTP 工作台、任务状态、配置、云端上传
  browser/     BrowserSession、页面/文档抽取、Electron CDP、Playwright、OCR
  collection/  单一采集运行管线和运行日志
  domain/      产品知识、筛选结果、最终报告
  llm/         OpenAI-compatible 客户端、网页抽取、招投标判断
  sites/       六个站点的统一 registry、搜索旅程、详情读取和公开数据 collector
  shell/       Electron 外壳与深链
  renderer/    最小化静态界面
```

新增站点时先在 `sites/registry.ts` 声明采集方式。只有存在稳定公开数据时才扩展 public collector；其他站点复用 BrowserSession 和 LLM 抽取。

## 浏览器策略

- 国能 E 购：公开 JSON/feed + 产品词深搜。
- 易派克：公开 HTML 公告列表。
- 裕龙：默认使用 Electron CDP 窗口。搜索固定为“裕龙石化 + 招标公告”，不再采集中标候选人/中标结果。验证完成后从当前 WebContents 原地恢复，不重新加载入口。
- 裕龙详情：只打开初筛相关公告，读取站点已经解密的 Vue 状态、PDF 地址和 PDF.js 正文；扫描 PDF 再调用配置的 OCR。
- 中国石油：按产品词搜索；验证码由员工在持久化浏览器中完成，随后自动读取相关公告详情。
- 中化：读取近期公开列表，DeepSeek 判断已知/新化工品，只为相关候选读取 PDF 或调用 OCR。
- 云梦泽：按产品词搜索整卡状态，排除计划、结果和已截止公告；详情新窗口由 Browser Session 自动跟随并读取 PDF.js。
- 非 Electron 调试入口默认使用 Playwright + 独立持久化 profile。

`chrome-devtools-mcp` 只用于开发诊断，不属于安装包运行时。安装包中的 CDP 能力由 `browser/electron-cdp-session.ts` 实现。

## LLM 职责

LLM 当前参与三处：

1. 从页面可见文字、链接和业务网络 JSON 中抽取统一候选公告。
2. 对列表做低成本初筛，只让相关化工采购进入详情读取。
3. 结合详情/PDF/OCR 正文判断产品相关性、投标可能性、硬性条件、缺失信息和建议动作。

确定性代码继续负责安全挑战检测、URL 白名单、日期格式、过期判断、结果公告排除和输出结构校验。

## OCR

- 生产安装包建议配置百度 OCR。API Key 和 Secret Key 只保存在员工电脑的本地配置中，健康检查、界面读取、运行日志和云端报告都不会返回密钥。
- PaddleOCR 适合已经安装 Python/Paddle 环境的开发机或专用工作站。应用调用 `paddleocr ocr` 命令，不把 Python、模型或 GPU 运行时塞进 Electron 安装包。
- 文本型 PDF 优先由浏览器 PDF.js 读取；只有正文不足时才调用 OCR。
- 每条完成详情读取的结果会标明“百度 OCR”“PaddleOCR”或“PDF/网页正文”；读取失败也会明确显示，不再仅凭 OCR 配置状态推断本次是否调用。

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
HCZ_RELEASE_DIR=release-user npm run package:release
```

## 保留的本地接口

- `GET /health`
- `GET /site-profiles`
- `GET|POST /settings/llm`
- `POST /settings/llm/test`
- `GET|POST /settings/ocr`
- `POST /settings/ocr/test`
- `GET|POST /tasks`
- `DELETE /tasks/:id`
- `POST /tasks/:id/agent-run`
- `POST /tasks/:id/continue-run`
- `GET /tasks/:id/collection-report`
- `POST /tasks/:id/upload`
- `POST /cloud/pair`
- `GET /agent-runs`
- `GET /agent-runs/:id`

旧 scheduler、priority board、feedback learning、旧任务页和云端任务执行通道已经移除。
