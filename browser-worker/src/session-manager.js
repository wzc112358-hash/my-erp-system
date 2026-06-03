import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { appendAccessToken, createAccessToken } from './access-token.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeBaseUrl = (value = '') => String(value || 'http://127.0.0.1:8095').replace(/\/+$/, '');
const normalizeProfileRoot = (value = '') => String(value || process.env.BROWSER_PROFILE_ROOT || '/browser_profiles').replace(/\/+$/, '');
const normalizeSessionStorePath = (value = '', profileRoot = '') => (
  String(value || process.env.BROWSER_SESSION_STORE_PATH || path.posix.join(normalizeProfileRoot(profileRoot), 'sessions.json'))
);

const normalizeTimestamp = (value = '') => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
};

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
  createdAt,
  updatedAt,
  expiresAt,
  publicBaseUrl,
  profileRoot,
  accessSecret,
  now = new Date(),
} = {}) => {
  const sessionCreatedAt = normalizeTimestamp(createdAt) || now.toISOString();
  const sessionUpdatedAt = normalizeTimestamp(updatedAt) || sessionCreatedAt;
  const sessionExpiresAt = normalizeTimestamp(expiresAt) || new Date(now.getTime() + SESSION_TTL_MS).toISOString();
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
    created_at: sessionCreatedAt,
    updated_at: sessionUpdatedAt,
    expires_at: sessionExpiresAt,
    access_tokens: [],
  };
  return {
    ...session,
    browser_url: appendAccessToken(session.browser_url, session, accessSecret),
  };
};

export const createSessionStore = ({
  publicBaseUrl = process.env.BROWSER_PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.BROWSER_WORKER_PORT || 8095}`,
  profileRoot = process.env.BROWSER_PROFILE_ROOT || '/browser_profiles',
  sessionStorePath,
  accessSecret = process.env.BROWSER_ACCESS_SECRET || '',
  now = () => new Date(),
} = {}) => {
  const storePath = normalizeSessionStorePath(sessionStorePath, profileRoot);
  const loadSessions = () => {
    try {
      if (!fs.existsSync(storePath)) return new Map();
      const raw = fs.readFileSync(storePath, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      const records = Array.isArray(parsed) ? parsed : Object.values(parsed);
      return new Map(records.filter(Boolean).map((session) => [
        session.id,
        {
          ...session,
          runtime_status: session.runtime_status === 'running' ? 'stopped' : (session.runtime_status || 'stopped'),
          runtime_url: '',
        },
      ]));
    } catch {
      return new Map();
    }
  };
  const sessions = loadSessions();

  const mergeSession = (session) => {
    const existing = sessions.get(session.id);
    if (!existing) return session;
    const accessTokens = new Set([
      ...(Array.isArray(existing.access_tokens) ? existing.access_tokens : []),
      createAccessToken(existing, accessSecret),
      createAccessToken(session, accessSecret),
    ].filter(Boolean));
    return {
      ...existing,
      ...session,
      access_tokens: [...accessTokens],
    };
  };

  const persist = () => {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const payload = JSON.stringify([...sessions.values()], null, 2);
    fs.writeFileSync(storePath, `${payload}\n`);
  };

  return {
    create(input = {}) {
      const session = createBrowserSession({
        ...input,
        publicBaseUrl,
        profileRoot,
        accessSecret,
        now: now(),
      });
      sessions.set(session.id, mergeSession(session));
      persist();
      return sessions.get(session.id);
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
      persist();
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
      persist();
      return updated;
    },
  };
};
