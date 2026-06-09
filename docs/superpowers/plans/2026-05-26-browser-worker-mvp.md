# Browser Worker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal server-side browser session worker so the ERP can create remote-login session records with stable `browser_url` placeholders and reusable profile references.

**Architecture:** Build a small Node.js `browser-worker` service with a session manager and HTTP API. The first slice is intentionally browser-runtime-light: it creates deterministic session/profile records and health/status endpoints, then agent-service calls it when a source requires login. A later slice can swap the session manager implementation to launch Playwright/noVNC without changing the agent-service or ERP data model.

**Tech Stack:** Node.js 22, built-in `node:http`, `node:test`, existing Docker Compose, existing PocketBase collections from Phase 2 step 1.

---

## Task 1: Browser Worker Session Manager

**Files:**
- Create: `browser-worker/package.json`
- Create: `browser-worker/src/session-manager.js`
- Create: `browser-worker/src/session-manager.test.js`

- [ ] Write failing tests for `createBrowserSession`, `getBrowserSession`, and `revokeBrowserSession`.
- [ ] Implement deterministic session IDs, profile refs, browser URLs, and statuses.
- [ ] Run `npm test` in `browser-worker`.

## Task 2: Browser Worker HTTP API

**Files:**
- Create: `browser-worker/src/server.js`
- Create: `browser-worker/src/server.test.js`
- Create: `browser-worker/Dockerfile`

- [ ] Write failing HTTP tests for `/health`, `POST /sessions`, `GET /sessions/:id`, and `POST /sessions/:id/revoke`.
- [ ] Implement the HTTP server using `node:http`.
- [ ] Run `npm test` in `browser-worker`.

## Task 3: Agent-Service Browser Session Integration

**Files:**
- Modify: `agent-service/src/index.js`
- Modify: `agent-service/src/index.test.js`

- [ ] Add tests that `ensureLoginSession` creates a PocketBase `agent_login_sessions` record and updates manual task payload with `session`, `browser_url`, and `session_status`.
- [ ] Implement browser-worker client calls with env vars `BROWSER_WORKER_URL` and `BROWSER_PUBLIC_BASE_URL`.
- [ ] Keep graceful fallback: if browser-worker is unavailable, still create the manual task without crashing the whole run.
- [ ] Run `npm test` in `agent-service`.

## Task 4: Docker Compose Wiring

**Files:**
- Modify: `docker-compose.yml`

- [ ] Add `browser-worker` service with memory limit, internal network, and env `BROWSER_PUBLIC_BASE_URL`.
- [ ] Pass `BROWSER_WORKER_URL=http://browser-worker:8095` and `BROWSER_PUBLIC_BASE_URL` to `opportunity-agent`.
- [ ] Run `docker compose config`.

## Task 5: Full Verification

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/browser-worker
npm test

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/backend
PATH="$HOME/.local/go/bin:$PATH" GOPROXY=https://goproxy.cn,direct go test ./...

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor
docker compose config >/tmp/erp-compose-phase2-browser.yml
```

Expected: all commands exit 0.
