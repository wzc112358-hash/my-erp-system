import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  buildLocalHelperTaskDeepLink,
  buildLocalHelperPairingPayload,
  hashPairCode,
  normalizePairCode,
} from './local-helper-pairing.ts';

test('local helper pairing normalizes and hashes pair codes', async () => {
  assert.equal(normalizePairCode(' abcd-1234 '), 'ABCD1234');
  assert.notEqual(await hashPairCode('ABCD1234'), 'ABCD1234');
  assert.equal(await hashPairCode('abcd-1234'), await hashPairCode('ABCD1234'));
});

test('local helper pairing payload stores only pair code hash and expiry', async () => {
  const payload = await buildLocalHelperPairingPayload({
    pairCode: 'ABCD1234',
    ownerUser: 'user-1',
    ownerName: '小魏',
    now: new Date('2026-05-28T01:00:00.000Z'),
  });

  assert.equal(payload.owner_user, 'user-1');
  assert.equal(payload.owner_name, '小魏');
  assert.equal(payload.status, 'pending_pair');
  assert.equal(payload.pair_code_expires_at, '2026-05-28T01:10:00.000Z');
  assert.equal(payload.pair_code_hash.includes('ABCD1234'), false);
});

test('local helper task deep link targets the cloud task detail window', () => {
  assert.equal(
    buildLocalHelperTaskDeepLink('task 华锦/1'),
    'hcz-helper://task/task%20%E5%8D%8E%E9%94%A6%2F1',
  );
});
