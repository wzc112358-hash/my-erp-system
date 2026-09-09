import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateContractNumber, normalizeContractNumber } from './contract-number.ts';

test('normalizes case and whitespace in contract numbers', () => {
  assert.equal(normalizeContractNumber('  LzX 2507 057 '), 'lzx2507057');
});

test('finds an existing duplicate without modifying the list', () => {
  const contracts = [{ id: 'a', no: 'LZX2507057' }];
  assert.equal(findDuplicateContractNumber(contracts, ' lzx 2507057 ')?.id, 'a');
  assert.deepEqual(contracts, [{ id: 'a', no: 'LZX2507057' }]);
  assert.equal(findDuplicateContractNumber(contracts, 'LZX2507058'), undefined);
});
