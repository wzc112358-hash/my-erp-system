  2. 做本地助手任务窗口 MVP：配对后展示云端任务列表；点击任务打开任务详情；显示入口 URL、操作步骤、搜索词、状态、最近截图/日志；提供“打开采集浏览器”“我已完成登录/验证码，继续采集”“取消/失败”。
  3. 做本地结果回灌闭环：agent-service 增加 artifact ingestion，把 candidate_bundle 转成候选公告，走现有 processCandidatesWithEnhancement，再 upsert 到 bid_opportunities，并更新
     agent_tasks 状态。
  4. 做第一个真实站点 pilot：建议先用华锦兵器网，因为已有 harness 边界。验收标准是：ERP 生成任务 → 本地助手拉取 → 员工登录/验证 → 点击继续 → 采集出候选公告 → ERP 商机池出现待判断记
     录。
  5. 再补 cloud_then_local：延长石油、裕龙这类先云端 Playwright/网络探测，失败时必须生成本地助手任务，不能静默 no_new。
  6. 最后做发布和运维：Windows 免安装包/安装包、自动更新或版本提示、配对设备管理、心跳离线提醒、日志和截图 artifact 管理。