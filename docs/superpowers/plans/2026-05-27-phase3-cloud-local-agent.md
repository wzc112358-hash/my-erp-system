# Phase 3 Cloud Collector and Windows Local Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase 3 collection architecture with per-site verification: cloud collection for public sources and a Windows local helper path for login/captcha-heavy sources.

**Architecture:** Keep `agent-service` as the business workflow and classification orchestrator. Add a Python `collector-service` for cloud-fetchable sources and a later Electron Windows `local-helper-app` for employee-side browser harness work. Every site must be tested before deciding whether it stays cloud-side, falls back to local helper, or remains manual-only.

**Tech Stack:** Node.js agent-service, Python collector-service, future Electron + Node Windows helper, PocketBase, existing ERP frontend.

---

## Phase 3.1: Site Strategy Matrix and Test Framework

- [x] Add a phase 3 source classification matrix with `cloud_auto`, `cloud_then_local`, `local_helper`, and `manual_only`.
- [x] Route known login/server-blocked sites such as 华锦兵器网 and 云梦泽询价网 to `local_helper`.
- [x] Preserve 国能 as cloud-auto sources and downgrade 裕龙 to cloud-then-local after live verification hit safety validation.
- [x] Generate the site test matrix report.

## Phase 3.2: Cloud Collector Service MVP

- [x] Add Python `collector-service` with `/health`, `/collect/source`, and `/collect/url`.
- [x] Support `http_html` and `http_json` modes; crawl4ai/Scrapling were used in live investigation and remain next collector adapters.
- [x] Return a common `CandidateBundle` shape.
- [x] Verify 国能E招、国能E购、裕龙 once each.

## Phase 3.3: Cloud-Then-Local Site Experiments

- [x] Test 中石油招投标网, 中化, 中海油, 延长石油公开入口, and 易派克公开入口 with ordered tools. (2026-06-02, from Beijing server)
- [x] Produce one result per site: success, partial success, cloud blocked, or local-helper required. (see docs/phase3-site-strategy-matrix.md “Live Collection Notes - 2026-06-02”)
- [x] Update site strategy recommendations from evidence. (易派克→http_html sinopec adapter; 中石油/中化/中海油→local_helper; 延长→playwright)

## Phase 3.4+: Windows Local Helper

- [x] Create Node/TypeScript local helper API shell with health, pairing stub, task lifecycle, and ERP deep-link trigger.
- [x] Add cloud local-helper API in agent-service for pair, heartbeat, task pull, task start/continue/cancel.
- [x] Add PocketBase-backed store boundary for local helper devices, runs, steps, and candidate bundle artifacts.
- [x] Add local helper cloud client and local `/cloud/*` bridge endpoints.
- [x] Add 华锦兵器网 pilot harness boundary: login/captcha/CA states pause for human, post-login visible text becomes CandidateBundle.
- [x] Wrap local helper API with Electron tray and Windows protocol registration.
- [x] Add a real Playwright browser runtime with persistent profile and screenshot capture boundary.
- [x] Add `/cloud/tasks/:id/run` for 华锦 local-helper task execution.
- [x] Generate a Windows `win-unpacked` app directory for smoke verification.
- [ ] Build a one-file NSIS installer on Windows or Linux with `wine`. (deferred: needs Windows/wine; v1 ships `release/win-unpacked/`, build steps documented in local-helper-app/README.md)
- [x] Add a first-run pairing UI. (src/pairing.ts + src/renderer/pair.html|pair.js; auto-opens unpaired, tray 配对 entry)
- [x] Add second batch sites: 易派克, 云梦泽, 能源一号, 隆道云, 金能招标网. (config-driven site-harness profiles in src/site-profiles.ts; 易派克 also moved to cloud http_html; 能源一号=微信群粘贴/manual ingestion; 隆道云 & 金能 await a verified entry URL before seeding as local_helper sources)

## Current Verification Commands

- `cd agent-service && npm test -- src/local-helper-api.test.js`
- `cd local-helper-app && npm test`
- `cd local-helper-app && npm run build`
- `cd local-helper-app && npm run package:win-unpacked`
- `docker compose config --quiet`
