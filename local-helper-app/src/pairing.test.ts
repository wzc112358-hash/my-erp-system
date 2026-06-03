import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CLOUD_URL, buildPairPayload, validatePairForm } from './pairing.ts';

test('validatePairForm requires a pair code', () => {
  const result = validatePairForm({ cloudUrl: 'https://agent.henghuacheng.cn', code: '' });
  assert.equal(result.valid, false);
  assert.match(result.errors.code || '', /配对码/);
});

test('validatePairForm defaults cloudUrl when blank', () => {
  const result = validatePairForm({ code: 'PAIR123' });
  assert.equal(result.valid, true);
  assert.equal(result.normalized.cloudUrl, DEFAULT_CLOUD_URL);
});

test('validatePairForm rejects a malformed cloud url', () => {
  const result = validatePairForm({ cloudUrl: 'agent.henghuacheng.cn', code: 'PAIR123' });
  assert.equal(result.valid, false);
  assert.match(result.errors.cloudUrl || '', /http/);
});

test('buildPairPayload throws on invalid input', () => {
  assert.throws(() => buildPairPayload({ code: '' }), /配对码/);
});

test('buildPairPayload strips trailing slash and mirrors device fingerprint', () => {
  const payload = buildPairPayload(
    { cloudUrl: 'https://agent.henghuacheng.cn/', code: 'PAIR123', deviceName: 'WX-PC-01' },
  );
  assert.equal(payload.cloudUrl, 'https://agent.henghuacheng.cn');
  assert.equal(payload.code, 'PAIR123');
  assert.equal(payload.deviceName, 'WX-PC-01');
  assert.equal(payload.deviceFingerprint, 'WX-PC-01');
});

test('buildPairPayload falls back to machine name from env', () => {
  const payload = buildPairPayload({ code: 'PAIR123' }, { COMPUTERNAME: 'XIAOWEI-PC' });
  assert.equal(payload.deviceName, 'XIAOWEI-PC');
  assert.equal(payload.deviceFingerprint, 'XIAOWEI-PC');
});
