# Browser Worker Real Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the Phase 2 browser-worker with a real Playwright Chromium runtime, not only stub-mode unit tests.

**Architecture:** Keep browser-worker unit tests deterministic in stub mode. Add a small optional smoke test script that starts the HTTP server in `playwright` mode, creates a protected browser session, starts Chromium, captures a screenshot, navigates, types text, and stops the runtime. Align the Docker Playwright base image with the installed Playwright package so production browser binaries and Node package stay compatible.

**Tech Stack:** Node.js 22, Playwright Chromium, Docker Playwright image, browser-worker HTTP API.

---

## Task 1: Playwright Version Alignment

**Files:**
- Modify: `browser-worker/package.json`
- Modify: `browser-worker/package-lock.json`

- [ ] Align `playwright` and the Docker Playwright base image version.
- [ ] Run `npm install --package-lock-only` in `browser-worker`.
- [ ] Run `npm test` in `browser-worker`.

## Task 2: Real Runtime Smoke Script

**Files:**
- Create: `browser-worker/scripts/smoke-playwright-runtime.mjs`
- Modify: `browser-worker/package.json`

- [ ] Add a smoke script that creates a session through the HTTP API and uses the returned signed `browser_url`.
- [ ] Start the session in Playwright mode, fetch `/snapshot`, navigate to a data URL, type text, fetch another screenshot, then stop the session.
- [ ] Use a temporary profile root under `/tmp` so local checks do not touch production profile data.
- [ ] Add `npm run smoke:playwright`.

## Task 3: Docker Runtime Verification

**Files:**
- No source files unless verification exposes a defect.

- [ ] Build the `browser-worker` Docker image locally.
- [ ] Run `npm run smoke:playwright` inside the image with `BROWSER_ACCESS_SECRET` set.
- [ ] Run the normal full verification suite.
