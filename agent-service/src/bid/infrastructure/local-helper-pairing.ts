import crypto from 'node:crypto';

import { asPocketBaseDate, type PocketBaseClient, type PocketBaseRecord } from './pocketbase-client.ts';

const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_TTL_MS = 10 * 60_000;

type DeviceRecord = PocketBaseRecord & Record<string, unknown>;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const createLocalHelperPairing = ({
  client,
  now = () => new Date(),
  randomBytes = crypto.randomBytes,
}: {
  client: PocketBaseClient;
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
}) => {
  const claimedCodes = new Set<string>();

  const generateCode = () => [...randomBytes(PAIRING_CODE_LENGTH)]
    .map((byte) => PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length])
    .join('');

  const createInvitation = async ({
    ownerUserId = '',
    ownerName,
  }: {
    ownerUserId?: string;
    ownerName: string;
  }) => {
    const pending = await client.listAll<DeviceRecord>('local_helper_devices', {
      filter: 'status = "pending_pair"',
    });
    for (const record of pending.filter((item) => String(item.owner_name || '') === ownerName)) {
      await client.update('local_helper_devices', record.id, {
        status: 'revoked',
        pair_code_hash: '',
        pair_code_expires_at: '',
      });
    }

    const code = generateCode();
    const expiresAt = new Date(now().getTime() + PAIRING_CODE_TTL_MS).toISOString();
    await client.create<DeviceRecord>('local_helper_devices', {
      ...(ownerUserId ? { owner_user: ownerUserId } : {}),
      owner_name: ownerName,
      device_name: '',
      device_fingerprint: `pending:${randomBytes(16).toString('hex')}`,
      status: 'pending_pair',
      pair_code_hash: sha256(code),
      pair_code_expires_at: asPocketBaseDate(expiresAt),
      access_token_hash: '',
      helper_version: '',
      platform: '',
      last_seen_at: '',
    });
    return { code, expiresAt, expiresInSeconds: PAIRING_CODE_TTL_MS / 1_000 };
  };

  const pair = async ({
    code,
    deviceName,
    deviceFingerprint,
    helperVersion,
    platform,
  }: {
    code: string;
    deviceName: string;
    deviceFingerprint: string;
    helperVersion: string;
    platform: string;
  }) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const codeHash = sha256(normalizedCode);
    if (!normalizedCode || claimedCodes.has(codeHash)) throw new Error('配对码无效或已使用');
    if (!deviceFingerprint) throw new Error('设备标识不能为空');
    claimedCodes.add(codeHash);
    try {
      const records = await client.listAll<DeviceRecord>('local_helper_devices', {
        filter: `pair_code_hash = "${codeHash}" && status = "pending_pair"`,
      });
      const record = records[0];
      if (!record) throw new Error('配对码无效或已使用');
      if (Date.parse(String(record.pair_code_expires_at || '')) <= now().getTime()) {
        await client.update('local_helper_devices', record.id, {
          status: 'revoked',
          pair_code_hash: '',
          pair_code_expires_at: '',
        });
        throw new Error('配对码已过期，请在 ERP 重新生成');
      }

      const token = randomBytes(32).toString('base64url');
      const pairedAt = now().toISOString();
      await client.update('local_helper_devices', record.id, {
        device_name: String(deviceName || 'Windows 本地助手').slice(0, 200),
        device_fingerprint: deviceFingerprint.slice(0, 500),
        status: 'active',
        pair_code_hash: '',
        pair_code_expires_at: '',
        access_token_hash: sha256(token),
        helper_version: String(helperVersion || '').slice(0, 40),
        platform: String(platform || '').slice(0, 80),
        last_seen_at: asPocketBaseDate(pairedAt),
      });
      return {
        paired: true,
        token,
        device: {
          id: record.id,
          ownerName: String(record.owner_name || ''),
          deviceName: String(deviceName || 'Windows 本地助手'),
        },
      };
    } finally {
      claimedCodes.delete(codeHash);
    }
  };

  const authenticate = async (token: string) => {
    if (!token) return null;
    const records = await client.listAll<DeviceRecord>('local_helper_devices', {
      filter: `access_token_hash = "${sha256(token)}" && status = "active"`,
    });
    const record = records[0];
    if (!record) return null;
    await client.update('local_helper_devices', record.id, {
      last_seen_at: asPocketBaseDate(now().toISOString()),
    });
    return record;
  };

  return { createInvitation, pair, authenticate };
};
