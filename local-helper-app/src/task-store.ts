export type HelperTaskStatus = 'pending' | 'running' | 'waiting_agent' | 'cancelled' | 'completed' | 'failed';

export type HelperTask = {
  id: string;
  sourceName: string;
  ownerName?: string;
  entryUrl: string;
  status: HelperTaskStatus;
  searchTerms?: string;
  actionSteps?: string;
  lastObservation?: string;
  lastScreenshotPath?: string;
  lastLog?: string;
  updatedAt?: string;
};

export type HelperDevice = {
  paired: boolean;
  pairCode: string;
  userName: string;
  pairedAt: string;
};

export type CloudPairing = {
  paired: boolean;
  cloudUrl: string;
  token: string;
  deviceId: string;
  ownerName: string;
  deviceName: string;
  pairedAt: string;
  lastHeartbeatAt?: string;
  latestRelease?: LocalHelperRelease;
};

export type LocalHelperRelease = {
  latestVersion?: string;
  minSupportedVersion?: string;
  portableUrl?: string;
  installerUrl?: string;
  sha256Url?: string;
  updateAvailable?: boolean;
  updateRequired?: boolean;
  notes?: string;
};

export type CloudTask = {
  id: string;
  sourceName?: string;
  source_name?: string;
  ownerName?: string;
  owner_name?: string;
  entryUrl?: string;
  entry_url?: string;
  status?: string;
  searchTerms?: string;
  search_terms?: string;
  actionSteps?: string;
  action_steps?: string;
  lastObservation?: string;
  last_observation?: string;
  lastScreenshotPath?: string;
  last_screenshot_path?: string;
  lastLog?: string;
  last_log?: string;
  updatedAt?: string;
  updated?: string;
};

export type TaskStoreConfigStore = {
  readCloudPairing(): CloudPairing | null;
  writeCloudPairing(pairing: CloudPairing): void;
  clearCloudPairing(): void;
};

const mapCloudStatus = (status = ''): HelperTaskStatus => {
  if (status === 'in_progress') return 'running';
  if (status === 'request_human') return 'waiting_agent';
  if (['completed', 'failed', 'cancelled'].includes(status)) return status as HelperTaskStatus;
  return 'pending';
};

export const createTaskStore = ({
  configStore,
}: {
  configStore?: TaskStoreConfigStore;
} = {}) => {
  let device: HelperDevice | null = null;
  let cloudPairing: CloudPairing | null = configStore?.readCloudPairing() || null;
  const tasks = new Map<string, HelperTask>();

  const touch = (task: HelperTask): HelperTask => ({
    ...task,
    updatedAt: new Date().toISOString(),
  });

  const getTask = (id: string): HelperTask => {
    const task = tasks.get(id);
    if (!task) throw new Error(`task not found: ${id}`);
    return task;
  };

  return {
    health() {
      return {
        ok: true,
        service: 'hcz-local-helper-app',
        helperVersion: process.env.npm_package_version || '0.1.0',
        paired: Boolean(device?.paired),
        userName: device?.userName || '',
        cloudPaired: Boolean(cloudPairing?.paired),
        cloudUrl: cloudPairing?.cloudUrl || '',
        cloudOwnerName: cloudPairing?.ownerName || '',
        cloudDeviceName: cloudPairing?.deviceName || '',
        lastHeartbeatAt: cloudPairing?.lastHeartbeatAt || '',
        latestRelease: cloudPairing?.latestRelease || null,
        taskCount: tasks.size,
      };
    },

    pair({ code, userName = '' }: { code: string; userName?: string }) {
      if (!code.trim()) throw new Error('pair code is required');
      device = {
        paired: true,
        pairCode: code.trim(),
        userName,
        pairedAt: new Date().toISOString(),
      };
      return {
        paired: true,
        device,
      };
    },

    setCloudPairing({
      cloudUrl,
      token,
      device = {},
    }: {
      cloudUrl: string;
      token: string;
      device?: Record<string, string>;
    }) {
      if (!cloudUrl) throw new Error('cloudUrl is required');
      if (!token) throw new Error('cloud token is required');
      cloudPairing = {
        paired: true,
        cloudUrl,
        token,
        deviceId: device.id || '',
        ownerName: device.ownerName || device.owner_name || '',
        deviceName: device.deviceName || device.device_name || '',
        pairedAt: new Date().toISOString(),
      };
      configStore?.writeCloudPairing(cloudPairing);
      return cloudPairing;
    },

    getCloudPairing() {
      if (!cloudPairing?.paired) throw new Error('cloud is not paired');
      return cloudPairing;
    },

    markCloudHeartbeat(result: { release?: LocalHelperRelease } = {}) {
      if (!cloudPairing?.paired) throw new Error('cloud is not paired');
      cloudPairing = {
        ...cloudPairing,
        lastHeartbeatAt: new Date().toISOString(),
        latestRelease: result.release || cloudPairing.latestRelease,
      };
      configStore?.writeCloudPairing(cloudPairing);
      return cloudPairing;
    },

    addTask(task: HelperTask) {
      const next = touch(task);
      tasks.set(task.id, next);
      return next;
    },

    syncCloudTasks(cloudTasks: CloudTask[] = []) {
      return cloudTasks.map((task) => {
        const existing = tasks.get(task.id);
        return this.addTask({
          id: task.id,
          sourceName: task.sourceName || task.source_name || '',
          ownerName: task.ownerName || task.owner_name || '',
          entryUrl: task.entryUrl || task.entry_url || '',
          status: mapCloudStatus(task.status),
          searchTerms: task.searchTerms || task.search_terms || '',
          actionSteps: task.actionSteps || task.action_steps || '',
          lastObservation: task.lastObservation || task.last_observation || existing?.lastObservation || '',
          lastScreenshotPath: task.lastScreenshotPath || task.last_screenshot_path || existing?.lastScreenshotPath || '',
          lastLog: task.lastLog || task.last_log || existing?.lastLog || '',
          updatedAt: task.updatedAt || task.updated || '',
        });
      });
    },

    listTasks() {
      return [...tasks.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    },

    getTask(id: string) {
      return getTask(id);
    },

    startTask(id: string) {
      const task = touch({
        ...getTask(id),
        status: 'running',
      });
      tasks.set(id, task);
      return task;
    },

    continueTask(id: string, {
      observation = '',
      screenshotPath = '',
      log = '',
      status = 'waiting_agent',
    }: {
      observation?: string;
      screenshotPath?: string;
      log?: string;
      status?: HelperTaskStatus;
    } = {}) {
      const task = touch({
        ...getTask(id),
        status,
        lastObservation: observation,
        lastScreenshotPath: screenshotPath,
        lastLog: log,
      });
      tasks.set(id, task);
      return task;
    },

    cancelTask(id: string) {
      const task = touch({
        ...getTask(id),
        status: 'cancelled',
      });
      tasks.set(id, task);
      return task;
    },

    failTask(id: string, { observation = '', log = '' }: { observation?: string; log?: string } = {}) {
      const task = touch({
        ...getTask(id),
        status: 'failed',
        lastObservation: observation,
        lastLog: log,
      });
      tasks.set(id, task);
      return task;
    },
  };
};
