import assert from 'node:assert/strict';
import test from 'node:test';

import { businessDateLabel, businessMonthKey, businessYearUtcRange } from './business-month.ts';

test('assigns UTC timestamps to their Asia/Shanghai business month', () => {
  assert.equal(businessMonthKey('2026-02-28T16:00:00.000Z'), '2026-03');
  assert.equal(businessMonthKey('2026-03-31T15:59:59.999Z'), '2026-03');
  assert.equal(businessMonthKey('2026-03-31T16:00:00.000Z'), '2026-04');
});

test('returns the UTC range for a Shanghai business year', () => {
  assert.deepEqual(businessYearUtcRange(2026), {
    start: '2025-12-31T16:00:00.000Z',
    end: '2026-12-31T16:00:00.000Z',
  });
});

test('formats a PocketBase timestamp as its Shanghai business date', () => {
  assert.equal(businessDateLabel('2026-02-28T16:00:00.000Z'), '2026-03-01');
});
