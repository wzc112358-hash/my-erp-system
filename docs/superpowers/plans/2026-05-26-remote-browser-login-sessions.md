# Remote Browser Login Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 2 foundation for方案 B: employees complete login/captcha in a server-side browser session, and the server agent can reuse that login state until it expires.

**Architecture:** Keep the Phase 1 scheduler and ERP workflow. Add a first-class login session model, richer manual task cards, and deterministic session-status generation before adding live noVNC/CDP browser control. This plan delivers the data contract and UX needed for remote browser login; the actual browser runtime can be attached in the next slice without changing ERP task semantics.

**Tech Stack:** PocketBase JS migrations + Go hooks, Node.js agent-service with node:test, React/TypeScript/Ant Design frontend.

---

## Scope

Included in this slice:

- Add `agent_login_sessions` collection for server-side login/session state.
- Extend `agent_tasks` with actionable fields: `action_steps`, `search_terms`, `session`, `session_status`, `browser_url`, `last_attempt_at`.
- Generate richer manual/login tasks from agent-service.
- Show useful task cards in ERP: entry URL, browser URL placeholder, steps, search terms, required artifacts, session status.
- Keep security posture conservative: no raw cookie display, no password storage, only session metadata.

Excluded from this slice:

- Running a real noVNC/browser service in production.
- Persisting actual browser cookies/storage files.
- LLM extraction and Crawl4AI/Scrapling integration.
- Solving all sites; this builds the foundation for 1-2 login-site pilots.

## File Structure

- `backend/pb_migrations/202605260001_create_agent_login_sessions.js`: creates login session collection and extends task fields.
- `backend/hooks/opportunity.go`: defaults login session status and task session status where useful.
- `agent-service/src/domain/manual-assist.js`: generates action steps, search terms, and session metadata for manual/login tasks.
- `agent-service/src/domain/manual-assist.test.js`: tests task payload and session task behavior.
- `frontend/src/types/opportunity.ts`: adds login session and task fields.
- `frontend/src/api/opportunity.ts`: fetches login sessions and expands `session` relation.
- `frontend/src/pages/manager/OpportunityMonitorPage.tsx`: renders richer task card fields.

---

## Task 1: PocketBase Login Session Schema

**Files:**
- Create: `backend/pb_migrations/202605260001_create_agent_login_sessions.js`
- Modify: `backend/hooks/opportunity.go`

- [ ] **Step 1: Add migration with a new collection**

Create `agent_login_sessions` with fields:

- `source` relation to `monitor_sources`
- `source_name` text required
- `owner_name` text required
- `status` select: `not_started`, `login_required`, `active`, `expired`, `failed`, `revoked`
- `login_url` text
- `browser_url` text
- `profile_ref` text
- `expires_at` date
- `last_verified_at` date
- `last_error` text
- `authorized_by` relation to `users`
- `security_note` text

Extend `agent_tasks`:

- `session` relation to `agent_login_sessions`
- `session_status` select with same values
- `action_steps` text
- `search_terms` text
- `browser_url` text
- `last_attempt_at` date

- [ ] **Step 2: Validate migration syntax**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor
node --check backend/pb_migrations/202605260001_create_agent_login_sessions.js
```

Expected: exit code 0.

- [ ] **Step 3: Run real empty-db migration verification**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/backend
rm -rf /tmp/pb-phase2-migration-check
mkdir -p /tmp/pb-phase2-migration-check
PATH="$HOME/.local/go/bin:$PATH" GOPROXY=https://goproxy.cn,direct go run . --dir=/tmp/pb-phase2-migration-check migrate up
```

Expected: all Phase 1 migrations plus `202605260001_create_agent_login_sessions.js` applied.

---

## Task 2: Agent Manual Task Payload Upgrade

**Files:**
- Modify: `agent-service/src/domain/manual-assist.js`
- Modify: `agent-service/src/domain/manual-assist.test.js`

- [ ] **Step 1: Write failing tests**

Add tests that assert:

- Login/captcha/manual tasks include multi-line `action_steps`.
- `search_terms` includes source keywords.
- Browser-login tasks include `session_status: login_required`.
- Entry URL uses the best source URL or first category URL.

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test -- --test-name-pattern="manual assist task"
```

Expected: fails before implementation.

- [ ] **Step 2: Implement task payload generation**

Add helpers:

- `entryUrlForSource(source)`
- `searchTermsForSource(source)`
- `actionStepsForSource(source, reason)`
- `sessionStatusForSource(source)`

Update `buildManualAssistTask()` to include:

- `action_steps`
- `search_terms`
- `session_status`
- `browser_url`
- `last_attempt_at`

- [ ] **Step 3: Verify agent tests**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test
```

Expected: all tests pass.

---

## Task 3: Frontend Task Card Upgrade

**Files:**
- Modify: `frontend/src/types/opportunity.ts`
- Modify: `frontend/src/api/opportunity.ts`
- Modify: `frontend/src/pages/manager/OpportunityMonitorPage.tsx`

- [ ] **Step 1: Add frontend types**

Add `AgentLoginSession` and extend `AgentTask` with:

- `session?: string`
- `session_status?: AgentLoginSessionStatus`
- `action_steps?: string`
- `search_terms?: string`
- `browser_url?: string`
- `last_attempt_at?: string`

- [ ] **Step 2: Expand task session relation**

Update `OpportunityAPI.listAgentTasks()` expand string to include `session`.

- [ ] **Step 3: Render useful task fields**

In the 人工协助 table add columns for:

- `登录态`
- `搜索词`
- `操作步骤`
- `远程浏览器`

Render long `action_steps` as compact pre-wrapped text.

- [ ] **Step 4: Verify frontend build**

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build
```

Expected: build exits 0.

---

## Task 4: Full Local Verification

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/backend
PATH="$HOME/.local/go/bin:$PATH" GOPROXY=https://goproxy.cn,direct go test ./...

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build
```

Expected:

- agent-service tests pass.
- Go tests pass.
- Frontend production build succeeds.

## Follow-up Slice After This Plan

After this foundation is deployed, implement the real remote browser runtime:

- Add `browser-worker` container with Playwright persistent contexts.
- Add create/revoke/verify session commands.
- Expose a controlled remote browser URL for employees.
- Store encrypted browser profile references only, not raw cookies in ERP.
- Pilot with 1-2 sites before broad rollout.
