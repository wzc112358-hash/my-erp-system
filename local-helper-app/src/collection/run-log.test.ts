import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createAgentHarnessStore } from './run-log.ts';

test('agent harness store persists runs and ordered steps with redaction', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcz-agent-harness-'));
  const store = createAgentHarnessStore({ rootDir });

  const run = await store.startRun({
    taskId: 'task-1',
    sourceName: '中石油招投标网',
    entryUrl: 'https://www.cnpcbidding.com/#/tenders',
    searchTerms: '白油,TCP2',
    trigger: 'manual_test',
  });
  await store.appendStep(run.id, {
    phase: 'discover',
    action: 'firecrawl.search',
    tool: 'firecrawl',
    result: {
      linkCount: 2,
      token: 'should-not-leak',
    },
  });
  await store.appendStep(run.id, {
    phase: 'browser',
    action: 'chrome.open',
    observation: {
      url: 'https://www.cnpcbidding.com/',
      cookie: 'secret',
    },
  });
  await store.finishRun(run.id, {
    status: 'completed',
    resultSummary: '识别到 2 条候选公告。',
  });

  const detail = await store.getRun(run.id);
  assert.equal(detail.run.status, 'completed');
  assert.equal(detail.run.taskId, 'task-1');
  assert.equal(detail.steps.length, 2);
  assert.equal(detail.steps[0].stepIndex, 1);
  assert.equal(detail.steps[1].stepIndex, 2);
  assert.equal((detail.steps[0].result as Record<string, unknown>).token, '[redacted]');
  assert.equal((detail.steps[1].observation as Record<string, unknown>).cookie, '[redacted]');

  const runs = await store.listRuns();
  assert.equal(runs[0].id, run.id);
});
