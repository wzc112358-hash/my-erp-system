import { createHmac, timingSafeEqual } from 'node:crypto';

export const isAccessProtectionEnabled = (secret = process.env.BROWSER_ACCESS_SECRET || '') => (
  String(secret || '').trim().length > 0
);

export const createAccessToken = (session, secret = process.env.BROWSER_ACCESS_SECRET || '') => {
  if (!isAccessProtectionEnabled(secret)) return '';
  return createHmac('sha256', String(secret).trim())
    .update(`${session.id}|${session.expires_at || ''}`)
    .digest('hex');
};

export const verifyAccessToken = (session, token = '', secret = process.env.BROWSER_ACCESS_SECRET || '') => {
  if (!isAccessProtectionEnabled(secret)) return true;
  const actualBuffer = Buffer.from(String(token || ''), 'utf8');
  const expectedTokens = [
    createAccessToken(session, secret),
    ...(Array.isArray(session.access_tokens) ? session.access_tokens : []),
  ];
  return expectedTokens.some((expected) => {
    const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(actualBuffer, expectedBuffer);
  });
};

export const appendAccessToken = (browserUrl, session, secret = process.env.BROWSER_ACCESS_SECRET || '') => {
  if (!isAccessProtectionEnabled(secret)) return browserUrl;
  const url = new URL(browserUrl);
  url.searchParams.set('access_token', createAccessToken(session, secret));
  return url.toString();
};
