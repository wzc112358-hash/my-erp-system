import assert from 'node:assert/strict';
import test from 'node:test';

import { BID_RECORD_RETENTION_DAYS, bidRetentionCutoff } from './daily-runner.ts';

test('bid notices and run history retain only the latest seven days', () => {
  assert.equal(BID_RECORD_RETENTION_DAYS, 7);
  assert.equal(
    bidRetentionCutoff(new Date('2026-07-30T08:00:00.000Z')),
    '2026-07-23T08:00:00.000Z',
  );
});
