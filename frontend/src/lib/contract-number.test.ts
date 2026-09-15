import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateContractNumber, normalizeContractNumber } from './contract-number.ts';

test('normalizes case and whitespace in contract numbers', () => {
  assert.equal(normalizeContractNumber('  LzX 2507 057 '), 'lzx2507057');
});

test('only treats the same normalized contract number and product name as duplicate', () => {
  const contracts = [{ id: 'a', no: 'LZX2507057', product_name: '白油 32#' }];
  assert.equal(findDuplicateContractNumber(contracts, ' lzx 2507057 ', ' 白油32# ')?.id, 'a');
  assert.equal(findDuplicateContractNumber(contracts, 'LZX2507057', '抗氧剂'), undefined);
  assert.equal(findDuplicateContractNumber(contracts, 'LZX2507058', '白油32#'), undefined);
  assert.deepEqual(contracts, [{ id: 'a', no: 'LZX2507057', product_name: '白油 32#' }]);
});
