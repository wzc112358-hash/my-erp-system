const randomHex = (bytes = 4) => {
  const data = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(data);
  return [...data].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
};

export const normalizePairCode = (value = '') => String(value).replace(/[^a-z0-9]/gi, '').toUpperCase();

export const generatePairCode = () => randomHex(4);

export const hashPairCode = async (value = '') => {
  const normalized = normalizePairCode(value);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized),
  );
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
};

export const buildLocalHelperPairingPayload = async ({
  pairCode,
  ownerUser,
  ownerName,
  deviceName = '',
  deviceFingerprint = '',
  now = new Date(),
  ttlMinutes = 10,
}: {
  pairCode: string;
  ownerUser: string;
  ownerName: string;
  deviceName?: string;
  deviceFingerprint?: string;
  now?: Date;
  ttlMinutes?: number;
}) => ({
  owner_user: ownerUser,
  owner_name: ownerName,
  device_name: deviceName,
  device_fingerprint: deviceFingerprint,
  status: 'pending_pair' as const,
  pair_code_hash: await hashPairCode(pairCode),
  pair_code_expires_at: new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString(),
  access_token_hash: '',
  helper_version: '',
  platform: '',
  last_seen_at: '',
});

export const buildPairDeepLink = ({
  cloudUrl,
  pairCode,
}: {
  cloudUrl: string;
  pairCode: string;
}) => `hcz-helper://pair?cloudUrl=${encodeURIComponent(cloudUrl)}&code=${encodeURIComponent(normalizePairCode(pairCode))}`;
