# Browser Control MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees operate a server-side browser session from the ERP browser link using screenshot refresh, URL navigation, coordinate click, and text input.

**Architecture:** Keep the `browser-worker` service and Playwright runtime from the previous slice. Add a small browser-control API on the runtime abstraction, expose JSON routes for screenshot/navigation/click/type, and render those controls on the existing employee operation page. Stub mode remains deterministic for tests and does not launch a real browser.

**Tech Stack:** Node.js 22, `node:http`, `node:test`, Playwright Chromium.

---

## Task 1: Runtime Control Methods

**Files:**
- Modify: `browser-worker/src/browser-runtime.js`
- Modify: `browser-worker/src/browser-runtime.test.js`

- [ ] Add failing tests for `snapshot`, `navigate`, `click`, and `typeText` in stub mode.
- [ ] Implement stub mode state updates and deterministic screenshot placeholder.
- [ ] Implement Playwright mode methods using the existing running page.
- [ ] Run `npm test` in `browser-worker`.

## Task 2: Browser Control HTTP API

**Files:**
- Modify: `browser-worker/src/server.js`
- Modify: `browser-worker/src/server.test.js`

- [ ] Add failing tests for `GET /sessions/:id/snapshot`, `POST /sessions/:id/navigate`, `POST /sessions/:id/click`, and `POST /sessions/:id/type`.
- [ ] Implement JSON routes and update the stored session target URL when navigation succeeds.
- [ ] Return 409 when control actions are requested before the runtime has started.
- [ ] Run `npm test` in `browser-worker`.

## Task 3: Employee Operation Page Controls

**Files:**
- Modify: `browser-worker/src/server.js`
- Modify: `browser-worker/src/server.test.js`

- [ ] Add failing HTML test that the operation page includes a screenshot image and forms for navigate/click/type.
- [ ] Render controls that post to the new routes and redirect back to `/sessions/:id`.
- [ ] Run `npm test` in `browser-worker`.

## Task 4: Full Verification

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
```

Expected: all commands exit 0.
