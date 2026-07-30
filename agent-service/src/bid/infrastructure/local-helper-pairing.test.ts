import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalHelperPairing } from './local-helper-pairing.ts';

type DeviceRecord = Record<string, unknown> & { id: string };

class FakeClient {
  records: DeviceRecord[] = [];

  async listAll(_collection: string, { filter = '' }: { filter?: string } = {}) {
    return this.records.filter((record) => {
      const pairHash = filter.match(/pair_code_hash = "([a-f0-9]+)"/)?.[1];
      const tokenHash = filter.match(/access_token_hash = "([a-f0-9]+)"/)?.[1];
      const status = filter.match(/status = "([a-z_]+)"/)?.[1];
      return (!pairHash || record.pair_code_hash === pairHash)
        && (!tokenHash || record.access_token_hash === tokenHash)
        && (!status || record.status === status);
    });
  }

  async create(_collection: string, payload: Record<string, unknown>) {
    const record = { id: `device-${this.records.length + 1}`, ...payload };
    this.records.push(record);
    return record;
  }

  async update(_collection: string, id: string, payload: Record<string, unknown>) {
    const index = this.records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error('device not found');
    this.records[index] = { ...this.records[index], ...payload };
    return this.records[index];
  }
}

test('ERP pairing code is short-lived, one-time and issues one device token', async () => {
  const client = new FakeClient();
  let randomSeed = 1;
  const pairing = createLocalHelperPairing({
    client: client as never,
    now: () => new Date('2026-07-30T02:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, randomSeed++),
  });

  const invitation = await pairing.createInvitation({
    ownerUserId: 'manager-1',
    ownerName: '张经理',
  });
  assert.match(invitation.code, /^[A-Z2-9]{8}$/);
  assert.equal(invitation.expiresAt, '2026-07-30T02:10:00.000Z');
  assert.notEqual(client.records[0].pair_code_hash, invitation.code);

  const paired = await pairing.pair({
    code: invitation.code,
    deviceName: '采购部-PC01',
    deviceFingerprint: 'PC01::Win32',
    helperVersion: '0.8.4',
    platform: 'win32',
  });
  assert.ok(paired.token.length >= 40);
  assert.equal(paired.device.ownerName, '张经理');
  assert.equal(client.records[0].status, 'active');
  assert.notEqual(client.records[0].access_token_hash, paired.token);

  await assert.rejects(() => pairing.pair({
    code: invitation.code,
    deviceName: '第二台电脑',
    deviceFingerprint: 'PC02::Win32',
    helperVersion: '0.8.4',
    platform: 'win32',
  }), /无效|已使用/);

  const authenticated = await pairing.authenticate(paired.token);
  assert.equal(authenticated?.id, 'device-1');
  assert.equal(await pairing.authenticate('wrong-token'), null);
});

test('generating a new code revokes an older pending code for the same manager', async () => {
  const client = new FakeClient();
  let randomSeed = 3;
  const pairing = createLocalHelperPairing({
    client: client as never,
    now: () => new Date('2026-07-30T02:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, randomSeed++),
  });

  const first = await pairing.createInvitation({ ownerUserId: 'manager-1', ownerName: '张经理' });
  const second = await pairing.createInvitation({ ownerUserId: 'manager-1', ownerName: '张经理' });

  assert.notEqual(first.code, second.code);
  assert.equal(client.records[0].status, 'revoked');
  assert.equal(client.records[1].status, 'pending_pair');
});
