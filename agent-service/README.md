# ERP Opportunity Agent

Standalone v1 service for bid opportunity monitoring.

## What it does

- Reads `monitor_sources` from PocketBase.
- Creates a `monitor_runs` record for each due source.
- Normalizes, deduplicates, and classifies detected bid notices.
- Creates `bid_opportunities` for new notices.
- Prints a WeChat-ready group summary.

The first version is deliberately conservative. Sources that require login,
captcha handling, or custom selectors can be marked `manual_required`; the
agent still records a run so daily monitoring accountability remains visible.

## Commands

```bash
npm test
npm run run-once -- --force
```

Required environment variables for real PocketBase writes:

```bash
POCKETBASE_URL=https://api-beijing.henghuacheng.cn
POCKETBASE_SUPERUSER_EMAIL=...
POCKETBASE_SUPERUSER_PASSWORD=...
```

Set `OPPORTUNITY_AGENT_SAMPLE_MODE=1` to generate deterministic sample notices
for validating the pipeline before site-specific crawlers are configured.

Run a local dry run without connecting to PocketBase:

```bash
npm run run-once -- --dry-run-json
```

The dry run prints candidate opportunities with relevance evidence fields such
as `matched_terms`, `matched_sources`, `evidence_text`, `relevance_score`, and
`classification_version`.

Run a public URL extraction dry run without writing to PocketBase:

```bash
npm run run-once -- --public-url "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html" --source-name "国能E招" --owner-name "小杨"
npm run run-once -- --public-url "https://neep.shop/html/portal/index-Inquiries.html" --source-name "国能E购" --owner-name "小杨"
```
