import assert from 'node:assert/strict';
import test from 'node:test';

import { isNewToday } from './notice-date.ts';

test('today-new marker follows the Shanghai business date', () => {
  const now = new Date('2026-07-29T16:30:00.000Z');
  assert.equal(isNewToday('2026-07-29T16:05:00.000Z', now), true);
  assert.equal(isNewToday('2026-07-29T15:59:59.000Z', now), false);
  assert.equal(isNewToday('', now), false);
});
