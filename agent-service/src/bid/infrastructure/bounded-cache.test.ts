import assert from 'node:assert/strict';
import test from 'node:test';

import { pruneExpiredAndLimit } from './bounded-cache.ts';

test('removes expired entries and caps the oldest live entries', () => {
  const cache = new Map([
    ['expired', { expiresAt: 99 }],
    ['oldest-live', { expiresAt: 200 }],
    ['newer-live', { expiresAt: 300 }],
    ['newest-live', { expiresAt: 400 }],
  ]);

  pruneExpiredAndLimit(cache, 2, 100);

  assert.deepEqual([...cache.keys()], ['newer-live', 'newest-live']);
});
