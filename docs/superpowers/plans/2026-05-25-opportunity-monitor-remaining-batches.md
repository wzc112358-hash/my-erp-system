# Opportunity Monitor Remaining Batches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining MVP slices after public HTML source collection: detail-page enrichment, uploaded/manual document ingestion, manual-assist/local-helper task records, and manager confirmation packages.

**Architecture:** Keep the production-critical path conservative. HTTP list adapters collect candidate notices; optional detail enrichment adds body text and attachment links before relevance classification. Manual and local-helper work are represented as structured ERP tasks and documents, not as unsafe captcha/login bypasses. Manager confirmation packages are deterministic summaries assembled from opportunity, documents, reviews, and risk tags.

**Tech Stack:** Node.js `node:test` Agent service modules, PocketBase JS migrations, Go hooks, TypeScript React frontend with Ant Design.

---

## Batch 3: Detail Page Enrichment

**Files:**
- Create `agent-service/src/domain/detail.js`
- Create `agent-service/src/domain/detail.test.js`
- Modify `agent-service/src/adapters/http-html-adapter.js`
- Modify `agent-service/src/adapters/http-html-adapter.test.js`
- Modify `agent-service/src/domain/candidate.js`

**Scope:**
- Fetch notice detail pages for HTTP/HTML sources when a candidate URL is available.
- Extract readable detail text, publish date, deadline, buyer, project number, and attachment URLs.
- Merge detail information into raw candidates before relevance classification.

**Verification:**
- `cd agent-service && npm test`
- `npm run run-once -- --public-url <reachable-list-url>` exits 0.

## Batch 4: Manual Document/Text Ingestion

**Files:**
- Create `agent-service/src/domain/document-ingestion.js`
- Create `agent-service/src/domain/document-ingestion.test.js`
- Modify `agent-service/src/index.js`
- Add PocketBase migration for `bid_documents.extracted_text`, `bid_documents.extraction_status`, `bid_documents.evidence_text`.
- Modify frontend types/API/page to show document extraction fields and add a copy-text upload shortcut.

**Scope:**
- Support pasted/copied announcement or tender text as a document record.
- Extract hard requirements and chemical relevance evidence from manual text.
- Provide a dry-run command for local verification without PocketBase.

**Verification:**
- `cd agent-service && npm test`
- `npm run run-once -- --document-text "..." --document-title "..."` prints extracted JSON.
- `node --check` for new migration.
- `cd frontend && npm run build`

## Batch 5: Manual Assist and Local Helper Task Records

**Files:**
- Add PocketBase migration for `agent_tasks`.
- Create `agent-service/src/domain/manual-assist.js`
- Create `agent-service/src/domain/manual-assist.test.js`
- Modify `agent-service/src/index.js`
- Modify frontend types/API/page to show pending manual tasks.

**Scope:**
- When a source requires login/captcha/local-helper/manual handling, create one structured `agent_tasks` record instead of silently skipping.
- Task fields include source, opportunity, owner, task type, reason, required artifact, status, due time, and result summary.
- Add a local-helper polling shape for future desktop helper integration.

**Verification:**
- `cd agent-service && npm test`
- `npm run run-once -- --manual-task-dry-run` prints a sample manual task payload.
- `node --check` for new migration.
- `cd frontend && npm run build`

## Batch 6: Manager Confirmation Package and Quote Handoff

**Files:**
- Create `agent-service/src/domain/confirmation-package.js`
- Create `agent-service/src/domain/confirmation-package.test.js`
- Add PocketBase migration for package fields on `bid_opportunities`.
- Modify Go hooks to set `quote_ready_at` when status becomes converted.
- Modify frontend detail modal and manager table to show confirmation package fields.

**Scope:**
- Build a deterministic manager package containing title, buyer, deadline, product, evidence, hard requirements, risk flags, employee assessment, documents, and recommended next action.
- Add statuses/fields needed for quote handoff while keeping existing ERP quotation creation manual for MVP.
- Add a dry-run command for package generation.

**Verification:**
- `cd agent-service && npm test`
- `npm run run-once -- --confirmation-package-json` prints package JSON.
- `PATH="$HOME/.local/go/bin:$PATH" GOPROXY=https://goproxy.cn,direct go test ./...`
- `cd frontend && npm run build`

## Final Verification

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test
npm run run-once -- --dry-run-json

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/backend
PATH="$HOME/.local/go/bin:$PATH" GOPROXY=https://goproxy.cn,direct go test ./...
node --check pb_migrations/202605230001_created_opportunity_agent_collections.js
node --check pb_migrations/202605230002_seed_monitor_sources.js
node --check pb_migrations/202605250001_extend_opportunity_monitoring_relevance.js

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor
docker compose config >/tmp/erp-compose-check.yml
```
