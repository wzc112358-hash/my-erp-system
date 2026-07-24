# ERP 招投标采集服务

这是 ERP 内部的公开招投标信息服务。它复用本地助手已经验证过的公开接口适配，但不包含 Electron、员工分配、人工审核或验证码绕过。

## 工作流

1. 每天北京时间 08:00 后依次低频巡检 10 个公开站点。
2. 用公司产品词库做规则召回，再用 OpenAI 兼容模型筛选新化工产品。
3. 对每个站点优先级最高的 6 条候选读取公开详情/附件；扫描 PDF 可选百度 OCR。
4. 以站点和公告身份生成唯一指纹。同一公告只更新最后发现时间，正文变化时更新原记录。
5. 清理超过 30 天未再次发现的公告和巡检记录。

## 命令

```bash
npm test
npm run run-once
npm run run-once -- --source=guoneng-egou,cnooc
npm start
```

## 环境变量

```bash
POCKETBASE_URL=https://api-beijing.henghuacheng.cn
POCKETBASE_SUPERUSER_EMAIL=...
POCKETBASE_SUPERUSER_PASSWORD=...

HCZ_LOCAL_AGENT_LLM_BASE_URL=https://api.deepseek.com
HCZ_LOCAL_AGENT_LLM_API_KEY=...
HCZ_LOCAL_AGENT_LLM_MODEL=deepseek-v4-pro

BAIDU_OCR_API_KEY=...
BAIDU_OCR_SECRET_KEY=...
BAIDU_OCR_PDF_PAGES=3
```

`run-once` 是人工运维命令，会强制执行；常驻服务按 `bid_sources.schedule_time` 判断是否到期。
