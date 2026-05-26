# Public Tender Source Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the second MVP slice: public-source HTTP/HTML adapters that can collect broad tender notice candidates from configured public pages and feed them into the existing chemical relevance pipeline.

**Architecture:** Keep real crawling separate from chemical relevance. Source adapters return raw candidate notices; the existing candidate/relevance pipeline normalizes, dedupes, classifies, and persists them. The first adapter type is intentionally conservative: HTTP HTML only, no login, no captcha, no document purchase, no personal WeChat.

**Tech Stack:** Node.js `fetch`, Node.js `node:test`, existing Agent domain modules, PocketBase payload builder, existing Docker Compose service.

---

## Scope

Included:

- Generic HTTP/HTML source adapter.
- Multi-URL category crawling for configured public source pages.
- Candidate extraction from anchor tags and table/list text.
- Dry-run command for real public URLs without writing to PocketBase.
- Tests with stored HTML fixtures for 国能-style and generic public pages.

Excluded:

- Playwright browser crawling.
- Login/captcha/CA/sms/manual assist workflows.
- PDF/Word attachment parsing.
- LLM extraction.
- Production deployment.

---

## Task 1: HTTP Source Adapter Module

**Files:**
- Create: `agent-service/src/adapters/http-html-adapter.js`
- Create: `agent-service/src/adapters/http-html-adapter.test.js`
- Modify: `agent-service/src/index.js`

- [ ] **Step 1: Add tests**

Test behaviors:

- `collectHttpHtmlCandidates(source)` fetches all `category_urls` when configured.
- It falls back to `source_url` when `category_urls` is empty.
- It adds source metadata to every candidate.
- It returns broad tender notices even without known product keywords.
- It throws a clear error on non-2xx response.

- [ ] **Step 2: Implement adapter**

Provide:

```js
export const urlsForSource = (source) => { /* category_urls split by comma/newline, fallback source_url */ };
export const fetchHtml = async (url) => { /* fetch with ERP-Opportunity-Agent user-agent */ };
export const collectHttpHtmlCandidates = async (source) => { /* fetch each url and extract candidates */ };
```

- [ ] **Step 3: Wire adapter into `collectCandidates`**

Use `resolveSourceStrategy(source).crawlStrategy`:

- `http_html`: call `collectHttpHtmlCandidates`.
- `manual_assist`, `local_helper`, `playwright_dom`, `playwright_network`, `http_json`: return empty in this slice and create manual/strategy status as before.

**Verification:** `npm test` passes.

---

## Task 2: Public URL Dry Run

**Files:**
- Modify: `agent-service/src/index.js`
- Modify: `agent-service/README.md`

- [ ] **Step 1: Add dry-run command**

Support:

```bash
npm run run-once -- --public-url "https://example.com/list.html" --source-name "测试公开源" --owner-name "小杨"
```

Expected:

- No PocketBase login.
- Fetches the URL.
- Extracts candidates.
- Processes candidates through relevance pipeline.
- Prints JSON containing `source`, `candidate_count`, `retained_count`, `opportunities`, and `summary`.

- [ ] **Step 2: Add README examples**

Document:

```bash
npm run run-once -- --public-url "https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html" --source-name "国能E招" --owner-name "小杨"
npm run run-once -- --public-url "https://neep.shop/html/portal/index-Inquiries.html" --source-name "国能E购" --owner-name "小杨"
```

**Verification:** command exits 0 against at least one reachable public URL or returns a clear fetch error that would become a failed monitor run in production.

---

## Task 3: Final Verification

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test
npm run run-once -- --dry-run-json

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/backend
PATH="$HOME/.local/go/bin:$PATH" GOPROXY=https://goproxy.cn,direct go test ./...

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build
```

**Verification artifact:** report command outputs and one public URL dry-run result.
