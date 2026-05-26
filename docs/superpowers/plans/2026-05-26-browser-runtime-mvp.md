# Browser Runtime MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the browser-worker placeholder into a first runnable server-side browser runtime that can keep per-source Chrome profile directories and expose an employee operation page for login/captcha assistance.

**Architecture:** Keep `browser-worker` as the boundary service already used by `agent-service`. Add a lightweight runtime abstraction that can either run in deterministic stub mode for tests or launch Playwright Chromium in production. The HTTP server will expose a small HTML operation page at `/sessions/:id`, keep the JSON API stable, and persist profiles under `/browser_profiles`.

**Tech Stack:** Node.js 22, `node:http`, `node:test`, Playwright Chromium, Docker Compose.

---

## Task 1: Runtime Config And Session Model

**Files:**
- Modify: `browser-worker/src/session-manager.js`
- Modify: `browser-worker/src/session-manager.test.js`

- [ ] Add failing tests that a created session includes `profile_dir`, `target_url`, and `runtime_status`.
- [ ] Implement profile directory generation using `BROWSER_PROFILE_ROOT` or a passed `profileRoot`.
- [ ] Run `npm test` in `browser-worker`.

## Task 2: Browser Runtime Abstraction

**Files:**
- Create: `browser-worker/src/browser-runtime.js`
- Create: `browser-worker/src/browser-runtime.test.js`

- [ ] Add failing tests for stub runtime start/reuse/stop behavior.
- [ ] Implement `createBrowserRuntime` with `stub` and `playwright` modes.
- [ ] In `stub` mode, return deterministic `runtime_url`, `runtime_status`, and `target_url` without launching a browser.
- [ ] In `playwright` mode, lazily import `playwright`, launch persistent context with `profile_dir`, and navigate to `login_url` or `target_url`.
- [ ] Run `npm test` in `browser-worker`.

## Task 3: Operation Page And Runtime API

**Files:**
- Modify: `browser-worker/src/server.js`
- Modify: `browser-worker/src/server.test.js`

- [ ] Add failing tests for `GET /sessions/:id` returning an HTML operation page when `Accept: text/html`.
- [ ] Add failing tests for `POST /sessions/:id/start` and `POST /sessions/:id/stop`.
- [ ] Implement content negotiation: JSON API remains available for agent-service, browser URL opens HTML for employees.
- [ ] Implement start/stop routes using the runtime abstraction.
- [ ] Run `npm test` in `browser-worker`.

## Task 4: Docker Runtime Image

**Files:**
- Modify: `browser-worker/package.json`
- Modify: `browser-worker/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] Add `playwright` dependency and a production start script.
- [ ] Update Dockerfile to install Playwright Chromium dependencies and browser binary.
- [ ] Mount `/root/my-erp-system/browser_profiles:/browser_profiles` in compose.
- [ ] Add env `BROWSER_RUNTIME_MODE=playwright`, `BROWSER_PROFILE_ROOT=/browser_profiles`, and memory limit for the worker.
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
docker compose config >/tmp/erp-compose-phase2-runtime.yml
```

Expected: all commands exit 0. `npm test` uses stub runtime and must not launch a real browser.
