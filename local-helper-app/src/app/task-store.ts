import { randomUUID } from 'node:crypto';

import type {
  CandidateBundle,
  LocalHelperArtifact,
} from '../browser/types.ts';
import type { ScreenedNotice, ProductTerm } from '../domain/tender-screening.ts';
import { loadProductTerms } from '../domain/tender-screening.ts';
import type { LocalLLMConfig } from '../llm/client.ts';
import {
  actionStepsForSourceName,
  entryUrlForSourceName,
  searchTermsForSourceName,
} from '../sites/registry.ts';

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
  lastCandidateBundle?: CandidateBundle | null;
  lastArtifacts?: LocalHelperArtifact[];
  lastResultSummary?: string;
  lastDiscoveredLinks?: Array<{ title: string; url: string }>;
  lastScreenedNotices?: ScreenedNotice[];
  updatedAt: string;
};

export type CloudPairing = {
  paired: boolean;
  cloudUrl: string;
  token: string;
  deviceId: string;
  ownerName: string;
  deviceName: string;
  pairedAt: string;
};

export type CreateLocalTaskInput = {
  sourceName: string;
  ownerName?: string;
  entryUrl?: string;
  searchTerms?: string;
  actionSteps?: string;
};

export type TaskStoreConfigStore = {
  readCloudPairing(): CloudPairing | null;
  writeCloudPairing(pairing: CloudPairing): void;
  clearCloudPairing(): void;
  readLLMConfig(): LocalLLMConfig | null;
  writeLLMConfig(config: LocalLLMConfig): void;
  clearLLMConfig(): void;
};

export const createTaskStore = ({
  configStore,
  helperVersion = process.env.HCZ_LOCAL_HELPER_VERSION || process.env.npm_package_version || 'dev',
  now = () => new Date(),
}: {
  configStore?: TaskStoreConfigStore;
  helperVersion?: string;
  now?: () => Date;
} = {}) => {
  let cloudPairing = configStore?.readCloudPairing() || null;
  let llmConfig = configStore?.readLLMConfig() || null;
  const tasks = new Map<string, HelperTask>();

  const timestamp = () => now().toISOString();
  const getTask = (id: string) => {
    const task = tasks.get(id);
    if (!task) throw new Error(`task not found: ${id}`);
    return task;
  };
  const save = (task: Omit<HelperTask, 'updatedAt'> & { updatedAt?: string }) => {
    const next = { ...task, updatedAt: timestamp() } as HelperTask;
    tasks.set(next.id, next);
    return next;
  };
  const publicLLMConfig = () => ({
    enabled: llmConfig?.enabled !== false && Boolean(llmConfig),
    baseUrl: llmConfig?.baseUrl || '',
    model: llmConfig?.model || '',
    hasApiKey: Boolean(llmConfig?.apiKey),
    updatedAt: llmConfig?.updatedAt || '',
  });

  return {
    health() {
      return {
        ok: true,
        service: 'hcz-local-helper-app',
        helperVersion,
        cloudPaired: Boolean(cloudPairing?.paired),
        cloudUrl: cloudPairing?.cloudUrl || '',
        cloudOwnerName: cloudPairing?.ownerName || '',
        cloudDeviceName: cloudPairing?.deviceName || '',
        llm: publicLLMConfig(),
        taskCount: tasks.size,
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
        cloudUrl: cloudUrl.replace(/\/+$/, ''),
        token,
        deviceId: device.id || '',
        ownerName: device.ownerName || device.owner_name || '',
        deviceName: device.deviceName || device.device_name || '',
        pairedAt: timestamp(),
      };
      configStore?.writeCloudPairing(cloudPairing);
      return cloudPairing;
    },

    getCloudPairing() {
      if (!cloudPairing?.paired) throw new Error('cloud is not paired');
      return cloudPairing;
    },

    getLLMConfig({ includeApiKey = false }: { includeApiKey?: boolean } = {}) {
      return includeApiKey ? llmConfig : publicLLMConfig();
    },

    setLLMConfig(input: LocalLLMConfig = {}) {
      const next: LocalLLMConfig = {
        enabled: input.enabled !== false,
        baseUrl: String(input.baseUrl || '').trim().replace(/\/+$/, ''),
        apiKey: input.apiKey === undefined ? llmConfig?.apiKey || '' : String(input.apiKey || '').trim(),
        model: String(input.model || '').trim(),
        updatedAt: timestamp(),
      };
      llmConfig = next;
      configStore?.writeLLMConfig(next);
      return publicLLMConfig();
    },

    getProductTerms(baseTerms: ProductTerm[] = loadProductTerms()) {
      return baseTerms;
    },

    createTask(input: CreateLocalTaskInput) {
      const sourceName = String(input.sourceName || '').trim() || '本地采集站点';
      return save({
        id: `local-${Date.now()}-${randomUUID().slice(0, 8)}`,
        sourceName,
        ownerName: String(input.ownerName || '').trim(),
        entryUrl: String(input.entryUrl || '').trim() || entryUrlForSourceName(sourceName),
        searchTerms: String(input.searchTerms || '').trim() || searchTermsForSourceName(sourceName),
        actionSteps: String(input.actionSteps || '').trim() || actionStepsForSourceName(sourceName),
        status: 'pending',
      });
    },

    listTasks() {
      return [...tasks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    getTask,

    startTask(id: string) {
      return save({ ...getTask(id), status: 'running' });
    },

    continueTask(id: string, update: {
      observation?: string;
      screenshotPath?: string;
      log?: string;
      status?: HelperTaskStatus;
      candidateBundle?: CandidateBundle | null;
      artifacts?: LocalHelperArtifact[];
      resultSummary?: string;
      discoveredLinks?: Array<{ title: string; url: string }>;
      screenedNotices?: ScreenedNotice[];
    } = {}) {
      const current = getTask(id);
      return save({
        ...current,
        status: update.status || 'waiting_agent',
        lastObservation: update.observation ?? current.lastObservation,
        lastScreenshotPath: update.screenshotPath ?? current.lastScreenshotPath,
        lastLog: update.log ?? current.lastLog,
        lastCandidateBundle: update.candidateBundle === undefined ? current.lastCandidateBundle : update.candidateBundle,
        lastArtifacts: update.artifacts ?? current.lastArtifacts,
        lastResultSummary: update.resultSummary ?? current.lastResultSummary,
        lastDiscoveredLinks: update.discoveredLinks ?? current.lastDiscoveredLinks,
        lastScreenedNotices: update.screenedNotices ?? current.lastScreenedNotices,
      });
    },

    failTask(id: string, { observation = '', log = '' }: { observation?: string; log?: string } = {}) {
      return save({ ...getTask(id), status: 'failed', lastObservation: observation, lastLog: log });
    },

    cancelTask(id: string) {
      return save({ ...getTask(id), status: 'cancelled' });
    },
  };
};
