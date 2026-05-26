import { createHash } from 'node:crypto';
import path from 'node:path';

import { appendAccessToken } from './access-token.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeBaseUrl = (value = '') => String(value || 'http://127.0.0.1:8095').replace(/\/+$/, '');
const normalizeProfileRoot = (value = '') => String(value || process.env.BROWSER_PROFILE_ROOT || '/browser_profiles').replace(/\/+$/, '');

const stableSessionId = ({ sourceId = '', sourceName = '', ownerName = '', loginUrl = '' } = {}) => {
  const identity = [sourceId, sourceName, ownerName, loginUrl].filter(Boolean).join('|');
  const digest = createHash('sha1').update(identity || 'unknown-source').digest('hex');
  return `session_${digest.slice(0, 12)}`;
};

export const createBrowserSession = ({
  sourceId = '',
  sourceName = '',
  ownerName = '',
  loginUrl = '',
  publicBaseUrl,
  profileRoot,
  accessSecret,
  now = new Date(),
} = {}) => {
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const id = stableSessionId({ sourceId, sourceName, ownerName, loginUrl });
  const baseUrl = normalizeBaseUrl(publicBaseUrl);

  const session = {
    id,
    source_id: sourceId,
    source_name: sourceName,
    owner_name: ownerName,
    status: 'login_required',
    login_url: loginUrl,
    target_url: loginUrl,
    browser_url: `${baseUrl}/sessions/${id}`,
    profile_ref: `profiles/${id}`,
    profile_dir: path.posix.join(normalizeProfileRoot(profileRoot), id),
    runtime_status: 'stopped',
    runtime_url: '',
    created_at: createdAt,
    updated_at: createdAt,
    expires_at: expiresAt,
  };
  return {
    ...session,
    browser_url: appendAccessToken(session.browser_url, session, accessSecret),
  };
};

export const createSessionStore = ({
  publicBaseUrl = process.env.BROWSER_PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.BROWSER_WORKER_PORT || 8095}`,
  profileRoot = process.env.BROWSER_PROFILE_ROOT || '/browser_profiles',
  accessSecret = process.env.BROWSER_ACCESS_SECRET || '',
  now = () => new Date(),
} = {}) => {
  const sessions = new Map();

  return {
    create(input = {}) {
      const session = createBrowserSession({
        ...input,
        publicBaseUrl,
        profileRoot,
        accessSecret,
        now: now(),
      });
      sessions.set(session.id, session);
      return session;
    },

    get(id) {
      return sessions.get(id) || null;
    },

    list() {
      return [...sessions.values()];
    },

    revoke(id, revokedAt = now()) {
      const session = sessions.get(id);
      if (!session) return null;
      const revoked = {
        ...session,
        status: 'revoked',
        runtime_status: 'stopped',
        updated_at: revokedAt.toISOString(),
      };
      sessions.set(id, revoked);
      return revoked;
    },

    updateRuntime(id, runtimePatch = {}, updatedAt = now()) {
      const session = sessions.get(id);
      if (!session) return null;
      const updated = {
        ...session,
        ...runtimePatch,
        updated_at: updatedAt.toISOString(),
      };
      sessions.set(id, updated);
      return updated;
    },
  };
};
