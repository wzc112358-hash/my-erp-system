import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAllContractRecords } from './contract-options.ts';

test('loads every contract option instead of truncating at the first 100 records', async () => {
  const records = Array.from({ length: 105 }, (_, index) => ({
    id: `sales-${index + 1}`,
    no: `LZX-${index + 1}`,
  }));
  let receivedOptions: Record<string, unknown> | undefined;

  const result = await loadAllContractRecords({
    getFullList: async (options) => {
      receivedOptions = options;
      return records;
    },
  });

  assert.equal(result.length, 105);
  assert.equal(result[104].id, 'sales-105');
  assert.deepEqual(receivedOptions, { sort: '-created_at' });
});
