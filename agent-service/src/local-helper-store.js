import crypto from 'node:crypto';

const API_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
const SUPERUSER_PASSWORD = process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;

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

export const createInMemoryLocalHelperStore = ({
  now = () => new Date(),
  tokenFactory = generateDeviceToken,
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
      if (device.device_fingerprint && deviceFingerprint && device.device_fingerprint !== deviceFingerprint) {
        throw new Error('device fingerprint mismatch');
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

    heartbeat(token, payload = {}) {
      const device = authenticate(token);
      const updated = {
        ...device,
        helper_version: payload.helperVersion || device.helper_version || '',
        platform: payload.platform || device.platform || '',
        last_seen_at: now().toISOString(),
      };
      devices.set(device.id, updated);
      return { ok: true, device: normalizeDevice(updated) };
    },

    listTasks(token) {
      const device = authenticate(token);
      return [...tasks.values()]
        .filter((task) => task.taskType === 'local_helper')
        .filter((task) => task.ownerName === device.owner_name)
        .filter((task) => !['completed', 'cancelled', 'failed'].includes(task.status))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },

    startTask(token, taskId) {
      const device = authenticate(token);
      const task = tasks.get(taskId);
      if (!task) throw new Error(`task not found: ${taskId}`);
      if (task.ownerName !== device.owner_name) throw new Error('task does not belong to paired owner');
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

    continueTask(token, taskId, payload = {}) {
      const device = authenticate(token);
      const task = tasks.get(taskId);
      if (!task) throw new Error(`task not found: ${taskId}`);
      if (task.ownerName !== device.owner_name) throw new Error('task does not belong to paired owner');
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
      if (run) {
        runs.set(run.id, {
          ...run,
          status,
          currentUrl: payload.currentUrl || run.currentUrl || '',
          lastObservation: payload.observation || run.lastObservation || '',
        });
      }
      return {
        status,
        step,
        run: run ? runs.get(run.id) : null,
        nextAction: payload.requestHuman
          ? { type: 'request_human', reason: payload.humanReason || '需要员工人工接管' }
          : { type: 'wait_cloud_agent' },
      };
    },

    cancelTask(token, taskId) {
      const device = authenticate(token);
      const task = tasks.get(taskId);
      if (!task) throw new Error(`task not found: ${taskId}`);
      if (task.ownerName !== device.owner_name) throw new Error('task does not belong to paired owner');
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
  now = () => new Date(),
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
    if (task.owner_name !== device.owner_name) throw new Error('task does not belong to paired owner');
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
      if (device.device_fingerprint && deviceFingerprint && device.device_fingerprint !== deviceFingerprint) {
        throw new Error('device fingerprint mismatch');
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
      return { ok: true, device: updated };
    },

    async listTasks(rawToken) {
      const device = await authenticate(rawToken);
      const filter = [
        'task_type = "local_helper"',
        `owner_name = "${escapeFilterValue(device.owner_name)}"`,
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
        owner_name: device.owner_name || '',
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
      return {
        status,
        step,
        run: updatedRun,
        nextAction: payload.requestHuman
          ? { type: 'request_human', reason: payload.humanReason || '需要员工人工接管' }
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
