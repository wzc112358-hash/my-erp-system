# Domain context

## Collection Run

一次站点巡检从采集到筛选报告的完整生命周期。运行只能经过 `collection/pipeline.ts`，HTTP、Electron 和计划入口不得自行拼装采集步骤。

## Site Definition

一个站点的入口、负责人、产品范围、采集方式、浏览器引擎、人工接管信号和 LLM 抽取提示。所有站点定义集中在 `sites/registry.ts`。

## Public Collector

读取站点稳定公开 JSON、feed 或 HTML 的确定性实现。只有公开数据真实存在时才为站点增加 collector。

## Browser Session

员工可见、可接管并能复用登录状态的浏览器会话。当前有 Playwright 和 Electron CDP 两个 adapter。

## Human Takeover

站点出现登录、验证码、安全挑战或页面无法稳定识别时，Collection Run 暂停但保留 Browser Session。员工处理完成后从同一会话继续。

## Candidate Bundle

从公开数据、页面、链接或网络响应中抽取的原始候选公告集合。它必须保留原文证据，尚未代表最终需要发送的信息。

## Screened Notice

候选公告经过产品范围与 LLM 判断后的内部结构。界面最终只展示由它生成的筛选报告，不展示历史“商机卡片”功能。

## Collection Report

员工可复制或上传的最终输出，只包含当前仍可参与、与公司产品相关的信息，或者明确的“本次无相关信息”结论。
