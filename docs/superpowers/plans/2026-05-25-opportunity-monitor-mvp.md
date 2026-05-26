# ERP Opportunity Monitor MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first verifiable ERP Agent slice for bid opportunity monitoring: broad tender notice collection, chemical-product relevance retention, PocketBase persistence, and ERP review UI.

**Architecture:** Continue from the existing `agent-opportunity-monitor` worktree. Keep PocketBase as the business data store, keep the Agent backend as a separate Node.js service, and split Agent logic into deep modules that can be tested without a browser or live website. The first execution slice optimizes for high recall: collect candidate notices by date/category, retain chemical-product opportunities, and leave bidability decisions to employees and the manager.

**Tech Stack:** PocketBase Go hooks and JS migrations, Node.js `node:test` Agent service, TypeScript React frontend with Ant Design, Docker Compose for deployment packaging.

---

## Current Baseline

The worktree already contains a first draft:

- `agent-service/`: standalone Node.js service with candidate normalization, dedupe, simple keyword classification, sample mode, and tests.
- `backend/pb_migrations/202605230001_created_opportunity_agent_collections.js`: collections for monitor sources, monitor runs, bid opportunities, bid documents, opportunity reviews, and audit logs.
- `backend/pb_migrations/202605230002_seed_monitor_sources.js`: initial source seed from the group notice.
- `backend/hooks/opportunity.go`: default record hooks for monitoring collections.
- `frontend/src/pages/manager/OpportunityMonitorPage.tsx`: first ERP page for source management, opportunity pool, pending review, boss review, run records.

The PRD now requires the draft to be upgraded from fixed keyword matching to a product-intelligence and chemical-relevance pipeline.

---

## Module Boundaries

### Agent Service Modules

- Create `agent-service/src/domain/text.js`
  - Text normalization, date extraction, buyer extraction, URL canonicalization, hashing.
- Create `agent-service/src/domain/product-intelligence.js`
  - Product vocabulary seeds from ERP history, group chat examples, curated chemical vocabulary, aliases, and feedback-ready result shape.
- Create `agent-service/src/domain/relevance.js`
  - High-recall chemical relevance classification, negative relevance signals, hard requirement extraction, evidence snippets.
- Create `agent-service/src/domain/candidate.js`
  - Candidate normalization, HTML candidate extraction, broad notice detection, dedupe.
- Create `agent-service/src/domain/summary.js`
  - WeChat-copyable summary generation.
- Create `agent-service/src/source-strategies.js`
  - Site strategy map for categories, crawl strategy, login/manual assist expectations, and supplemental search behavior.
- Modify `agent-service/src/opportunity-agent.js`
  - Re-export stable module interfaces and keep orchestration thin.
- Modify `agent-service/src/index.js`
  - Use the new relevance result fields when creating `bid_opportunities`.
  - Add a local dry-run command that produces JSON without PocketBase.

### Backend/PocketBase Modules

- Create a migration to extend `monitor_sources` with strategy fields:
  - `category_names`
  - `category_urls`
  - `crawl_strategy`
  - `site_search_behavior`
  - `credential_ref`
  - `manual_assist_reason`
- Create a migration to extend `bid_opportunities` with relevance evidence fields:
  - `relevance_score`
  - `matched_terms`
  - `matched_sources`
  - `evidence_text`
  - `negative_terms`
  - `classification_version`
  - `needs_human_check`
- Create a lightweight `product_terms` collection for maintainable vocabulary:
  - `term`
  - `term_type`
  - `source`
  - `weight`
  - `aliases`
  - `status`
- Modify `backend/hooks/opportunity.go`
  - Set default strategy and classification metadata when fields are empty.

### Frontend Modules

- Modify `frontend/src/types/opportunity.ts`
  - Add the new source strategy, relevance evidence, and product term types.
- Modify `frontend/src/api/opportunity.ts`
  - Add product term list/create/update helpers.
  - Add strategy fields to monitor source forms.
- Modify `frontend/src/pages/manager/OpportunityMonitorPage.tsx`
  - Show relevance evidence, matched sources, score, negative terms, and strategy fields.
  - Keep UI in the existing manager page for MVP; no new route needed in this slice.

### Deployment Modules

- Create `agent-service/Dockerfile`
- Modify `docker-compose.yml`
  - Add an `opportunity-agent` service with conservative memory limits and environment variables.
  - Do not enable high-frequency scheduling in this slice.

---

## Task 0: Baseline Verification

**Files:**
- Read only: `agent-service/package.json`
- Read only: `frontend/package.json`
- Read only: `backend/go.mod`

- [ ] **Step 1: Run Agent tests**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test
```

Expected:

```text
# tests ...
# pass ...
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build
```

Expected:

```text
vite v...
built in ...
```

- [ ] **Step 3: Check backend Go tooling**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/backend
go test ./...
```

Expected:

```text
?    my-erp-system/backend ...
```

If `go` is not installed in the environment, record that backend Go verification must be run in CI/server and continue only with migration syntax review plus existing PocketBase binary checks.

**Verification artifact:** baseline command outputs in the final module report.

---

## Task 1: Product Intelligence and Chemical Relevance Engine

**Files:**
- Create: `agent-service/src/domain/text.js`
- Create: `agent-service/src/domain/product-intelligence.js`
- Create: `agent-service/src/domain/relevance.js`
- Create: `agent-service/src/domain/candidate.js`
- Create: `agent-service/src/domain/summary.js`
- Modify: `agent-service/src/opportunity-agent.js`
- Modify: `agent-service/src/opportunity-agent.test.js`

- [ ] **Step 1: Write tests for PRD examples**

Add tests that verify:

```js
const retainedTitles = [
  '炼油四部用塑料用抗静电剂（2026-2027）框架采购询比采购公告',
  '宁夏电力英力特化工2026年焦亚硫酸钠物资询价采购',
  '焦化公司棋盘井洗煤厂2026年起泡剂、捕收剂采购公开招标项目招标公告',
  '2026年华鹤公司中修氨生产部二氧化碳气体脱硫、脱氢催化剂采购',
  '【询比采购】 紫外线吸收剂 CS82 99% 25kg/桶 采购公告',
  '【询比采购】 DMPP硝化抑制剂（1型）采购公告',
  '【阻聚剂】 采购询源公告',
  '【询比采购】 表面活性剂ST-80采购公告',
  '采购1吨苯基三甲氧基硅烷、1.05吨六甲基二硅氧烷采购公告',
];
```

Each title should classify as `likely_related` or `needs_manual_review`, never `irrelevant`.

Add tests that verify ERP history terms:

```js
const erpHistoryTitles = [
  '白油采购询价公告',
  '凡士林脂采购公告',
  '引发剂年度框架采购公告',
];
```

Each should include `matched_sources` containing `erp_history`.

Add negative tests:

```js
const negativeTitles = [
  '办公用品采购公告',
  '物业保洁服务招标公告',
  '办公楼土建维修工程招标公告',
  '信息化系统运维服务采购公告',
];
```

They should be `irrelevant` or `not_relevant_candidate` and include `negative_terms`.

- [ ] **Step 2: Run tests to verify failure before implementation**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test
```

Expected:

```text
not ok ... matched_sources ...
not ok ... relevance ...
```

- [ ] **Step 3: Implement `domain/text.js`**

Provide these exports:

```js
export const normalizeText = (value = '') => String(value).replace(/\s+/g, ' ').trim();
export const decodeHtml = (value = '') => String(value)
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'");
export const canonicalizeUrl = (url = '') => { /* remove hash and query safely */ };
export const extractDeadlineDate = (text) => { /* return YYYY-MM-DD for 截止/报价截止/投标截止 */ };
export const extractBuyer = (text) => { /* parse 采购单位/招标人/采购人 */ };
export const hashParts = (parts) => { /* sha256 of non-empty parts joined by | */ };
export const evidenceAround = (text, term, radius = 42) => { /* short text around first term */ };
```

- [ ] **Step 4: Implement `domain/product-intelligence.js`**

Provide these exports:

```js
export const ERP_HISTORY_TERMS = ['凡士林脂', '引发剂', '白油'];
export const CHAT_HISTORY_TERMS = [
  '亚硫酸钠', '抗静电剂', '脱硝催化剂', '焦亚硫酸钠', '起泡剂', '捕收剂',
  '二氧化碳脱硫催化剂', '脱氢催化剂', '二甲基二硫',
  "4,4'-亚甲基二(N-仲-丁基环己胺)", '紫外线吸收剂', 'DMPP硝化抑制剂',
  '碳酸铵', '阻聚剂', '碳酸氢钠', '苯基三甲氧基硅烷', '六甲基二硅氧烷',
  '碳酸二甲酯', '2-硝基二苯胺', '磷酸二氢镁', '表面活性剂ST-80',
];
export const GENERAL_CHEMICAL_TERMS = [
  '催化剂', '抑制剂', '吸收剂', '阻聚剂', '表面活性剂', '起泡剂', '捕收剂',
  '助剂', '油品', '树脂', '危化品', '化工', '钠', '酸', '酯', '醇', '胺',
  '烷', '烯', '酮', '醚', '酚', '盐', '硫', '磷', '氯', '氟', '硅',
];
export const NEGATIVE_TERMS = ['办公用品', '物业', '保洁', '绿化', '土建', '维修工程', '信息化', '运维服务', '培训', '审计'];
export const buildProductVocabulary = (sourceKeywords = '') => { /* return weighted term objects */ };
export const findTermMatches = (text, vocabulary) => { /* return matched_terms and matched_sources */ };
```

- [ ] **Step 5: Implement `domain/relevance.js`**

Provide these exports:

```js
export const CLASSIFICATION_VERSION = 'chemical-relevance-v1';
export const classifyChemicalRelevance = (candidate, options = {}) => {
  return {
    relevance: 'likely_related' | 'needs_manual_review' | 'irrelevant',
    relevanceScore: 0.0,
    matchedTerms: [],
    matchedSources: [],
    evidenceText: '',
    negativeTerms: [],
    needsHumanCheck: false,
    productKeywords: [],
    hardRequirements: [],
    riskFlags: [],
    summary: '',
    classificationVersion: CLASSIFICATION_VERSION,
  };
};
```

Classification rules:

- ERP history or chat history match: score at least `0.78`, relevance `likely_related`.
- General chemical term match: score at least `0.55`, relevance `needs_manual_review` unless multiple strong terms raise it to `likely_related`.
- Negative terms without chemical terms: relevance `irrelevant`, score at most `0.25`.
- Chemical term plus negative term: retain as `needs_manual_review`, set `needsHumanCheck = true`.
- Extract hard requirements for 代理商/生产商, 第三方检测, 8 位码, 危化品, 业绩.

- [ ] **Step 6: Implement `domain/candidate.js` and update exports**

Provide:

```js
export const normalizeCandidate = (raw, options = {}) => { /* common candidate shape */ };
export const dedupeCandidates = (candidates) => { /* same URL/title/fingerprint dedupe */ };
export const extractCandidatesFromHtml = (source, html) => { /* broad notice links, not keyword-only */ };
export const processCandidates = (rawCandidates, options = {}) => { /* normalize + dedupe + classify */ };
```

`extractCandidatesFromHtml` must retain links that look like tender/procurement notices even if they do not contain a known product keyword.

- [ ] **Step 7: Implement `domain/summary.js`**

Move `buildGroupSummary` there and count `likely_related` and `needs_manual_review` retained items. Keep summary text:

```text
今日招投标监测摘要：
小白：2 条疑似相关，1 条需 3 日内确认
正式处理请进入 ERP 商机池。
```

- [ ] **Step 8: Run Agent tests**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test
```

Expected: all tests pass.

**Verification artifact:** tests prove real group-chat chemical examples are retained, ERP products match history, and non-chemical notices are de-prioritized.

---

## Task 2: PocketBase Schema Upgrade for Strategy and Relevance Evidence

**Files:**
- Create: `backend/pb_migrations/202605250001_extend_opportunity_monitoring_relevance.js`
- Modify: `backend/hooks/opportunity.go`
- Modify: `backend/pb_migrations/202605230002_seed_monitor_sources.js`

- [ ] **Step 1: Add migration fields**

Create a migration that finds existing collections and appends fields only once. The final schema must include:

Monitor source fields:

```text
category_names
category_urls
crawl_strategy
site_search_behavior
credential_ref
manual_assist_reason
```

Bid opportunity fields:

```text
relevance_score
matched_terms
matched_sources
evidence_text
negative_terms
classification_version
needs_human_check
```

Product terms collection:

```text
term
term_type: erp_history | chat_history | curated | alias | feedback_positive | feedback_negative
source
weight
aliases
status: active | paused
```

- [ ] **Step 2: Update hooks defaults**

In `RegisterOpportunityHooks`, default empty values:

```go
monitor_sources.crawl_strategy = "http_html"
monitor_sources.site_search_behavior = "supplemental"
bid_opportunities.classification_version = "chemical-relevance-v1"
bid_opportunities.needs_human_check = true when relevance is "needs_manual_review"
```

- [ ] **Step 3: Update source seed data**

For each seeded source, populate:

```js
category_names
category_urls
crawl_strategy
site_search_behavior
manual_assist_reason
```

Use the PRD ownership rule: group notice is authoritative; conflicting individual docs become `remark` or unassigned site-operation knowledge.

- [ ] **Step 4: Verify migration syntax**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/backend
./pocketbase migrate collections --dir ./pb_data_check
```

If PocketBase cannot run migration generation without a live instance, run:

```bash
node --check pb_migrations/202605250001_extend_opportunity_monitoring_relevance.js
node --check pb_migrations/202605230002_seed_monitor_sources.js
```

Expected: syntax checks pass.

**Verification artifact:** schema fields exist in migration and hooks set safe defaults.

---

## Task 3: Agent Persistence and Dry-Run Output

**Files:**
- Modify: `agent-service/src/index.js`
- Modify: `agent-service/src/index.test.js`
- Modify: `agent-service/README.md`

- [ ] **Step 1: Add tests for dry run and persisted payload shape**

Tests should call a pure function that maps a processed candidate to PocketBase create payload:

```js
const payload = buildOpportunityPayload(source, run, processedCandidate);
assert.equal(payload.relevance, 'likely_related');
assert.equal(payload.classification_version, 'chemical-relevance-v1');
assert.match(payload.matched_terms, /抗静电剂/);
assert.match(payload.matched_sources, /chat_history/);
assert.equal(payload.needs_human_check, false);
```

- [ ] **Step 2: Implement payload builder**

Create export in `index.js` or move to `agent-service/src/persistence.js`:

```js
export const buildOpportunityPayload = (source, run, item) => ({
  source: source.id,
  monitor_run: run.id,
  source_name: item.sourceName,
  owner_name: item.ownerName,
  title: item.title,
  url: item.url,
  fingerprint: item.fingerprint,
  publish_date: item.publishDate || '',
  deadline_date: item.deadlineDate || '',
  buyer_name: item.buyerName || '',
  product_keywords: item.classification.productKeywords.join(','),
  relevance: item.classification.relevance,
  relevance_score: item.classification.relevanceScore,
  matched_terms: item.classification.matchedTerms.join(','),
  matched_sources: item.classification.matchedSources.join(','),
  evidence_text: item.classification.evidenceText,
  negative_terms: item.classification.negativeTerms.join(','),
  classification_version: item.classification.classificationVersion,
  needs_human_check: item.classification.needsHumanCheck,
  status: 'pending_review',
  urgency: urgencyFor(item.deadlineDate),
  agent_summary: item.classification.summary,
  hard_requirements: item.classification.hardRequirements.join(','),
  risk_flags: item.classification.riskFlags.join(','),
  raw_text: item.rawText,
});
```

- [ ] **Step 3: Add local dry-run command**

Support:

```bash
npm run run-once -- --dry-run-json
```

Expected behavior:

- No PocketBase login required.
- Uses deterministic sample source/candidates.
- Prints JSON with `sources`, `runs`, `opportunities`, and `summary`.

- [ ] **Step 4: Run verification**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test
npm run run-once -- --dry-run-json
```

Expected: tests pass and dry run prints retained chemical examples.

**Verification artifact:** dry-run JSON demonstrates end-to-end Agent logic without needing the production database.

---

## Task 4: Frontend Evidence and Strategy Display

**Files:**
- Modify: `frontend/src/types/opportunity.ts`
- Modify: `frontend/src/api/opportunity.ts`
- Modify: `frontend/src/pages/manager/OpportunityMonitorPage.tsx`

- [ ] **Step 1: Update TypeScript types**

Add fields to `MonitorSource`, `MonitorSourceFormData`, and `BidOpportunity`:

```ts
category_names?: string;
category_urls?: string;
crawl_strategy?: 'http_html' | 'http_json' | 'playwright_dom' | 'playwright_network' | 'manual_assist' | 'local_helper';
site_search_behavior?: 'none' | 'supplemental' | 'primary';
credential_ref?: string;
manual_assist_reason?: string;
relevance_score?: number;
matched_terms?: string;
matched_sources?: string;
evidence_text?: string;
negative_terms?: string;
classification_version?: string;
needs_human_check?: boolean;
```

- [ ] **Step 2: Update source management form**

Add controls for:

- 监测栏目
- 栏目 URL
- 采集策略
- 站内搜索方式
- 凭据引用
- 人工协助原因

- [ ] **Step 3: Update opportunity table/detail**

Show:

- 相关性分数
- 匹配词
- 匹配来源
- 证据文本
- 负向词
- 是否需人工确认
- 分类版本

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build
```

Expected: build passes.

**Verification artifact:** TypeScript build proves frontend and API types are consistent.

---

## Task 5: Deployment Packaging for Agent Service

**Files:**
- Create: `agent-service/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `agent-service/README.md`

- [ ] **Step 1: Add Dockerfile**

Use a small Node image and run the service:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
CMD ["npm", "start"]
```

- [ ] **Step 2: Add compose service**

Add `opportunity-agent`:

```yaml
  opportunity-agent:
    build:
      context: ./agent-service
      dockerfile: Dockerfile
    container_name: erp-opportunity-agent
    restart: unless-stopped
    environment:
      - POCKETBASE_URL=${POCKETBASE_URL}
      - POCKETBASE_SUPERUSER_EMAIL=${POCKETBASE_SUPERUSER_EMAIL}
      - POCKETBASE_SUPERUSER_PASSWORD=${POCKETBASE_SUPERUSER_PASSWORD}
      - OPPORTUNITY_AGENT_SAMPLE_MODE=0
    deploy:
      resources:
        limits:
          memory: 256M
    networks:
      - web
```

Do not hardcode credentials.

- [ ] **Step 3: Verify compose config**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor
docker compose config >/tmp/erp-compose-check.yml
```

Expected: command exits 0 and generated config contains `opportunity-agent`.

**Verification artifact:** compose config can render with the new service.

---

## Task 6: Final Verification and Review Package

**Files:**
- Modify: `new-docs/erp-agent-system-prd.md` only if implementation decisions materially change.
- No production deploy in this task unless separately requested.

- [ ] **Step 1: Run all available local checks**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor
docker compose config >/tmp/erp-compose-check.yml
```

- [ ] **Step 2: Record unavailable checks**

If `go` is unavailable, state:

```text
Backend Go tests were not run locally because go is not installed in this environment.
```

- [ ] **Step 3: Produce review summary**

Report:

- Files changed.
- Tests run.
- Sample dry-run output summary.
- Remaining modules not in this slice: real site adapters, manual assist UI, local helper, document parsing, LLM extraction, boss package enrichment.

**Verification artifact:** final summary that maps module completion to concrete command outputs.

---

## Execution Order

1. Task 0 gives a clean baseline.
2. Task 1 proves the business-critical relevance decision logic.
3. Task 2 makes PocketBase capable of storing that logic.
4. Task 3 proves Agent can create correct payloads and dry-run output.
5. Task 4 makes ERP users able to inspect and correct Agent reasoning.
6. Task 5 makes server deployment possible without hardcoded secrets.
7. Task 6 packages the slice for review.

This first slice intentionally does not implement real crawlers for every website. The next plan should start with per-site adapters after this core pipeline is verifiable.
