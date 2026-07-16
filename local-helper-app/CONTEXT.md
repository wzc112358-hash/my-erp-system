# Domain context

## Collection Run

一次站点巡检从采集到筛选报告的完整生命周期。运行只能经过 `collection/pipeline.ts`，HTTP、Electron 和计划入口不得自行拼装采集步骤。

## Site Definition

一个站点的入口、负责人、产品范围、采集方式、浏览器引擎、人工接管信号和 LLM 抽取提示。所有站点定义集中在 `sites/registry.ts`。

## Public Collector

读取站点稳定公开 JSON、feed 或 HTML 的确定性实现。只有公开数据真实存在时才为站点增加 collector。

## Product Query Plan

从 ERP 当前/历史产品、群聊高频产品和产品别名生成的有限查询集合。产品事实由本地知识表维护；LLM 发现的新产品只能作为待确认机会，不能直接改写产品事实。

## Browser Journey

复杂站点声明式的列表阶段流程：打开入口、按词搜索或读取最新公告、翻页、识别人工挑战并生成 Candidate Bundle。站点差异放在 Site Definition 和少量页面能力中，不复制 Collection Run。

## Browser Session

员工可见、可接管并能复用登录状态的浏览器会话。当前有 Playwright 和 Electron CDP 两个 adapter。

## Human Takeover

站点出现登录、验证码、安全挑战或页面无法稳定识别时，Collection Run 暂停但保留 Browser Session。员工处理完成后从同一会话继续。

## Candidate Bundle

从公开数据、页面、链接或网络响应中抽取的原始候选公告集合。它必须保留原文证据，尚未代表最终需要发送的信息。

## Screened Notice

候选公告经过产品范围与 LLM 判断后的内部结构。界面最终只展示由它生成的筛选报告，不展示历史“商机卡片”功能。

## Document Evidence

只为列表初筛保留的候选读取公告详情。正文优先来自员工浏览器中已解密的 Vue/PDF.js 状态，扫描件再由本地配置的 OCR Provider 识别。详情验证暂停时必须保留 Candidate Bundle 和 Screened Notice，验证后从当前详情继续。

## OCR Provider

文档识别的本机配置边界。生产默认使用百度 OCR；PaddleOCR 只在电脑已安装对应命令和模型时启用。凭据不得进入任务、日志、截图元数据或云端报告。

## Collection Report

员工可复制或上传的最终输出，只包含当前仍可参与、与公司产品相关的信息，或者明确的“本次无相关信息”结论。
