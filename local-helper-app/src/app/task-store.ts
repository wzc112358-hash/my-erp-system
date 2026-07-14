import { randomUUID } from 'node:crypto';

import type { DiscoveredLink } from './agent-search-adapter.ts';
import {
  applyFeedbackLearningToOpportunityCards,
  applyFeedbackLearningToTerms,
  createEmptyFeedbackLearning,
  learnFromOpportunityFeedback,
  normalizeFeedbackLearningState,
  summarizeFeedbackLearning,
  type FeedbackLearningState,
} from './feedback-learning.ts';
import {
  dueSchedulesFor,
  normalizeSchedule,
  type DueSchedule,
  type LocalSchedule,
  type LocalScheduleInput,
  type LocalScheduleRunStatus,
} from './local-scheduler.ts';
import type { LocalLLMConfig } from './local-llm-agent.ts';
import {
  applyOpportunityFeedback,
  loadProductTerms,
  type OpportunityCard,
  type OpportunityFeedbackInput,
  type ProductTerm,
} from './product-knowledge.ts';
import type { CandidateBundle, LocalHelperArtifact } from './site-harness.ts';
import {
  actionStepsForSourceName,
  entryUrlForSourceName,
  searchTermsForSourceName,
} from './site-profiles.ts';

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
  lastDiscoveredLinks?: DiscoveredLink[];
  lastOpportunityCards?: OpportunityCard[];
  mode?: 'local' | 'cloud';
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
  readLLMConfig?(): LocalLLMConfig | null;
  writeLLMConfig?(config: LocalLLMConfig): void;
  clearLLMConfig?(): void;
  readFeedbackLearning?(): FeedbackLearningState | null;
  writeFeedbackLearning?(state: FeedbackLearningState): void;
  clearFeedbackLearning?(): void;
  readLocalSchedules?(): LocalSchedule[];
  writeLocalSchedules?(schedules: LocalSchedule[]): void;
  clearLocalSchedules?(): void;
};

const mapCloudStatus = (status = ''): HelperTaskStatus => {
  if (status === 'in_progress') return 'running';
  if (status === 'request_human') return 'waiting_agent';
  if (['completed', 'failed', 'cancelled'].includes(status)) return status as HelperTaskStatus;
  return 'pending';
};

const replaceAt = <T>(items: T[] = [], index: number, value: T) => {
  const next = [...items];
  next[index] = value;
  return next;
};

export const createTaskStore = ({
  configStore,
  helperVersion = process.env.HCZ_LOCAL_HELPER_VERSION || process.env.npm_package_version || '0.1.14',
}: {
  configStore?: TaskStoreConfigStore;
  helperVersion?: string;
} = {}) => {
  let device: HelperDevice | null = null;
  let cloudPairing: CloudPairing | null = configStore?.readCloudPairing() || null;
  let llmConfig: LocalLLMConfig | null = configStore?.readLLMConfig?.() || null;
  let feedbackLearning: FeedbackLearningState = normalizeFeedbackLearningState(
    configStore?.readFeedbackLearning?.() || createEmptyFeedbackLearning(),
  );
  const schedules = new Map<string, LocalSchedule>(
    (configStore?.readLocalSchedules?.() || [])
      .map((schedule) => normalizeSchedule(schedule))
      .map((schedule) => [schedule.id, schedule]),
  );
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

  const publicLLMConfig = () => ({
    enabled: llmConfig?.enabled !== false && Boolean(llmConfig),
    baseUrl: llmConfig?.baseUrl || '',
    model: llmConfig?.model || '',
    hasApiKey: Boolean(llmConfig?.apiKey),
    updatedAt: llmConfig?.updatedAt || '',
  });

  const persistSchedules = () => {
    configStore?.writeLocalSchedules?.([...schedules.values()]);
  };

  const scheduleWithDefaults = (input: LocalScheduleInput) => {
    const sourceName = String(input.sourceName || '').trim() || '本地采集站点';
    return normalizeSchedule({
      ...input,
      sourceName,
      entryUrl: input.entryUrl || entryUrlForSourceName(sourceName),
      searchTerms: input.searchTerms || searchTermsForSourceName(sourceName),
      actionSteps: input.actionSteps || actionStepsForSourceName(sourceName),
      updatedAt: new Date().toISOString(),
    }, input.id || '');
  };

  return {
    health() {
      return {
        ok: true,
        service: 'hcz-local-helper-app',
        helperVersion,
        paired: Boolean(device?.paired),
        userName: device?.userName || '',
        cloudPaired: Boolean(cloudPairing?.paired),
        cloudUrl: cloudPairing?.cloudUrl || '',
        cloudOwnerName: cloudPairing?.ownerName || '',
        cloudDeviceName: cloudPairing?.deviceName || '',
        lastHeartbeatAt: cloudPairing?.lastHeartbeatAt || '',
        latestRelease: cloudPairing?.latestRelease || null,
        llm: publicLLMConfig(),
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

    getLLMConfig({ includeApiKey = false }: { includeApiKey?: boolean } = {}) {
      if (includeApiKey) return llmConfig;
      return publicLLMConfig();
    },

    setLLMConfig(input: LocalLLMConfig = {}) {
      const next = {
        enabled: input.enabled !== false,
        baseUrl: String(input.baseUrl || '').trim().replace(/\/+$/, ''),
        apiKey: input.apiKey === undefined ? llmConfig?.apiKey || '' : String(input.apiKey || '').trim(),
        model: String(input.model || '').trim(),
        updatedAt: new Date().toISOString(),
      };
      llmConfig = next;
      configStore?.writeLLMConfig?.(next);
      return publicLLMConfig();
    },

    clearLLMConfig() {
      llmConfig = null;
      configStore?.clearLLMConfig?.();
      return publicLLMConfig();
    },

    getFeedbackLearning() {
      return feedbackLearning;
    },

    getFeedbackLearningSummary() {
      return summarizeFeedbackLearning(feedbackLearning);
    },

    clearFeedbackLearning() {
      feedbackLearning = createEmptyFeedbackLearning();
      configStore?.clearFeedbackLearning?.();
      return summarizeFeedbackLearning(feedbackLearning);
    },

    getProductTerms(baseTerms: ProductTerm[] = loadProductTerms()) {
      return applyFeedbackLearningToTerms(baseTerms, feedbackLearning);
    },

    applyLearningToOpportunityCards(cards: OpportunityCard[] = []) {
      return applyFeedbackLearningToOpportunityCards(cards, feedbackLearning);
    },

    listSchedules() {
      return [...schedules.values()]
        .sort((left, right) => String(left.sourceName).localeCompare(String(right.sourceName), 'zh-Hans-CN'));
    },

    upsertSchedule(input: LocalScheduleInput) {
      const schedule = scheduleWithDefaults(input);
      if (!schedule.sourceName.trim()) throw new Error('schedule sourceName is required');
      schedules.set(schedule.id, {
        ...schedules.get(schedule.id),
        ...schedule,
      });
      persistSchedules();
      return schedules.get(schedule.id) as LocalSchedule;
    },

    deleteSchedule(id: string) {
      if (!schedules.delete(id)) throw new Error(`schedule not found: ${id}`);
      persistSchedules();
      return { deleted: true };
    },

    dueSchedules({ now = new Date(), windowMinutes = 10 }: { now?: Date; windowMinutes?: number } = {}): DueSchedule[] {
      return dueSchedulesFor([...schedules.values()], { now, windowMinutes });
    },

    markScheduleRun(
      id: string,
      {
        runKey,
        taskId = '',
        status = 'created',
        ranAt = new Date().toISOString(),
      }: {
        runKey: string;
        taskId?: string;
        status?: LocalScheduleRunStatus;
        ranAt?: string;
      },
    ) {
      const schedule = schedules.get(id);
      if (!schedule) throw new Error(`schedule not found: ${id}`);
      const updated = {
        ...schedule,
        lastRunKey: runKey,
        lastRunAt: ranAt,
        lastTaskId: taskId,
        lastStatus: status,
        updatedAt: ranAt,
      };
      schedules.set(id, updated);
      persistSchedules();
      return updated;
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

    createTask(input: CreateLocalTaskInput) {
      const sourceName = String(input.sourceName || '').trim() || '本地采集站点';
      return this.addTask({
        id: `local-${Date.now()}-${randomUUID().slice(0, 8)}`,
        sourceName,
        ownerName: String(input.ownerName || '').trim(),
        entryUrl: String(input.entryUrl || '').trim() || entryUrlForSourceName(sourceName),
        searchTerms: String(input.searchTerms || '').trim() || searchTermsForSourceName(sourceName),
        actionSteps: String(input.actionSteps || '').trim() || actionStepsForSourceName(sourceName),
        status: 'pending',
        mode: 'local',
      });
    },

    syncCloudTasks(cloudTasks: CloudTask[] = []) {
      return cloudTasks.map((task) => {
        const existing = tasks.get(task.id);
        const sourceName = task.sourceName || task.source_name || '';
        return this.addTask({
          id: task.id,
          sourceName,
          ownerName: task.ownerName || task.owner_name || '',
          entryUrl: task.entryUrl || task.entry_url || existing?.entryUrl || entryUrlForSourceName(sourceName),
          status: mapCloudStatus(task.status),
          searchTerms: task.searchTerms || task.search_terms || '',
          actionSteps: task.actionSteps || task.action_steps || '',
          lastObservation: task.lastObservation || task.last_observation || existing?.lastObservation || '',
          lastScreenshotPath: task.lastScreenshotPath || task.last_screenshot_path || existing?.lastScreenshotPath || '',
          lastLog: task.lastLog || task.last_log || existing?.lastLog || '',
          lastCandidateBundle: existing?.lastCandidateBundle || null,
          lastArtifacts: existing?.lastArtifacts || [],
          lastResultSummary: existing?.lastResultSummary || '',
          lastDiscoveredLinks: existing?.lastDiscoveredLinks || [],
          lastOpportunityCards: existing?.lastOpportunityCards || [],
          mode: 'cloud',
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
      candidateBundle = undefined,
      artifacts = undefined,
      resultSummary = '',
      discoveredLinks = undefined,
      opportunityCards = undefined,
    }: {
      observation?: string;
      screenshotPath?: string;
      log?: string;
      status?: HelperTaskStatus;
      candidateBundle?: CandidateBundle | null;
      artifacts?: LocalHelperArtifact[];
      resultSummary?: string;
      discoveredLinks?: DiscoveredLink[];
      opportunityCards?: OpportunityCard[];
    } = {}) {
      const current = getTask(id);
      const task = touch({
        ...current,
        status,
        lastObservation: observation,
        lastScreenshotPath: screenshotPath,
        lastLog: log,
        lastCandidateBundle: candidateBundle === undefined ? current.lastCandidateBundle : candidateBundle,
        lastArtifacts: artifacts === undefined ? current.lastArtifacts : artifacts,
        lastResultSummary: resultSummary || current.lastResultSummary || '',
        lastDiscoveredLinks: discoveredLinks === undefined ? current.lastDiscoveredLinks : discoveredLinks,
        lastOpportunityCards: opportunityCards === undefined ? current.lastOpportunityCards : opportunityCards,
      });
      tasks.set(id, task);
      return task;
    },

    updateOpportunityFeedback(id: string, index: number, feedback: OpportunityFeedbackInput) {
      const current = getTask(id);
      if (!Number.isInteger(index) || index < 0) throw new Error('invalid opportunity index');
      const card = current.lastOpportunityCards?.[index];
      if (!card) throw new Error('opportunity card not found');
      const feedbackWithTime = {
        ...feedback,
        updatedAt: feedback.updatedAt || new Date().toISOString(),
      };
      const updatedCard = applyOpportunityFeedback(card, feedbackWithTime);
      feedbackLearning = learnFromOpportunityFeedback(feedbackLearning, updatedCard, feedbackWithTime);
      configStore?.writeFeedbackLearning?.(feedbackLearning);
      const task = touch({
        ...current,
        lastOpportunityCards: replaceAt(current.lastOpportunityCards || [], index, updatedCard),
        lastLog: [
          current.lastLog || '',
          `员工反馈：${updatedCard.title} -> ${updatedCard.feedbackStatus}${updatedCard.feedbackNote ? `（${updatedCard.feedbackNote}）` : ''}`,
        ].filter(Boolean).join('\n'),
      });
      tasks.set(id, task);
      return {
        task,
        card: updatedCard,
        learning: summarizeFeedbackLearning(feedbackLearning),
      };
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
