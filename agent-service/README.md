# ERP Opportunity Agent

Cloud-side bid opportunity monitor for the ERP system.

## Scope

- Reads cloud-managed `monitor_sources` from PocketBase.
- Only runs the public 国能网 cloud collection path.
- Creates `monitor_runs` records for due runs.
- Normalizes, deduplicates, and classifies detected bid notices.
- Creates `bid_opportunities` for new relevant notices.
- Prints a WeChat-ready group summary.

Sites that require login, captcha handling, or employee browser context now run
inside the standalone local helper app instead of this cloud service.

## Commands

```bash
npm test
npm run run-once -- --force
npm run run-once -- --dry-run-json
```

Required environment variables for real PocketBase writes:

```bash
POCKETBASE_URL=https://api-beijing.henghuacheng.cn
POCKETBASE_SUPERUSER_EMAIL=...
POCKETBASE_SUPERUSER_PASSWORD=...
COLLECTOR_SERVICE_URL=http://collector-service:8096
```

Run a public URL extraction dry run without writing to PocketBase:

```bash
npm run run-once -- --public-url "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html" --source-name "国能E招" --owner-name "小杨"
```
