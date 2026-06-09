# Browser Access Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect employee-facing browser session pages and control routes before exposing `browser_url` beyond the internal Docker network.

**Architecture:** Keep agent-service and browser-worker loosely coupled. Browser-worker generates a signed HMAC token per session when `BROWSER_ACCESS_SECRET` is configured and appends it to `browser_url`; employee-facing GET/POST control routes require the token. Internal session creation remains available to `opportunity-agent` on the private Docker network.

**Tech Stack:** Node.js 22, `node:crypto`, `node:http`, `node:test`, Docker Compose environment variables.

---

## Task 1: Signed Session Access Tokens

**Files:**
- Create: `browser-worker/src/access-token.js`
- Create: `browser-worker/src/access-token.test.js`
- Modify: `browser-worker/src/session-manager.js`
- Modify: `browser-worker/src/session-manager.test.js`

- [ ] Add failing tests for token generation, verification, disabled-secret behavior, and browser URL query param.
- [ ] Implement HMAC token helpers using `session.id`, `session.expires_at`, and `BROWSER_ACCESS_SECRET`.
- [ ] Update session creation to append `?access_token=...` when a secret is configured.
- [ ] Run `npm test` in `browser-worker`.

## Task 2: Protect Employee-Facing Routes

**Files:**
- Modify: `browser-worker/src/server.js`
- Modify: `browser-worker/src/server.test.js`

- [ ] Add failing tests that `/sessions/:id`, `/snapshot`, `/start`, `/stop`, `/navigate`, `/click`, and `/type` return `403` without a valid token when access protection is enabled.
- [ ] Add tests that the same routes work with the signed token.
- [ ] Preserve JSON session creation for internal `POST /sessions`.
- [ ] Run `npm test` in `browser-worker`.

## Task 3: Keep Token Across HTML Forms

**Files:**
- Modify: `browser-worker/src/server.js`
- Modify: `browser-worker/src/server.test.js`

- [ ] Add failing HTML test that forms and snapshot image include `access_token`.
- [ ] Render token-aware URLs and hidden form fields.
- [ ] Run `npm test` in `browser-worker`.

## Task 4: Compose And Full Verification

**Files:**
- Modify: `docker-compose.yml`

- [ ] Add `BROWSER_ACCESS_SECRET=${BROWSER_ACCESS_SECRET}` to `browser-worker`.
- [ ] Run:

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
docker compose config >/tmp/erp-compose-browser-access-security.yml
```

Expected: all commands exit 0.
