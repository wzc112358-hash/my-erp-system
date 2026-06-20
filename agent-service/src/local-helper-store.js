import crypto from 'node:crypto';

import { ingestCandidateBundleArtifact } from './local-helper-ingestion.js';

const API_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
const SUPERUSER_PASSWORD = process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;
const LOCAL_HELPER_LATEST_VERSION = process.env.LOCAL_HELPER_LATEST_VERSION || '0.1.14';
const LOCAL_HELPER_MIN_SUPPORTED_VERSION = process.env.LOCAL_HELPER_MIN_SUPPORTED_VERSION || '0.1.14';
const LOCAL_HELPER_DOWNLOAD_BASE_URL = (process.env.LOCAL_HELPER_DOWNLOAD_BASE_URL || 'https://erp.henghuacheng.cn/downloads').replace(/\/+$/, '');
const LOCAL_HELPER_PORTABLE_SHA256 = process.env.LOCAL_HELPER_PORTABLE_SHA256 || '';
const LOCAL_HELPER_INSTALLER_SHA256 = process.env.LOCAL_HELPER_INSTALLER_SHA256 || '';
const LOCAL_HELPER_INSTALLER_AVAILABLE = process.env.LOCAL_HELPER_INSTALLER_AVAILABLE !== '0';
const LOCAL_HELPER_RELEASE_MANIFEST_URL = process.env.LOCAL_HELPER_RELEASE_MANIFEST_URL || '';
const LOCAL_HELPER_RELEASE_MANIFEST_CACHE_MS = Number(process.env.LOCAL_HELPER_RELEASE_MANIFEST_CACHE_MS || 5 * 60 * 1000);

let releaseManifestCache = {
  url: '',
  expiresAt: 0,
  value: null,
};

const shanghaiIso = (date = new Date()) => {
  const offsetMs = 8 * 60 * 60 * 1000;
  return `${new Date(date.getTime() + offsetMs).toISOString().replace('Z', '')}+08:00`;
};

const escapeFilterValue = (value = '') => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const hashSecret = (value = '') => crypto
  .createHash('sha256')
  .update(String(value))
  .digest('hex');

export const generatePairCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

export const generateDeviceToken = () => `hczlh_${crypto.randomBytes(24).toString('hex')}`;

export const compareVersions = (a = '', b = '') => {
  const left = String(a || '0').split(/[.-]/).map((part) => Number(part) || 0);
  const right = String(b || '0').split(/[.-]/).map((part) => Number(part) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
};

export const buildLocalHelperReleaseInfo = ({
  currentVersion = '',
  latestVersion = LOCAL_HELPER_LATEST_VERSION,
  minSupportedVersion = LOCAL_HELPER_MIN_SUPPORTED_VERSION,
  downloadBaseUrl = LOCAL_HELPER_DOWNLOAD_BASE_URL,
  portableSha256 = LOCAL_HELPER_PORTABLE_SHA256,
  installerSha256 = LOCAL_HELPER_INSTALLER_SHA256,
  installerAvailable = LOCAL_HELPER_INSTALLER_AVAILABLE,
} = {}) => ({
  latestVersion,
  minSupportedVersion,
  portableUrl: `${downloadBaseUrl}/hcz-local-helper-app.zip`,
  installerUrl: installerAvailable || installerSha256
    ? `${downloadBaseUrl}/hcz-local-helper-setup.exe`
    : '',
  sha256Url: `${downloadBaseUrl}/SHA256SUMS.txt`,
  portableSha256,
  installerSha256,
  updateAvailable: currentVersion ? compareVersions(latestVersion, currentVersion) > 0 : false,
  updateRequired: currentVersion ? compareVersions(minSupportedVersion, currentVersion) > 0 : false,
  notes: '建议使用最新本地助手；若提示必须升级，请先下载新版本再继续采集。',
});

const shaFromManifest = (manifest, fileKey) => {
  const value = manifest?.files?.[fileKey]?.sha256;
  return typeof value === 'string' ? value.trim() : '';
};

const fetchReleaseManifest = async ({
  manifestUrl = LOCAL_HELPER_RELEASE_MANIFEST_URL,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) => {
  if (!manifestUrl) return null;
  const cacheKey = String(manifestUrl);
  const timestamp = now().getTime();
  if (
    releaseManifestCache.url === cacheKey &&
    releaseManifestCache.value &&
    releaseManifestCache.expiresAt > timestamp
  ) {
    return releaseManifestCache.value;
  }
  try {
    const response = await fetchImpl(cacheKey, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const manifest = await response.json();
    if (!manifest || typeof manifest !== 'object') return null;
    releaseManifestCache = {
      url: cacheKey,
      expiresAt: timestamp + LOCAL_HELPER_RELEASE_MANIFEST_CACHE_MS,
      value: manifest,
    };
    return manifest;
  } catch {
    return null;
  }
};

export const resolveLocalHelperReleaseInfo = async ({
  currentVersion = '',
  latestVersion = LOCAL_HELPER_LATEST_VERSION,
  minSupportedVersion = LOCAL_HELPER_MIN_SUPPORTED_VERSION,
  downloadBaseUrl = LOCAL_HELPER_DOWNLOAD_BASE_URL,
  portableSha256 = LOCAL_HELPER_PORTABLE_SHA256,
  installerSha256 = LOCAL_HELPER_INSTALLER_SHA256,
  manifestUrl = LOCAL_HELPER_RELEASE_MANIFEST_URL,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) => {
  if (portableSha256 && installerSha256) {
    return buildLocalHelperReleaseInfo({
      currentVersion,
      latestVersion,
      minSupportedVersion,
      downloadBaseUrl,
      portableSha256,
      installerSha256,
    });
  }
  const manifest = await fetchReleaseManifest({ manifestUrl, fetchImpl, now });
  const resolvedLatestVersion = typeof manifest?.version === 'string' && manifest.version.trim()
    ? manifest.version.trim()
    : latestVersion;
  return buildLocalHelperReleaseInfo({
    currentVersion,
    latestVersion: resolvedLatestVersion,
    minSupportedVersion,
    downloadBaseUrl,
    portableSha256: portableSha256 || shaFromManifest(manifest, 'portable'),
    installerSha256: installerSha256 || shaFromManifest(manifest, 'installer'),
  });
};

const normalizeTask = (task = {}) => ({
  id: task.id || '',
  sourceId: task.source || task.sourceId || '',
  sourceName: task.source_name || task.sourceName || '',
  ownerName: task.owner_name || task.ownerName || '',
  taskType: task.task_type || task.taskType || 'local_helper',
  status: task.status || 'pending',
  reason: task.reason || '',
  requiredArtifact: task.required_artifact || task.requiredArtifact || '',
  entryUrl: task.entry_url || task.entryUrl || '',
  searchTerms: task.search_terms || task.searchTerms || '',
  actionSteps: task.action_steps || task.actionSteps || '',
  dueAt: task.due_at || task.dueAt || '',
  updatedAt: task.updated || task.updatedAt || '',
});

const normalizeArtifact = (artifact = {}, task = {}, run = {}) => ({
  artifactType: artifact.artifact_type || artifact.artifactType || '',
  title: artifact.title || `${task.sourceName || task.source_name || '本地助手'} 采集证据`,
  url: artifact.url || '',
  content: typeof artifact.content === 'string'
    ? artifact.content
    : JSON.stringify(artifact.content ?? ''),
  mimeType: artifact.mime_type || artifact.mimeType || 'text/plain',
  taskId: task.id || '',
  runId: run?.id || '',
});

const supportedArtifactTypes = new Set([
  'candidate_bundle',
  'dom_snapshot',
  'network_response',
  'screenshot',
  'attachment',
  'manual_text',
  'log',
]);

export const createInMemoryLocalHelperStore = ({
  now = () => new Date(),
  tokenFactory = generateDeviceToken,
  ingestCandidateBundle = async () => null,
  releaseFetchImpl = fetch,
  releaseManifestUrl = LOCAL_HELPER_RELEASE_MANIFEST_URL,
} = {}) => {
  const devices = new Map();
  const pairCodes = new Map();
  const tokens = new Map();
  const tasks = new Map();
  const runs = new Map();
  const steps = [];
  const artifacts = [];

  const createPairCode = ({
    code = generatePairCode(),
    ownerUser = '',
    ownerName,
    deviceName = '',
    deviceFingerprint = '',
    expiresAt = new Date(now().getTime() + 10 * 60 * 1000),
  } = {}) => {
    if (!ownerName) throw new Error('ownerName is required');
    const normalizedCode = String(code).trim().toUpperCase();
    const deviceId = `device-${devices.size + 1}`;
    const device = {
      id: deviceId,
      owner_user: ownerUser,
      owner_name: ownerName,
      device_name: deviceName,
      device_fingerprint: deviceFingerprint,
      status: 'pending_pair',
      pair_code_hash: hashSecret(normalizedCode),
      pair_code_expires_at: expiresAt.toISOString(),
      last_seen_at: '',
    };
    devices.set(deviceId, device);
    pairCodes.set(device.pair_code_hash, deviceId);
    return {
      code: normalizedCode,
      expiresAt: device.pair_code_expires_at,
      device: normalizeDevice(device),
    };
  };

  const normalizeDevice = (device = {}) => ({
    id: device.id || '',
    ownerUser: device.owner_user || '',
    ownerName: device.owner_name || '',
    deviceName: device.device_name || '',
    deviceFingerprint: device.device_fingerprint || '',
    status: device.status || '',
    helperVersion: device.helper_version || '',
    platform: device.platform || '',
    lastSeenAt: device.last_seen_at || '',
  });

  const authenticate = (token = '') => {
    const deviceId = tokens.get(hashSecret(token));
    const device = devices.get(deviceId);
    if (!device || device.status !== 'active') throw new Error('invalid local helper token');
    return device;
  };

  return {
    createPairCode,

    addTask(task) {
      const normalized = normalizeTask({
        ...task,
        updated: task.updated || now().toISOString(),
      });
      tasks.set(normalized.id, normalized);
      return normalized;
    },

    pairDevice({
      code,
      deviceName = '',
      deviceFingerprint = '',
      helperVersion = '',
      platform = '',
    } = {}) {
      const codeHash = hashSecret(String(code || '').trim().toUpperCase());
      const deviceId = pairCodes.get(codeHash);
      const device = devices.get(deviceId);
      if (!device || device.status !== 'pending_pair') throw new Error('invalid or used pair code');
      if (device.pair_code_expires_at && new Date(device.pair_code_expires_at).getTime() < now().getTime()) {
        throw new Error('pair code expired');
      }
      const token = tokenFactory();
      const updated = {
        ...device,
        status: 'active',
        device_name: deviceName || device.device_name,
        device_fingerprint: deviceFingerprint || device.device_fingerprint,
        helper_version: helperVersion,
        platform,
        access_token_hash: hashSecret(token),
        last_seen_at: now().toISOString(),
      };
      devices.set(deviceId, updated);
      pairCodes.delete(codeHash);
      tokens.set(updated.access_token_hash, deviceId);
      return {
        paired: true,
        token,
        device: normalizeDevice(updated),
      };
    },

    async heartbeat(token, payload = {}) {
      const device = authenticate(token);
      const updated = {
        ...device,
        helper_version: payload.helperVersion || device.helper_version || '',
        platform: payload.platform || device.platform || '',
        last_seen_at: now().toISOString(),
      };
      devices.set(device.id, updated);
      return {
        ok: true,
        device: normalizeDevice(updated),
        release: await resolveLocalHelperReleaseInfo({
          currentVersion: updated.helper_version,
          manifestUrl: releaseManifestUrl,
          fetchImpl: releaseFetchImpl,
          now,
        }),
      };
    },

    async releaseInfo({ currentVersion = '' } = {}) {
      return resolveLocalHelperReleaseInfo({
        currentVersion,
        manifestUrl: releaseManifestUrl,
        fetchImpl: releaseFetchImpl,
        now,
      });
    },

    listTasks(token) {
      authenticate(token);
      return [...tasks.values()]
        .filter((task) => task.taskType === 'local_helper')
        .filter((task) => !['completed', 'cancelled', 'failed'].includes(task.status))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },

    startTask(token, taskId) {
      const device = authenticate(token);
      const task = tasks.get(taskId);
      if (!task) throw new Error(`task not found: ${taskId}`);
      const updatedTask = {
        ...task,
        status: 'in_progress',
        updatedAt: now().toISOString(),
      };
      tasks.set(taskId, updatedTask);
      const run = {
        id: `run-${runs.size + 1}`,
        deviceId: device.id,
        taskId,
        sourceName: task.sourceName,
        ownerName: task.ownerName,
        entryUrl: task.entryUrl,
        status: 'running',
        startedAt: now().toISOString(),
      };
      runs.set(run.id, run);
      return { task: updatedTask, run };
    },

    async continueTask(token, taskId, payload = {}) {
      const device = authenticate(token);
      const task = tasks.get(taskId);
      if (!task) throw new Error(`task not found: ${taskId}`);
      const run = [...runs.values()].reverse().find((item) => item.deviceId === device.id && item.taskId === taskId);
      const status = payload.status || (payload.requestHuman ? 'request_human' : 'running');
      const step = {
        id: `step-${steps.length + 1}`,
        runId: run?.id || '',
        taskId,
        actor: 'local_helper',
        observation: payload.observation || '',
        action: payload.action || '',
        result: payload.result || '',
        createdAt: now().toISOString(),
      };
      steps.push(step);
      if (payload.candidateBundle) {
        artifacts.push({
          id: `artifact-${artifacts.length + 1}`,
          taskId,
          runId: run?.id || '',
          artifactType: 'candidate_bundle',
          title: `${task.sourceName} CandidateBundle`,
          content: JSON.stringify(payload.candidateBundle),
        });
      }
      if (payload.screenshotPath) {
        artifacts.push({
          id: `artifact-${artifacts.length + 1}`,
          taskId,
          runId: run?.id || '',
          artifactType: 'screenshot',
          title: `${task.sourceName} 截图`,
          url: payload.currentUrl || '',
          content: payload.screenshotPath,
        });
      }
      if (payload.log || payload.observation) {
        artifacts.push({
          id: `artifact-${artifacts.length + 1}`,
          taskId,
          runId: run?.id || '',
          artifactType: 'log',
          title: `${task.sourceName} 本地助手日志`,
          url: payload.currentUrl || '',
          content: payload.log || payload.observation || '',
        });
      }
      for (const rawArtifact of payload.artifacts || []) {
        const artifact = normalizeArtifact(rawArtifact, task, run);
        if (!supportedArtifactTypes.has(artifact.artifactType)) continue;
        artifacts.push({
          id: `artifact-${artifacts.length + 1}`,
          taskId,
          runId: run?.id || '',
          artifactType: artifact.artifactType,
          title: artifact.title,
          url: artifact.url,
          content: artifact.content,
          mimeType: artifact.mimeType,
        });
      }
      const ingestion = payload.candidateBundle
        ? await ingestCandidateBundle({
          task,
          run: run || null,
          candidateBundle: payload.candidateBundle,
        })
        : null;
      const finalStatus = ingestion?.status || status;
      if (run) {
        runs.set(run.id, {
          ...run,
          status: finalStatus,
          currentUrl: payload.currentUrl || run.currentUrl || '',
          lastObservation: payload.observation || run.lastObservation || '',
        });
      }
      if (ingestion && status === 'completed') {
        tasks.set(taskId, {
          ...task,
          status: finalStatus,
          resultSummary: ingestion.resultSummary ||
            (finalStatus === 'completed'
              ? `本地助手回灌完成：候选 ${ingestion.processedCount} 条，入库 ${ingestion.createdCount} 条。`
              : `本地助手已采集候选 ${ingestion.processedCount} 条，但没有生成可入库商机。请继续人工处理。`),
          updatedAt: now().toISOString(),
        });
      }
      return {
        status: finalStatus,
        step,
        run: run ? runs.get(run.id) : null,
        ingestion,
        nextAction: payload.requestHuman || finalStatus === 'request_human'
          ? { type: 'request_human', reason: payload.humanReason || ingestion?.resultSummary || '需要员工人工接管' }
          : { type: 'wait_cloud_agent' },
      };
    },

    cancelTask(token, taskId) {
      const device = authenticate(token);
      const task = tasks.get(taskId);
      if (!task) throw new Error(`task not found: ${taskId}`);
      const updatedTask = {
        ...task,
        status: 'cancelled',
        updatedAt: now().toISOString(),
      };
      tasks.set(taskId, updatedTask);
      return { task: updatedTask };
    },

    debugState() {
      return { devices, pairCodes, tokens, tasks, runs, steps, artifacts };
    },
  };
};

export const createPocketBaseLocalHelperStore = ({
  apiUrl = API_URL,
  superuserEmail = SUPERUSER_EMAIL,
  superuserPassword = SUPERUSER_PASSWORD,
  fetchImpl = fetch,
  releaseFetchImpl = fetch,
  releaseManifestUrl = LOCAL_HELPER_RELEASE_MANIFEST_URL,
  now = () => new Date(),
  ingestCandidateBundle = ingestCandidateBundleArtifact,
} = {}) => {
  let cachedToken = '';

  const pbRequest = async (path, options = {}) => {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }
    if (response.status === 204) return null;
    return response.json();
  };

  const login = async () => {
    if (cachedToken) return cachedToken;
    if (!superuserEmail || !superuserPassword) {
      throw new Error('POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD are required');
    }
    const result = await pbRequest('/api/collections/_superusers/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({ identity: superuserEmail, password: superuserPassword }),
    });
    cachedToken = result.token;
    return cachedToken;
  };

  const listRecords = async (collection, filter, { sort = '-updated', perPage = 100 } = {}) => {
    const token = await login();
    const query = new URLSearchParams({
      perPage: String(perPage),
      sort,
      ...(filter ? { filter } : {}),
    });
    const result = await pbRequest(`/api/collections/${collection}/records?${query.toString()}`, { token });
    return result.items || [];
  };

  const updateRecord = async (collection, id, data) => {
    const token = await login();
    return pbRequest(`/api/collections/${collection}/records/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    });
  };

  const getRecord = async (collection, id) => {
    const token = await login();
    return pbRequest(`/api/collections/${collection}/records/${encodeURIComponent(id)}`, { token });
  };

  const createRecord = async (collection, data) => {
    const token = await login();
    return pbRequest(`/api/collections/${collection}/records`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    });
  };

  const authenticate = async (rawToken = '') => {
    const tokenHash = hashSecret(rawToken);
    const devices = await listRecords(
      'local_helper_devices',
      `access_token_hash = "${escapeFilterValue(tokenHash)}" && status = "active"`,
      { perPage: 1 },
    );
    const device = devices[0];
    if (!device) throw new Error('invalid local helper token');
    return device;
  };

  const ensureLocalHelperTaskForDevice = async (taskId, device) => {
    const task = await getRecord('agent_tasks', taskId);
    if (task.task_type !== 'local_helper') throw new Error('task is not a local-helper task');
    return task;
  };

  return {
    async pairDevice({
      code,
      deviceName = '',
      deviceFingerprint = '',
      helperVersion = '',
      platform = '',
    } = {}) {
      const codeHash = hashSecret(String(code || '').trim().toUpperCase());
      const devices = await listRecords(
        'local_helper_devices',
        `pair_code_hash = "${escapeFilterValue(codeHash)}" && status = "pending_pair"`,
        { perPage: 1 },
      );
      const device = devices[0];
      if (!device) throw new Error('invalid or used pair code');
      if (device.pair_code_expires_at && new Date(device.pair_code_expires_at).getTime() < now().getTime()) {
        throw new Error('pair code expired');
      }
      const rawToken = generateDeviceToken();
      const updated = await updateRecord('local_helper_devices', device.id, {
        status: 'active',
        device_name: deviceName || device.device_name || '',
        device_fingerprint: deviceFingerprint || device.device_fingerprint || '',
        helper_version: helperVersion,
        platform,
        access_token_hash: hashSecret(rawToken),
        last_seen_at: shanghaiIso(now()),
      });

      return {
        paired: true,
        token: rawToken,
        device: {
          id: updated.id,
          ownerName: updated.owner_name,
          deviceName: updated.device_name,
          deviceFingerprint: updated.device_fingerprint,
          status: updated.status,
          helperVersion: updated.helper_version,
          platform: updated.platform,
          lastSeenAt: updated.last_seen_at,
        },
      };
    },

    async heartbeat(rawToken, payload = {}) {
      const device = await authenticate(rawToken);
      const updated = await updateRecord('local_helper_devices', device.id, {
        helper_version: payload.helperVersion || device.helper_version || '',
        platform: payload.platform || device.platform || '',
        last_seen_at: shanghaiIso(now()),
      });
      return {
        ok: true,
        device: updated,
        release: await resolveLocalHelperReleaseInfo({
          currentVersion: updated.helper_version,
          manifestUrl: releaseManifestUrl,
          fetchImpl: releaseFetchImpl,
          now,
        }),
      };
    },

    async releaseInfo({ currentVersion = '' } = {}) {
      return resolveLocalHelperReleaseInfo({
        currentVersion,
        manifestUrl: releaseManifestUrl,
        fetchImpl: releaseFetchImpl,
        now,
      });
    },

    async listTasks(rawToken) {
      await authenticate(rawToken);
      const filter = [
        'task_type = "local_helper"',
        'status != "completed"',
        'status != "cancelled"',
        'status != "failed"',
      ].join(' && ');
      const tasks = await listRecords('agent_tasks', filter, { sort: '-updated' });
      return tasks.map(normalizeTask);
    },

    async startTask(rawToken, taskId) {
      const device = await authenticate(rawToken);
      await ensureLocalHelperTaskForDevice(taskId, device);
      const task = await updateRecord('agent_tasks', taskId, { status: 'in_progress' });
      const run = await createRecord('local_helper_runs', {
        device: device.id,
        agent_task: task.id,
        source: task.source || '',
        source_name: task.source_name || '',
        owner_name: task.owner_name || device.owner_name || '',
        status: 'running',
        entry_url: task.entry_url || '',
        started_at: shanghaiIso(now()),
      });
      return { task: normalizeTask(task), run };
    },

    async continueTask(rawToken, taskId, payload = {}) {
      const device = await authenticate(rawToken);
      const task = await ensureLocalHelperTaskForDevice(taskId, device);
      const runFilter = `device = "${escapeFilterValue(device.id)}" && agent_task = "${escapeFilterValue(taskId)}"`;
      const runs = await listRecords('local_helper_runs', runFilter, { sort: '-created', perPage: 1 });
      const run = runs[0] || await createRecord('local_helper_runs', {
        device: device.id,
        agent_task: taskId,
        source: task.source || '',
        source_name: payload.sourceName || task.source_name || '',
        owner_name: task.owner_name || device.owner_name || '',
        status: 'running',
      });
      const status = payload.status || (payload.requestHuman ? 'request_human' : 'running');
      const updatedRun = await updateRecord('local_helper_runs', run.id, {
        status,
        current_url: payload.currentUrl || '',
        last_observation: payload.observation || '',
        error_message: payload.error || '',
        ...(status === 'completed' ? { finished_at: shanghaiIso(now()) } : {}),
      });
      const step = await createRecord('local_agent_steps', {
        local_helper_run: updatedRun.id,
        step_index: payload.stepIndex || 0,
        actor: 'local_helper',
        observation: payload.observation || '',
        action: payload.action || '',
        result: payload.result || '',
        error_message: payload.error || '',
      });
      if (payload.candidateBundle) {
        await createRecord('agent_artifacts', {
          local_helper_run: updatedRun.id,
          agent_task: taskId,
          artifact_type: 'candidate_bundle',
          title: `${updatedRun.source_name || payload.sourceName || '本地助手'} CandidateBundle`,
          url: payload.currentUrl || '',
          content: JSON.stringify(payload.candidateBundle),
          mime_type: 'application/json',
        });
      }
      if (payload.screenshotPath) {
        await createRecord('agent_artifacts', {
          local_helper_run: updatedRun.id,
          agent_task: taskId,
          artifact_type: 'screenshot',
          title: `${updatedRun.source_name || payload.sourceName || '本地助手'} 截图`,
          url: payload.currentUrl || '',
          content: payload.screenshotPath,
          mime_type: 'text/plain',
        });
      }
      if (payload.log || payload.observation) {
        await createRecord('agent_artifacts', {
          local_helper_run: updatedRun.id,
          agent_task: taskId,
          artifact_type: 'log',
          title: `${updatedRun.source_name || payload.sourceName || '本地助手'} 本地助手日志`,
          url: payload.currentUrl || '',
          content: payload.log || payload.observation || '',
          mime_type: 'text/plain',
        });
      }
      for (const rawArtifact of payload.artifacts || []) {
        const artifact = normalizeArtifact(rawArtifact, task, updatedRun);
        if (!supportedArtifactTypes.has(artifact.artifactType)) continue;
        await createRecord('agent_artifacts', {
          local_helper_run: updatedRun.id,
          agent_task: taskId,
          artifact_type: artifact.artifactType,
          title: artifact.title,
          url: artifact.url || payload.currentUrl || '',
          content: artifact.content,
          mime_type: artifact.mimeType,
        });
      }
      const ingestion = payload.candidateBundle
        ? await ingestCandidateBundle({
          token: await login(),
          task,
          run: updatedRun,
          candidateBundle: payload.candidateBundle,
          listRecordsFn: (collection, _token, queryOrFilter = '') => listRecords(collection, queryOrFilter),
          createRecordFn: (collection, _token, data) => createRecord(collection, data),
          updateRecordFn: (collection, id, _token, data) => updateRecord(collection, id, data),
        })
        : null;
      const finalStatus = ingestion?.status || status;
      const finalRun = finalStatus !== status
        ? await updateRecord('local_helper_runs', updatedRun.id, {
          status: finalStatus,
          current_url: payload.currentUrl || '',
          last_observation: payload.observation || '',
          error_message: payload.error || '',
        })
        : updatedRun;
      return {
        status: finalStatus,
        step,
        run: finalRun,
        ingestion,
        nextAction: payload.requestHuman || finalStatus === 'request_human'
          ? { type: 'request_human', reason: payload.humanReason || ingestion?.resultSummary || '需要员工人工接管' }
          : { type: 'wait_cloud_agent' },
      };
    },

    async cancelTask(rawToken, taskId) {
      const device = await authenticate(rawToken);
      await ensureLocalHelperTaskForDevice(taskId, device);
      const task = await updateRecord('agent_tasks', taskId, { status: 'cancelled' });
      return { task: normalizeTask(task) };
    },
  };
};
