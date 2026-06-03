export type HelperTaskStatus = 'pending' | 'running' | 'waiting_agent' | 'cancelled' | 'completed';

export type HelperTask = {
  id: string;
  sourceName: string;
  ownerName?: string;
  entryUrl: string;
  status: HelperTaskStatus;
  searchTerms?: string;
  actionSteps?: string;
  lastObservation?: string;
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
  updatedAt?: string;
  updated?: string;
};

export type TaskStoreConfigStore = {
  readCloudPairing(): CloudPairing | null;
  writeCloudPairing(pairing: CloudPairing): void;
  clearCloudPairing(): void;
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
        paired: Boolean(device?.paired),
        userName: device?.userName || '',
        cloudPaired: Boolean(cloudPairing?.paired),
        cloudUrl: cloudPairing?.cloudUrl || '',
        cloudOwnerName: cloudPairing?.ownerName || '',
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

    markCloudHeartbeat() {
      if (!cloudPairing?.paired) throw new Error('cloud is not paired');
      cloudPairing = {
        ...cloudPairing,
        lastHeartbeatAt: new Date().toISOString(),
      };
      return cloudPairing;
    },

    addTask(task: HelperTask) {
      const next = touch(task);
      tasks.set(task.id, next);
      return next;
    },

    syncCloudTasks(cloudTasks: CloudTask[] = []) {
      return cloudTasks.map((task) => this.addTask({
        id: task.id,
        sourceName: task.sourceName || task.source_name || '',
        ownerName: task.ownerName || task.owner_name || '',
        entryUrl: task.entryUrl || task.entry_url || '',
        status: task.status === 'in_progress' ? 'running' : 'pending',
        searchTerms: task.searchTerms || task.search_terms || '',
        actionSteps: task.actionSteps || task.action_steps || '',
        updatedAt: task.updatedAt || task.updated || '',
      }));
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

    continueTask(id: string, { observation = '' }: { observation?: string } = {}) {
      const task = touch({
        ...getTask(id),
        status: 'waiting_agent',
        lastObservation: observation,
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
  };
};
