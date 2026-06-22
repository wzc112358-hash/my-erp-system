# PRD: ERP Agent 系统 v1 - 商机监测与商机报价闭环

日期：2026-05-25

状态：待用户评审

## Problem Statement

公司当前 ERP 已经能记录销售、采购合同、投标记录、发票、收付款、运输、库存等业务信息，但它主要承担“业务发生后的登记与查询”职责，尚未覆盖“商机发现、初筛、分派、确认、报价预审”的前置流程。

化工商贸业务中，销售和采购人员每天需要人工查看多个招投标网站，并在微信群里汇报每个网站是否有新信息。该流程存在明显成本和风险：

- 员工每天重复打开多个网站，人工巡检成本高。
- “当天无新增”“网站打不开”“公告已过截止期”等状态只在微信群里表达，没有结构化记录。
- 微信群消息容易被覆盖，后续查找标书、截止日期、员工判断、王总意见非常困难。
- 同一个公告可能被多人重复发现，也可能因为人工疏漏错过。
- 对化工助剂类标的硬性要求判断依赖员工经验，例如是否允许代理商、是否要求第三方检测、是否要求业绩、是否要求中石油/中石化 8 位码、是否涉及危化品资质、是否限制生产商。
- 王总需要做投标与否的判断，但当前决策材料分散在网站、标书、微信群和员工口头说明里。
- 现有 ERP 里的投标记录更偏结果记录，无法自然承接从“公告发现”到“是否报价”的前置闭环。

用户希望构建一个整体 Agent 系统，第一阶段优先解决商机监测和商机报价闭环问题，让 ERP 成为商机处理主入口，让 Agent 负责发现、整理、初筛、提醒、分派和留痕，让员工和王总负责关键判断。

同时，用户可以将云服务器升级到 2C2G 或更高配置，因此 Agent 后端可以采用比原先更完整的队列、浏览器池、文档解析 worker 和可观测性设计，但仍需避免无意义的高频抓取和不稳定的“万能爬虫”方案。

## Solution

构建“中心 Agent 后端 + 网站采集工具 + ERP 页面 + 人工协助通道 + 后续本地采集助手”的 ERP Agent 系统 v1。

系统的第一阶段聚焦商机监测和报价前置闭环：

1. 员工或管理员在 ERP 中配置监测源，包括站点名称、负责人、入口地址、巡检栏目、关键词、产品范围、登录方式、是否需要验证码、巡检频率和采集策略。
2. 中心 Agent 后端按固定时间巡检各招投标网站，例如 09:00、12:00、15:00、17:30。
3. Agent 按站点策略选择采集方式：HTTP/JSON、HTML parser、Playwright/CDP、人工协助、本地采集助手。
4. Agent 的搜索方式采用“先按栏目和日期拉取候选公告，再判断是否为化工品/化工助剂相关商机”的策略。站内关键词搜索只作为补充，不作为唯一入口，避免漏掉新产品、新叫法或标题不规范的公告。
5. Agent 对公告做标准化提取，包括标题、链接、发布时间、截止日期、采购单位、项目编号、产品关键词、附件链接、原始 HTML/JSON、截图等。
6. Agent 对公告去重，不重复打扰负责人。
7. Agent 对公告做化工品相关性判断。只要公告大概率是化工品、化工助剂、化工原料、催化剂、油品、危险化学品或公司历史做过/关注过的产品，就先保留进入商机池；是否真正能做再由员工和王总判断。
8. Agent 对保留下来的公告继续提取硬性投标条件和风险点，例如是否允许代理商、是否要求第三方检测、业绩要求、8 位码、危化品资质、生产商限制、截止日期紧急程度。
9. 负责人在 ERP 的“我的待判断”中确认商机状态：可关注、不相关、需王总判断、需补标书、已错过截止。
10. 遇到登录、验证码、短信、CA、买标书、无法自动下载附件时，Agent 不绕过验证，而是在 ERP 中创建人工协助任务。
11. 员工上传标书、截图或复制公告正文后，Agent 继续解析资料并补全初筛结果。
12. 对员工标记为可关注或需王总判断的商机，系统自动生成王总确认包。
13. 王总在确认台查看确认包，判断是否推进报价。
14. 确认推进后，商机进入后续报价预审、采购询价和投标记录流程。
15. 微信群第一阶段只保留摘要提醒，正式处理入口回到 ERP。

MVP 分阶段交付：

### MVP 0: 资料治理与监测源注册

目标是将现有群公告和员工文档中的分工、网址、栏目、关键词、登录要求结构化录入 ERP。

交付内容：

- 监测源配置模型。
- 负责人分工初始化。
- 采集策略枚举。
- 站点风险等级。
- 产品关键词和常做产品清单。
- 化工品相关性词库，包括 ERP 历史合同产品、微信群历史商机产品、通用化工品形态词、员工确认后的别名词。
- 负向词库，包括明显工程施工、设备维修、纯服务、非化工材料等低相关公告特征。
- 词库反馈机制，员工将商机改为“不相关”或“可关注”后，系统可沉淀为后续判断依据。
- 凭据引用字段，禁止明文密码进入代码和普通业务表。

### MVP 1: 公开站点自动巡检

目标是让系统真正自动发现公开商机，并生成可信巡检记录。

优先站点：

- 国能 E 招。
- 国能 E 购。
- 中化 SCM。
- 易派客/中石化公开公告。
- 中海油公开公告。
- 兵器/华锦公开列表。

交付内容：

- 定时巡检。
- 成功、失败、无新增的巡检记录。
- 按日期和栏目拉取候选公告，而不是只搜索固定产品词。
- 标题、链接、发布时间、截止期、采购单位、项目编号提取。
- 化工品相关性初筛，并保留“匹配词、匹配来源、置信度、证据文本”。
- 去重入库。
- 商机池展示。
- 失败提醒。

### MVP 2: 详情解析、附件上传与人工协助

目标是让商机不只是标题，而是能支持员工判断。

交付内容：

- 详情页正文抓取。
- 附件链接登记。
- PDF、Word、截图上传。
- 文档解析和 OCR。
- LLM 提取硬性条件，并保留依据片段。
- 人工协助任务。
- 员工确认队列。

### MVP 3: 本地采集助手试点

目标是处理登录、验证码、买标书和服务器访问不稳定的问题。

试点站点：

- 云梦泽。
- 中石油。
- 兵器/华锦登录详情。
- 隆道云登录详情。
- 易派客登录详情。

交付内容：

- 本地助手登录 ERP。
- 拉取员工采集任务。
- 打开或连接员工本机浏览器。
- 员工手动登录和验证。
- 助手采集 DOM、网络响应、附件和截图。
- 上传资料到 ERP。

### MVP 4: 王总确认包与报价闭环

目标是将“发现商机”推进到“是否报价”的可复盘决策。

交付内容：

- 王总确认台。
- 确认包生成。
- 历史中标公示补充。
- 员工自评。
- 王总推进或放弃决策。
- 推进后创建报价预审任务。
- 与现有投标管理记录衔接。

### MVP 5: 采购、财务与经营 Agent 扩展

目标是在商机闭环稳定后扩展到公司更大范围的经营辅助。

交付内容：

- 采购供应商推荐。
- 历史采购价对比。
- 合同毛利测算草稿。
- 应收应付提醒。
- 税票状态提醒。
- 商机来源、员工处理及时率、报价成功率、放弃原因统计。

## User Stories

1. As a sales employee, I want the ERP to show new bid opportunities from my assigned websites, so that I do not need to manually check every website several times per day.
2. As a sales employee, I want the system to record that a website was checked even when there are no new opportunities, so that I do not need to send repetitive “today no new bids” messages in WeChat.
3. As a sales employee, I want failed website checks to be clearly marked as failed, so that a failed crawl is not mistaken for “no new opportunities”.
4. As a sales employee, I want each new opportunity to show title, link, publish time, deadline, buyer, project number, and source website, so that I can quickly decide whether to inspect it.
5. As a sales employee, I want duplicate announcements to be merged or ignored, so that I am not interrupted multiple times for the same opportunity.
6. As a sales employee, I want opportunities related to chemical additives and common company products to be highlighted, so that I can focus on likely relevant business.
7. As a sales employee, I want obviously unrelated announcements to be de-prioritized but still searchable, so that the system does not hide edge cases permanently.
8. As a sales employee, I want the system to flag urgent deadlines, so that I can prioritize opportunities that may close soon.
9. As a sales employee, I want to confirm an opportunity as “可关注”, so that it can move toward Wang’s review or quotation preparation.
10. As a sales employee, I want to mark an opportunity as “不相关”, so that it stops appearing in my active queue.
11. As a sales employee, I want to mark an opportunity as “需王总判断”, so that uncertain but potentially valuable opportunities are escalated.
12. As a sales employee, I want to mark an opportunity as “需补标书”, so that the system records that more documents are needed before a decision.
13. As a sales employee, I want to mark an opportunity as “已错过截止”, so that late opportunities are not handled as active work.
14. As a sales employee, I want to upload a tender document, screenshot, or copied announcement text, so that Agent can continue extracting requirements from manually obtained materials.
15. As a sales employee, I want the ERP to show the original source link and captured evidence, so that I can verify Agent conclusions.
16. As a sales employee, I want Agent to explain why it thinks an opportunity is related, so that I can trust or correct its classification.
17. As a sales employee, I want Agent to flag whether agents/distributors are allowed, so that I can quickly judge whether our company can participate.
18. As a sales employee, I want Agent to flag whether third-party testing reports are required, so that I know whether qualification materials are needed.
19. As a sales employee, I want Agent to flag whether historical performance is required, so that I can check whether our past contracts meet the requirement.
20. As a sales employee, I want Agent to flag whether a PetroChina or Sinopec 8-digit material code is required, so that I can judge whether our registration status is sufficient.
21. As a sales employee, I want Agent to flag whether hazardous chemical qualification is involved, so that I can check our registration and certificate scope.
22. As a sales employee, I want Agent to flag whether only manufacturers can bid, so that I can decide whether to still study the opportunity or escalate it.
23. As a sales employee, I want low-confidence extraction results to be marked clearly, so that I know which fields require manual confirmation.
24. As a sales employee, I want my pending queue to include only tasks assigned to me, so that I can work through responsibilities efficiently.
25. As a purchasing employee, I want confirmed opportunities to contain product specifications and technical parameters, so that I can start supplier inquiry faster.
26. As a purchasing employee, I want to see historical suppliers and purchase references for a confirmed product, so that I can compare supplier options.
27. As a purchasing employee, I want the system to preserve buyer requirements and deadline information, so that I can align supplier inquiry with bid constraints.
28. As a purchasing employee, I want import-related opportunities to be labeled when foreign suppliers may be needed, so that import process risks can be considered early.
29. As a manager, I want a confirmation console that only shows opportunities requiring my decision, so that I do not need to read every raw website announcement.
30. As a manager, I want each confirmation package to include title, buyer, deadline, product, technical parameters, historical awards, employee self-assessment, and Agent risk tags, so that I can decide whether to proceed.
31. As a manager, I want to approve moving an opportunity into quotation preparation, so that the business can continue with procurement and pricing.
32. As a manager, I want to reject or pause an opportunity with a reason, so that the team can learn why it was not pursued.
33. As a manager, I want to see who reviewed each opportunity and when, so that accountability is clear.
34. As a manager, I want to see missed deadlines and failed crawls by source, so that I can identify process or tool problems.
35. As a manager, I want to see daily source coverage, so that I know whether all assigned websites were checked.
36. As a manager, I want to see opportunity source statistics, so that I can understand which websites produce useful business.
37. As a manager, I want to see employee handling timeliness, so that responsibilities can be managed fairly.
38. As an admin, I want to create and edit monitor sources, so that new websites can be added without code changes whenever possible.
39. As an admin, I want to assign each monitor source to an owner, so that new opportunities go to the correct employee.
40. As an admin, I want to configure crawl frequency and crawl strategy per source, so that easy public sources and difficult login sources can be handled differently.
41. As an admin, I want to mark a source as requiring login or captcha, so that the system can create manual tasks instead of repeatedly failing.
42. As an admin, I want to disable a source temporarily, so that broken or obsolete websites do not pollute daily runs.
43. As an admin, I want credentials to be referenced securely rather than stored as plain text in business records, so that account information is protected.
44. As an admin, I want each Agent action to be recorded in audit logs, so that system behavior can be investigated later.
45. As an admin, I want crawler failures to include error type and evidence, so that debugging is practical.
46. As an admin, I want to rerun a failed monitor source manually, so that temporary failures can be retried.
47. As an admin, I want to inspect raw HTML, JSON, screenshots, and downloaded files for a crawl, so that extraction issues can be diagnosed.
48. As an admin, I want site adapters to be isolated by source, so that one broken website does not break all monitoring.
49. As an Agent operator, I want a queue for crawl jobs, parse jobs, document jobs, classification jobs, and notification jobs, so that work is retried and throttled safely.
50. As an Agent operator, I want browser jobs to run with limited concurrency, so that server resources remain stable even after upgrading to 2C2G or higher.
51. As an Agent operator, I want HTTP/API-based sources to avoid browser usage, so that crawls remain fast and resource-light.
52. As an Agent operator, I want Playwright/CDP to be used for SPA or network-capture sources, so that dynamic sites can still be handled.
53. As an Agent operator, I want document parsing jobs to run asynchronously, so that large PDFs or OCR work do not block website monitoring.
54. As an Agent operator, I want LLM calls to be traceable and evidence-bound, so that hallucinated conclusions are easier to catch.
55. As an employee, I want a manual assist task when a site requires login or captcha, so that I can help Agent continue without the system attempting unsafe bypasses.
56. As an employee, I want a future local helper to use my own browser session, so that login and captcha can happen naturally on my computer.
57. As an employee, I want the local helper to upload only task-related artifacts, so that unrelated browser data is not exposed.
58. As an employee, I want WeChat group summaries to be copyable from ERP, so that existing team habits can continue during transition.
59. As a manager, I want WeChat summaries to be only reminders, so that ERP remains the official record.
60. As a team member, I want all decisions and documents to remain searchable in ERP, so that future similar bids can reuse knowledge.
61. As a team member, I want historical winning announcements to be attached to decision packages, so that we can compare prior market outcomes.
62. As a team member, I want manufacturer-only opportunities to be retained as learning material when relevant, so that the company can build market knowledge even if it cannot bid immediately.
63. As a team member, I want opportunities that require missing qualifications to be tagged, so that qualification gaps become visible over time.
64. As a finance user, I want confirmed opportunities to later connect with quotation, contract, invoice, payment, and profit data, so that business results can be analyzed end to end.
65. As a finance user, I want financial automation to remain out of the first release, so that high-risk money and tax workflows are not automated before the opportunity workflow is reliable.
66. As the business owner, I want the first MVP to prove real monitoring value on a few high-confidence public sources, so that the team gains trust before expanding to harder login sites.
67. As the business owner, I want the architecture to support more complex backend logic after server upgrade, so that future crawling, parsing, and local helper work does not require a rewrite.
68. As a sales employee, I want Agent to keep any notice that appears to be a chemical product even if it is not in our existing product list, so that new product opportunities are not missed.
69. As a sales employee, I want Agent to separate “chemical relevance” from “can we bid”, so that potentially useful market information is preserved even when hard requirements may later block us.
70. As a sales employee, I want Agent to show whether relevance came from ERP contracts, group chat history, general chemical vocabulary, or document content, so that I can judge the reliability of the match.
71. As an admin, I want to maintain positive and negative keyword dictionaries, so that the relevance engine can improve as employees correct results.
72. As an Agent operator, I want each monitor source to define its exact columns, categories, date filters, and site search behavior, so that website-specific crawling can be implemented without changing business logic.
73. As a manager, I want employee corrections to feed future relevance rules, so that the system becomes closer to company judgment over time.

## Implementation Decisions

- Build the PRD around the first production slice:商机监测与商机报价闭环. Procurement, finance, and broader经营分析 are designed as later extensions.
- Treat ERP as the source of truth. WeChat is a reminder channel only, not the official workflow state.
- Build Agent backend as an independent service that communicates with PocketBase via authenticated API access.
- Define the core monitoring search policy as “broad candidate collection, chemical relevance retention, human bidability decision”. Agent should first collect recent notices from assigned categories by date, then retain notices that look like chemical products. It should not limit discovery to known product names only.
- Treat “is chemical product or chemical-adjacent opportunity” as the first filter. Treat “can our company operate this bid” as a later review step that uses documents, hard requirement extraction, employee judgment, and manager confirmation.
- Build a Product Intelligence module as a deep module. Its interface returns a maintained product vocabulary from ERP contract product names, bidding record product names, historical group chat products, manually curated aliases, and employee feedback.
- Seed Product Intelligence from current ERP data: 凡士林脂, 引发剂, 白油. Exclude obvious test values such as 测试, t, 不含税测试.
- Seed Product Intelligence from the provided group chat examples: 亚硫酸钠, 抗静电剂, 脱硝催化剂, 焦亚硫酸钠, 起泡剂, 捕收剂, 二氧化碳脱硫催化剂, 脱氢催化剂, 二甲基二硫, 4,4'-亚甲基二(N-仲-丁基环己胺), 紫外线吸收剂, DMPP 硝化抑制剂, 碳酸铵, 阻聚剂, 碳酸氢钠, 苯基三甲氧基硅烷, 六甲基二硅氧烷, 碳酸二甲酯, 2-硝基二苯胺, 磷酸二氢镁, 表面活性剂 ST-80.
- Maintain a general chemical relevance vocabulary separate from company product history. Initial signals include 剂, 钠, 酸, 酯, 醇, 胺, 烷, 烯, 酮, 醚, 酚, 盐, 硫, 磷, 氯, 氟, 硅, 碳, 氢, 氧, 氮, 催化剂, 抑制剂, 吸收剂, 阻聚剂, 表面活性剂, 起泡剂, 捕收剂, 助剂, 油品, 树脂, 危化品, 化工.
- Maintain a negative relevance vocabulary and structural filters for notices that are likely not product opportunities, such as pure construction projects, civil engineering, office services, building maintenance, non-chemical equipment repair, IT services, property services, training, auditing, and logistics-only notices. Negative filters should de-prioritize rather than permanently delete unless confidence is high.
- Store relevance results as structured fields: relevance_status, relevance_score, matched_terms, matched_sources, evidence_text, negative_terms, classification_version, and needs_human_check.
- Use a staged relevance algorithm. Stage 1 uses deterministic keyword and pattern matching on title/list metadata. Stage 2 fetches detail text and attachment names when Stage 1 is ambiguous. Stage 3 uses LLM extraction only on retained or ambiguous candidates, with evidence snippets required.
- For high-recall MVP behavior, retain any candidate with moderate chemical relevance. The cost of a few false positives is acceptable; missed chemical opportunities are worse than extra employee review in the early phase.
- Use a task queue architecture for the upgraded server target. A 2C2G server can support Redis/BullMQ or an equivalent queue with controlled concurrency. Browser jobs must still be throttled separately from HTTP jobs.
- Use separate queues or job types for monitor runs, crawl jobs, detail fetch jobs, document parse jobs, LLM extraction jobs, notification jobs, and local-helper upload processing.
- Implement a Source Registry module as a deep module. Its interface maps a monitor source to crawl strategy, schedule, owner, required categories, category URLs, date filter behavior, site search behavior, keywords, login/captcha flags, and credential reference.
- Implement a Strategy Resolver module as a deep module. Its interface receives a monitor source and returns the correct adapter plan: HTTP JSON, HTTP HTML, Playwright DOM, Playwright network capture, manual assist, or local helper.
- Implement crawler adapters as isolated modules per site or per site family. A broken adapter must not affect unrelated sources.
- Prefer HTTP/JSON/HTML extraction over browser automation when a site exposes stable public content.
- Use Playwright/CDP for SPA sites, sites requiring network request discovery, and sites where rendered DOM is more reliable than reverse engineering APIs.
- Use Chrome DevTools MCP only for development and site investigation, not as production runtime.
- Use Scrapling or Crawl4AI as optional worker tools where they provide clear value, especially adaptive extraction, markdown conversion, research-style crawling, or document-heavy detail pages.
- Do not bypass captcha, SMS, CA, or explicit login barriers. Generate manual assist tasks or local-helper tasks instead.
- Implement a Manual Assist module as a deep module. Its interface creates structured human tasks with reason, source, opportunity, required artifact type, due time, and completion status.
- Implement a Local Helper Gateway as a later deep module. Its interface lets a local worker authenticate, pull assigned tasks, upload DOM snapshots, network responses, files, screenshots, and completion metadata.
- Implement a Normalization module as a deep module. It converts source-specific notice data into a common opportunity shape with title, source URL, source unique key, project number, buyer, publish time, deadline, category, raw text, and artifacts.
- Implement a Deduplication module as a deep module. It evaluates URL, source unique key, project number, title, buyer, and date to determine whether a notice is new, duplicate, or an update.
- Implement an Artifact Store module. It stores original HTML, JSON, screenshots, PDFs, Word files, OCR output, extracted markdown, and parser results, linked to monitor runs and opportunities.
- Implement a Document Ingestion module. It handles PDF, Word, Excel, images, OCR, text extraction, and normalized extracted text.
- Implement an LLM Extraction module. It must return structured tags with evidence snippets for relevance, product keywords, hard requirements, deadline urgency, and risk notes.
- LLM output is advisory. It must never automatically decide whether to bid.
- Implement Opportunity Review Workflow as a state machine. Core statuses: new, pending_owner_review, not_relevant, worth_following, needs_manager_judgment, needs_documents, missed_deadline, pending_manager_review, approved_for_quote, rejected, archived.
- Existing投标管理 should remain focused on formal bid records. New bid opportunities should feed into it only after manager approval or quotation preparation.
- Add or extend collections for monitor sources, monitor runs, bid opportunities, bid documents, opportunity reviews, agent audit logs, manual assist tasks, crawler artifacts, and local helper sessions.
- Access rules should ensure sales employees see their assigned opportunity queues, purchasing can see approved opportunities relevant to procurement, and managers can see all opportunities and confirmation packages.
- Manager pages should include 商机池, 每日巡检记录, 我的/员工待判断, 王总确认台, and monitoring analytics.
- Sales pages should include personal opportunity review queue and bid opportunity detail pages.
- Purchase pages should later include approved opportunities requiring supplier inquiry.
- The first MVP should initialize monitor assignments from current team responsibilities: 小陈, 小魏, 小冯, 小杨, 小白 and their assigned websites.
- First automated source priority: 国能 E 招, 国能 E 购, 中化 SCM, 易派客公开公告, 中海油公开公告, 兵器/华锦公开列表.
- Second automated/manual hybrid source priority: 云梦泽, 中石油, 隆道云, 裕龙, 能源一号, 延长石油, 东华能源, 金能.
- Initial source configuration should use the current 群公告 as the authoritative owner assignment. Individual employee documents can add site-operation details, but conflicting ownership must be confirmed before production assignment:
  - 小陈: 中石油招投标网, 云梦泽询价网, 能源一号（兰州恒化成）.
  - 小魏: 华锦兵器网. 小魏文档中出现的隆道云, 金能, 中化招标网 should be imported as site-operation knowledge or unassigned/待确认 sources unless the manager confirms they also belong to 小魏.
  - 小冯: 易派客/中国石化物资采购电子商务平台, and any additional sites from the original WPS `.doc` that could not be text-extracted reliably must be confirmed manually before implementation.
  - 小杨: 延长石油, 能源一号（天津宜远）, 中化, 东华能源网, 国能网, 中海油.
  - 小白: 裕龙招投标网, 能源一号（北京恒化成）.
- 中石油招投标网 should monitor 招标公告, 谈判采购公告, 询价(竞价)采购公告. The public entry returns a JavaScript application, so MVP should start with Playwright/CDP investigation to discover list APIs, then prefer HTTP/API if stable. Logged-in details, downloads, captcha, or buying documents should create manual assist or local-helper tasks.
- 云梦泽 should monitor 招标采购 and 非招标采购, including 谈判采购 and 询比采购. Because it requires account login and may require purchasing tender documents, MVP should treat it as manual-assist first, then local-helper. Public list discovery can still run when available, but detailed bid package capture requires employee action.
- 中海油 should monitor 招标公告 and 非招标公告. The entry is a JavaScript application, so use Playwright/CDP investigation first and promote stable network endpoints to HTTP/API adapters when possible.
- 国能 E 招 should monitor 招标公告 and 非招标公告. The provided entry is a public HTML page and should be one of the first MVP automated adapters. Use date/category crawling first, then chemical relevance retention.
- 国能 E 购 should monitor 询价采购公告, 竞价公告, 竞争性谈判公告. The provided entry is public HTML and should be one of the first MVP automated adapters.
- 兵器/华锦 should monitor 招标采购 and 询价交易. Because credentials are documented and details may require login, public list extraction should be tried first; logged-in detail/attachment work should use manual assist or local-helper and must not store plaintext credentials in code.
- 隆道云 should use site search/list browsing after login. Since useful details are available only after login, treat it as local-helper/manual-assist until a stable authenticated API is confirmed.
- 金能 should monitor 公开招标, 招标采购, 直接定价, 竞价公告. The source is historically low yield but should still produce daily coverage records so “无新增/无相关” is captured automatically.
- 中化 SCM should monitor 招标公告, 采购公告, 竞价公告. It supports title keyword search and date browsing. MVP should prefer date/category crawling plus chemical relevance retention, using keyword search only as a second pass for known product terms.
- 易派客/中国石化物资采购电子商务平台 should start from the public supplier portal. Use Playwright/CDP or HTTP investigation to find public notice lists. Any account-only content or 8 位码/material-code detail should create manual assist.
- 延长石油 should include both 延长云采 and 延长石油招采网 sources from the provided WPS document. One probed entry returned HTTP 503 during investigation, so it should be configured with retry, failure evidence, and no-new protection. Public service-platform bulletins can be used as a fallback discovery source when official entries are unstable.
- 裕龙石化 should start from 中国招标投标公共服务平台 or a public search path using “裕龙石化” as site/company filter, then retain chemical product notices. It does not require login according to the provided document.
- 能源一号 should be handled as a special source family because current workflow includes enterprise/group-posted tender information. MVP should not automate personal WeChat reading. Instead, create manual paste/upload intake first, then consider enterprise-approved integration or local-helper capture later.
- 东华能源网 source details are not yet described in the provided documents. It should be registered as a monitor source with owner and unknown strategy, then investigated before inclusion in automated MVP.
- For every website, the default crawl loop should be: open assigned category, constrain by date or latest page, collect candidate notices, normalize list fields, apply dedupe, run chemical relevance retention, fetch detail for retained/ambiguous candidates, then create opportunity or no-new/failed monitor run.
- For every website that supports site search, run site search as a supplement using top product terms from Product Intelligence. The primary search should still be category/date crawling because title search alone can miss chemical opportunities with nonstandard names.
- Scheduled runs default to fixed business times rather than high-frequency polling.
- Failed runs must be recorded as failed and notify the owner. Failed runs must never be counted as “no new opportunities”.
- Every Agent-created or Agent-modified business record must include enough audit metadata to answer what ran, when it ran, what input it used, what output it produced, and whether humans changed it.
- Notifications should begin as ERP-generated copyable WeChat summaries. Enterprise WeChat robot/API integration is a later option.
- Server deployment should support browser dependencies, queue worker processes, and separate worker concurrency settings after upgrade.
- Production configuration must separate PocketBase credentials, Agent service credentials, crawler credentials, LLM keys, and optional local helper tokens.
- Credentials must be referenced by key or secret reference. Plain text credentials must not be written into code or normal business records.
- The system should be designed for replay. A stored raw artifact should be parseable again after parser improvements without re-crawling the website.

## Testing Decisions

- Good tests should verify external behavior and business outcomes, not implementation details. For example, a parser test should assert that a stored sample notice produces the expected normalized opportunity, not that a specific CSS selector was used internally.
- Test the Source Registry and Strategy Resolver as deep modules. Given a source configuration, they should return the expected strategy, schedule, owner, and manual-assist behavior.
- Test each crawler adapter with stored fixtures where possible. Fixtures should include list pages, detail pages, empty result pages, malformed pages, and common failure responses.
- Test HTTP/API adapters separately from browser adapters. HTTP/API adapters should not require browser runtime.
- Test Playwright/CDP adapters with integration tests that can be run selectively. Browser tests should be marked or separated because they are slower and require system dependencies.
- Test Normalization with source-specific input and expected common output.
- Test Deduplication with same URL, same project number, same title and buyer, title variations, updates, and change notices.
- Test Product Intelligence vocabulary loading from ERP contracts, bidding records, curated seed terms, group chat imported examples, aliases, and employee feedback.
- Test chemical relevance retention with real examples from the provided group chat. Notices such as 炼油四部用塑料用抗静电剂, 宁夏电力英力特化工焦亚硫酸钠, 起泡剂/捕收剂, 二氧化碳脱硫/脱氢催化剂, 紫外线吸收剂, DMPP 硝化抑制剂, 阻聚剂, 碳酸氢钠, 苯基三甲氧基硅烷, 碳酸二甲酯, 2-硝基二苯胺, 磷酸二氢镁, 表面活性剂 ST-80 should be retained or marked for human check.
- Test company-history relevance with ERP product examples. Notices matching 凡士林脂, 引发剂, 白油 should be retained with matched_source including ERP history.
- Test that unknown but chemically shaped names are retained with lower confidence rather than discarded.
- Test negative relevance filters with non-chemical construction, service, office, IT, property, and equipment-maintenance notices. These should be de-prioritized or marked not_relevant_candidate, not silently deleted.
- Test that site search supplements category/date crawling. A source with site-search enabled should still produce candidates from date/category pages when no keyword is configured.
- Test Monitor Run behavior for success, no_new, partial_success, and failed. Confirm failed is not treated as no_new.
- Test Artifact Store behavior from the outside: uploaded or captured artifacts can be associated with monitor runs and opportunities and retrieved for review.
- Test Document Ingestion with sample PDF, Word, image, and plain text documents.
- Test LLM Extraction through deterministic fixtures and mocked model responses. Live model tests should be optional and not required for every CI run.
- Test that LLM extraction outputs evidence snippets for each hard requirement tag.
- Test Opportunity Review Workflow transitions, including invalid transitions.
- Test access behavior by role: sales owner queue, purchasing approved opportunities, manager all-opportunity view.
- Test manual assist task lifecycle: created, assigned, completed with artifact, failed, expired.
- Test local helper gateway contract with mocked helper uploads before building full desktop/local automation.
- Test notification summary generation from ERP records, ensuring it matches opportunity pool state.
- Test that duplicate notices do not create duplicate active opportunities.
- Test that urgent deadline classification works around current date and timezone.
- Existing frontend has build and lint scripts but no dedicated unit test framework. For this feature, add tests for pure TypeScript modules if a test runner is introduced; otherwise keep core logic in backend/agent modules where isolated tests are easier to run.
- Existing backend uses Go hooks around PocketBase records. Go tooling is not available in the current execution environment, so backend tests must be run in a properly provisioned development or CI environment.
- Agent service tests should include isolated unit tests for parsers, dedupe, state machine, and scheduler calculations, plus integration tests against a local PocketBase instance.

## Out of Scope

- Automatic decision to bid or not bid.
- Automatic submission of bids.
- Bypassing captcha, SMS verification, CA certificate checks, or website access controls.
- Full automation of普通个人微信群 reading or posting in the first release.
- Automatic tax filing, automatic accounting decisions, or high-risk finance automation.
- Full procurement supplier optimization before商机确认流程 is stable.
- Full local采集助手 rollout to every employee in MVP 1.
- Migrating the entire ERP UI or redesigning unrelated sales, purchase, inventory, invoice, or payment modules.
- High-frequency 5-15 minute monitoring for all sites.
- Using external cloud scraping services for sensitive logged-in tender documents unless explicitly approved later.
- Treating Agent output as legally or commercially final without employee/manager review.

## Further Notes

- Server upgrade changes the recommended backend posture. With 2C2G or higher, the Agent backend can use a queue, separate workers, limited browser pool, document parsing worker, and richer observability. The architecture should still default to HTTP/API crawling whenever possible because it is faster, cheaper, and more stable than browser automation.
- The highest-value MVP path is to prove the system on public or semi-public sources first, especially国能 E 招, 国能 E 购, 中化 SCM, 易派客公开公告, 中海油公开公告, and兵器/华锦公开列表.
- The hardest sources should not block MVP 1. 云梦泽、中石油、隆道云、登录详情、验证码、买标书 and能源一号 can be handled via manual assist first, then local helper.
- The first release should reduce employee burden immediately by replacing repetitive daily “无新增” group messages with system-generated巡检记录 and summary.
- Every important conclusion must be evidence-backed. The system should show the source text or artifact that caused a relevance tag or hard-requirement tag.
- The PRD could not be published to the issue tracker in the current environment because the GitHub CLI is not installed. The intended issue label is `ready-for-agent`.
