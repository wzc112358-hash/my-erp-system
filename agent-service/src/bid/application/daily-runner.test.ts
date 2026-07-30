import assert from 'node:assert/strict';
import test from 'node:test';

import { BID_RECORD_RETENTION_DAYS, bidRetentionCutoff } from './daily-runner.ts';

test('bid notices and run history retain only the latest ten days', () => {
  assert.equal(BID_RECORD_RETENTION_DAYS, 10);
  assert.equal(
    bidRetentionCutoff(new Date('2026-07-30T08:00:00.000Z')),
    '2026-07-20T08:00:00.000Z',
  );
});
