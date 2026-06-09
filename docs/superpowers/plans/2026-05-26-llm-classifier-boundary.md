# LLM Classifier Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional LLM enhancement boundary to the Node opportunity agent without replacing the current rule-based classifier or committing to Python/LangGraph yet.

**Architecture:** Keep deterministic keyword/rule classification as the baseline. Add a small HTTP client module that sends normalized candidate text and rule evidence to an external LLM classifier service when `LLM_CLASSIFIER_URL` is configured. Add an async candidate processing path used by the scheduler and dry-run flows; failed or disabled LLM calls fall back to the rule result.

**Tech Stack:** Node.js 22, built-in `fetch`, `node:test`, existing PocketBase payload shape.

---

## Task 1: LLM Classifier Client

**Files:**
- Create: `agent-service/src/domain/llm-classifier.js`
- Create: `agent-service/src/domain/llm-classifier.test.js`

- [ ] Add failing tests for request payload shape, response validation, disabled behavior, and failure fallback.
- [ ] Implement `buildLlmClassifierPayload`, `normalizeLlmClassification`, and `classifyWithLlm`.
- [ ] Run `npm test` in `agent-service`.

## Task 2: Async Candidate Processing

**Files:**
- Modify: `agent-service/src/domain/candidate.js`
- Modify: `agent-service/src/opportunity-agent.js`
- Modify: `agent-service/src/opportunity-agent.test.js`

- [ ] Add failing tests for `processCandidatesWithEnhancement` merging LLM output while keeping rule fallback.
- [ ] Implement async processing that calls `classifyWithLlm` after rule classification.
- [ ] Export the new function from `opportunity-agent.js`.
- [ ] Run `npm test` in `agent-service`.

## Task 3: Scheduler And Dry-Run Integration

**Files:**
- Modify: `agent-service/src/index.js`
- Modify: `agent-service/src/index.test.js`

- [ ] Add failing test that `runPublicUrlDryRun` can use an injected classifier enhancer.
- [ ] Update `runOnce`, `runDryRunJson`, and `runPublicUrlDryRun` to use async enhancement where practical.
- [ ] Keep all existing behavior unchanged when `LLM_CLASSIFIER_URL` is empty.
- [ ] Run `npm test` in `agent-service`.

## Task 4: Full Verification

Run:

```bash
cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/agent-service
npm test

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/browser-worker
npm test

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/backend
PATH="$HOME/.local/go/bin:$PATH" GOPROXY=https://goproxy.cn,direct go test ./...

cd /home/wzc11/projects/my-erp-system/.worktrees/agent-opportunity-monitor/frontend
npm run build
```

Expected: all commands exit 0.
