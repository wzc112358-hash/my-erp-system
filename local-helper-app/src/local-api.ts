import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  cancelCloudTask,
  continueCloudTask,
  getReleaseInfo,
  pairWithCloud,
  pullCloudTasks,
  sendHeartbeat,
  startCloudTask,
  uploadCloudTaskReport,
} from './cloud-client.ts';
import { buildCollectionReport } from './collection-report.ts';
import {
  createAgentHarnessStore,
  type AgentHarnessStepInput,
  type AgentHarnessStore,
  type AgentRunStatus,
} from './agent-harness.ts';
import { DEFAULT_AGENT_TOOL_MANIFESTS } from './agent-toolbox.ts';
import { runControlledLocalAgentTask, type ControlledAgentOptions } from './controlled-local-agent.ts';
import { createDefaultBidAssessor } from './bid-assessment.ts';
import {
  buildLocalAgentLog,
  continueLocalAgentTaskAfterHuman,
  openLocalAgentTask,
  type LocalAgentRunResult,
} from './local-agent-runner.ts';
import {
  createDefaultLLMAgent,
  testOpenAICompatibleLLMConfig,
  type LLMConnectionTestResult,
  type LocalLLMConfig,
} from './local-llm-agent.ts';
import {
  formatDocumentEvidence,
  readDocumentsFromObservation,
  type DocumentReadResult,
} from './document-reader.ts';
import {
  buildOpportunityCards,
  summarizeOpportunityCards,
  type OpportunityCard,
  type OpportunityDocumentSummary,
  type OpportunityFeedbackStatus,
} from './product-knowledge.ts';
import {
  buildDailyWechatDigest,
  buildOpportunityWechatSummary,
  buildTaskWechatReport,
} from './wechat-summary.ts';
import {
  buildDailyPriorityBoard,
  buildDailyPriorityReport,
} from './priority-board.ts';
import type { DueSchedule, LocalSchedule, LocalScheduleRunStatus } from './local-scheduler.ts';
import { createPlaywrightRuntime } from './playwright-runtime.ts';
import {
  continueLocalHelperTaskAfterHuman,
  runLocalHelperTask,
  type CloudTaskChannel,
} from './task-runner.ts';
import { describeMcpToolPlans } from './mcp-tool-plans.ts';
import { createDefaultReActPlanner } from './react-planner.ts';
import {
  analyzeObservation,
  buildObservationArtifacts,
  type BrowserHarnessRuntime,
  type CandidateBundle,
  type LocalHelperArtifact,
  type LocalHelperTask,
} from './site-harness.ts';
import { PILOT_SITE_NAMES, profileFor, SITE_PROFILES } from './site-profiles.ts';
import type { createTaskStore } from './task-store.ts';

type Store = ReturnType<typeof createTaskStore>;
type TaskRunner = (input: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
  cloud: CloudTaskChannel;
}) => Promise<any>;
type LocalAgentRunner = (input: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
} & Partial<ControlledAgentOptions>) => Promise<LocalAgentRunResult>;
type LLMConnectionTester = (input: { config: LocalLLMConfig | null }) => Promise<LLMConnectionTestResult>;
type BrowserRuntimeFactory = (task: { sourceName?: string }) => BrowserHarnessRuntime;
type CloudReportUploader = typeof uploadCloudTaskReport;

const DEFAULT_HELPER_VERSION = process.env.HCZ_LOCAL_HELPER_VERSION || process.env.npm_package_version || '0.1.14';
const DEFAULT_DATA_DIR_NAME = 'HengHuaChengLocalHelper';
const VALID_FEEDBACK_STATUSES = new Set<OpportunityFeedbackStatus>([
  'valuable',
  'irrelevant',
  'ask_boss',
  'sent_to_group',
  'followed_up',
]);

const UI_FILES: Record<string, string> = {
  '/ui/pair': 'pair.html',
  '/ui/pair.html': 'pair.html',
  '/ui/pair.js': 'pair.js',
  '/ui/tasks': 'tasks.html',
  '/ui/tasks.html': 'tasks.html',
  '/ui/tasks.js': 'tasks.js',
  '/ui/tasks-minimal.js': 'tasks-minimal.js',
};

const UI_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const readBody = async (request: http.IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
};

const sendJson = (response: http.ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(body));
};

const sanitizePathSegment = (value = '') => (
  String(value || 'default')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') || 'default'
);

export const resolveDataRoot = (
  env: Record<string, string | undefined> = process.env,
) => path.join(
  env.LOCALAPPDATA || env.APPDATA || os.tmpdir(),
  DEFAULT_DATA_DIR_NAME,
);

export const resolveAgentHarnessDir = (
  env: Record<string, string | undefined> = process.env,
) => String(env.HCZ_LOCAL_HELPER_AGENT_RUN_DIR || path.join(resolveDataRoot(env), 'agent-runs'));

export const resolveRuntimeDirs = (
  task: { sourceName?: string } = {},
  env: Record<string, string | undefined> = process.env,
) => {
  const dataRoot = resolveDataRoot(env);
  return {
    profileDir: String(env.HCZ_LOCAL_HELPER_PROFILE_DIR || path.join(dataRoot, 'profiles', sanitizePathSegment(task.sourceName))),
    screenshotDir: String(env.HCZ_LOCAL_HELPER_ARTIFACT_DIR || path.join(dataRoot, 'artifacts')),
  };
};

export const createLocalApiServer = ({
  store,
  port = 17321,
  host = '127.0.0.1',
  runTask = runLocalHelperTask,
  continueTaskAfterHuman = continueLocalHelperTaskAfterHuman,
  runLocalTask = openLocalAgentTask,
  continueLocalTaskAfterHuman = continueLocalAgentTaskAfterHuman,
  runAgentTask = runControlledLocalAgentTask,
  helperVersion = DEFAULT_HELPER_VERSION,
  rendererDir = '',
  testLLMConnection = ({ config }) => testOpenAICompatibleLLMConfig({ config }),
  createBrowserRuntime,
  agentHarness = createAgentHarnessStore({ rootDir: resolveAgentHarnessDir() }),
  enableScheduler = process.env.HCZ_LOCAL_SCHEDULER_DISABLED !== '1',
  scheduleIntervalMs = Number(process.env.HCZ_LOCAL_SCHEDULER_INTERVAL_MS || 60_000),
  scheduleWindowMinutes = Number(process.env.HCZ_LOCAL_SCHEDULER_WINDOW_MINUTES || 10),
  uploadReport = uploadCloudTaskReport,
}: {
  store: Store;
  port?: number;
  host?: string;
  runTask?: TaskRunner;
  continueTaskAfterHuman?: TaskRunner;
  runLocalTask?: LocalAgentRunner;
  continueLocalTaskAfterHuman?: LocalAgentRunner;
  runAgentTask?: LocalAgentRunner;
  helperVersion?: string;
  rendererDir?: string;
  testLLMConnection?: LLMConnectionTester;
  createBrowserRuntime?: BrowserRuntimeFactory;
  agentHarness?: AgentHarnessStore;
  enableScheduler?: boolean;
  scheduleIntervalMs?: number;
  scheduleWindowMinutes?: number;
  uploadReport?: CloudReportUploader;
}) => {
  const browserRuntimes = new Map<string, BrowserHarnessRuntime>();
  const taskBrowserKeys = new Map<string, string>();
  const runningSchedules = new Set<string>();
  let scheduleTimer: NodeJS.Timeout | null = null;

  const createBrowser = (task: { sourceName?: string }): BrowserHarnessRuntime => {
    if (createBrowserRuntime) return createBrowserRuntime(task);
    const runtimeDirs = resolveRuntimeDirs(task);
    return createPlaywrightRuntime({
      ...runtimeDirs,
      headless: process.env.HCZ_LOCAL_HELPER_HEADLESS === '1',
    });
  };

  const browserKeyForTask = (task: { sourceName?: string }) =>
    resolveRuntimeDirs(task).profileDir;

  const getBrowser = (task: { id?: string; sourceName?: string }): BrowserHarnessRuntime => {
    const key = browserKeyForTask(task);
    if (task.id) taskBrowserKeys.set(task.id, key);
    const existing = browserRuntimes.get(key);
    if (existing) return existing;
    const browser = createBrowser(task);
    browserRuntimes.set(key, browser);
    return browser;
  };

  const closeBrowser = async (taskOrId: { id?: string; sourceName?: string } | string) => {
    const key = typeof taskOrId === 'string'
      ? taskBrowserKeys.get(taskOrId) || taskOrId
      : browserKeyForTask(taskOrId);
    const browser = browserRuntimes.get(key);
    browserRuntimes.delete(key);
    if (typeof taskOrId === 'string') taskBrowserKeys.delete(taskOrId);
    if (typeof taskOrId !== 'string' && taskOrId.id) taskBrowserKeys.delete(taskOrId.id);
    await browser?.close?.().catch(() => undefined);
  };

  const cloudChannel = (pairing: { cloudUrl: string; token: string }): CloudTaskChannel => ({
    start: (taskId, payload = {}) => startCloudTask({
      cloudUrl: pairing.cloudUrl,
      token: pairing.token,
    }, taskId, payload),
    continue: (taskId, payload) => continueCloudTask({
      cloudUrl: pairing.cloudUrl,
      token: pairing.token,
    }, taskId, payload),
  });

  const applyTaskRunResult = (taskId: string, result: any, defaultLog = '') => {
    if (!store.listTasks().some((task) => task.id === taskId)) return;
    const task = store.getTask(taskId);
    const observation = String(result?.observation?.visibleText || result?.observation || '');
    const screenshotPath = String(result?.observation?.screenshotPath || result?.screenshotPath || '');
    const status = result?.status === 'completed'
      ? 'completed'
      : result?.status === 'failed'
        ? 'failed'
        : 'waiting_agent';
    const log = result?.resultSummary || result?.artifacts
      ? buildLocalAgentLog(result, defaultLog)
      : [
        defaultLog,
        result?.humanReason ? `需要人工处理：${result.humanReason}` : '',
        result?.observation?.url ? `当前地址：${result.observation.url}` : '',
      ].filter(Boolean).join('\n');
    const rawOpportunityCards = Array.isArray(result?.opportunityCards)
      ? result.opportunityCards
      : buildOpportunityCards({ bundle: result?.candidateBundle, task, terms: store.getProductTerms() });
    const opportunityCards = store.applyLearningToOpportunityCards(rawOpportunityCards);
    const learningApplied = opportunityCards.some((card: OpportunityCard, index: number) => (
      card.feedbackSource === 'system' && rawOpportunityCards[index]?.feedbackSource !== 'system'
    ));
    store.continueTask(taskId, {
      observation,
      screenshotPath,
      log,
      status,
      candidateBundle: result?.candidateBundle,
      artifacts: result?.artifacts,
      resultSummary: learningApplied
        ? summarizeOpportunityCards(opportunityCards, String(result?.resultSummary || ''))
        : String(result?.resultSummary || ''),
      discoveredLinks: result?.discoveredLinks,
      opportunityCards,
    });
  };

  const llmConfigFromBody = (body: Record<string, unknown>, existing: LocalLLMConfig | null): LocalLLMConfig => ({
    enabled: body.enabled === undefined ? existing?.enabled !== false : body.enabled !== false,
    baseUrl: String(body.baseUrl ?? existing?.baseUrl ?? ''),
    apiKey: Object.prototype.hasOwnProperty.call(body, 'apiKey')
      ? String(body.apiKey || '')
      : existing?.apiKey || '',
    model: String(body.model ?? existing?.model ?? ''),
  });

  const documentSummariesFor = (documents: DocumentReadResult[]): OpportunityDocumentSummary[] => documents.map((document) => ({
    title: document.title,
    url: document.url,
    filePath: document.filePath,
    warning: document.warning,
    textSnippet: document.text ? document.text.slice(0, 1200) : '',
  }));

  const documentArtifactsFor = (
    documents: DocumentReadResult[],
    task: LocalHelperTask,
  ): LocalHelperArtifact[] => documents.map((document, index) => ({
    artifact_type: 'manual_text',
    title: `${task.sourceName || '本地助手'} 附件解析 ${index + 1}：${document.title}`,
    url: document.url,
    content: [
      document.filePath ? `本地文件：${document.filePath}` : '',
      document.warning ? `提示：${document.warning}` : '',
      document.text || '',
    ].filter(Boolean).join('\n'),
    mime_type: 'text/plain',
  }));

  const replaceCandidateAt = (
    bundle: CandidateBundle | null | undefined,
    index: number,
    candidate: CandidateBundle['candidates'][number],
  ): CandidateBundle | null => {
    if (!bundle) return null;
    const candidates = [...(bundle.candidates || [])];
    candidates[index] = candidate;
    return {
      ...bundle,
      candidates,
    };
  };

  const replaceCardAt = (
    cards: OpportunityCard[] = [],
    index: number,
    card: OpportunityCard,
  ) => {
    const next = [...cards];
    next[index] = card;
    return next;
  };

  const deepReadOpportunity = async (taskId: string, cardIndexRaw = '') => {
    const task = store.getTask(taskId);
    const cardIndex = Number(cardIndexRaw);
    if (!Number.isInteger(cardIndex) || cardIndex < 0) throw new Error('invalid opportunity index');
    const currentCards = task.lastOpportunityCards || [];
    const currentCard = currentCards[cardIndex];
    const candidate = task.lastCandidateBundle?.candidates?.[cardIndex];
    if (!currentCard || !candidate) throw new Error('opportunity card not found');
    const targetUrl = currentCard.url || candidate.url || task.entryUrl;
    if (!targetUrl) throw new Error('opportunity card has no detail url');

    const browser = getBrowser(task);
    const opened = await browser.open(targetUrl);
    const screenshotPath = await browser.screenshot?.().catch(() => '') || opened.screenshotPath || '';
    const observation = {
      ...opened,
      screenshotPath,
    };
    const profile = profileFor(task.sourceName);
    const analysis = analyzeObservation(observation, profile);
    const observationArtifacts = buildObservationArtifacts(observation, task);
    if (analysis.status === 'request_human') {
      const updated = store.continueTask(taskId, {
        status: 'waiting_agent',
        observation: observation.visibleText,
        screenshotPath,
        log: `查清楚需要人工处理：${analysis.reason}`,
        artifacts: [...(task.lastArtifacts || []), ...observationArtifacts].slice(-60),
      });
      return {
        status: 'request_human',
        humanReason: analysis.reason,
        observation,
        task: updated,
      };
    }

    const documents = await readDocumentsFromObservation({ observation });
    const documentEvidence = formatDocumentEvidence(documents);
    const attachmentUrls = [
      ...(candidate.attachments || []),
      ...documents.map((document) => document.url || document.filePath || '').filter(Boolean),
    ].filter((item, index, all) => all.indexOf(item) === index);
    const enrichedCandidate = {
      ...candidate,
      url: observation.url || candidate.url,
      raw_text: [
        candidate.raw_text,
        observation.visibleText,
        documentEvidence,
      ].filter(Boolean).join('\n\n'),
      attachments: attachmentUrls,
    };
    const refreshedCard = buildOpportunityCards({
      bundle: {
        source_name: task.lastCandidateBundle?.source_name || task.sourceName,
        candidates: [enrichedCandidate],
      },
      task,
      terms: store.getProductTerms(),
    })[0] || currentCard;
    const baseCard = {
      ...currentCard,
      ...refreshedCard,
      id: currentCard.id,
      deepReadAt: new Date().toISOString(),
      detailUrl: observation.url || targetUrl,
      detailScreenshotPath: screenshotPath,
      documentSummaries: documentSummariesFor(documents),
    };
    const llmConfig = store.getLLMConfig({ includeApiKey: true });
    const assessor = createDefaultBidAssessor({ config: llmConfig });
    const assessedCard = await assessor.assess({
      task,
      candidate: enrichedCandidate,
      baseCard,
    }).catch(() => baseCard);
    const finalCard = {
      ...assessedCard,
      deepReadAt: baseCard.deepReadAt,
      detailUrl: baseCard.detailUrl,
      detailScreenshotPath: baseCard.detailScreenshotPath,
      documentSummaries: baseCard.documentSummaries,
    };
    const nextBundle = replaceCandidateAt(task.lastCandidateBundle, cardIndex, enrichedCandidate);
    const nextCards = replaceCardAt(currentCards, cardIndex, finalCard);
    const nextArtifacts = [
      ...(task.lastArtifacts || []),
      ...observationArtifacts,
      ...documentArtifactsFor(documents, task),
    ].slice(-80);
    const resultSummary = [
      `已查清楚：${finalCard.title}`,
      finalCard.wechatSummary,
    ].filter(Boolean).join('\n\n');
    const updated = store.continueTask(taskId, {
      status: 'completed',
      observation: observation.visibleText,
      screenshotPath,
      log: resultSummary,
      candidateBundle: nextBundle,
      artifacts: nextArtifacts,
      resultSummary,
      opportunityCards: nextCards,
    });
    await closeBrowser(task);
    return {
      status: 'completed',
      task: updated,
      card: finalCard,
      documents: documentSummariesFor(documents),
      artifacts: [...observationArtifacts, ...documentArtifactsFor(documents, task)],
      resultSummary,
    };
  };

  const scheduleTaskInput = (schedule: LocalSchedule) => ({
    sourceName: schedule.sourceName,
    ownerName: '本地自动巡检',
    entryUrl: schedule.entryUrl,
    searchTerms: schedule.searchTerms,
    actionSteps: schedule.actionSteps,
  });

  const scheduleStatusFor = (result: LocalAgentRunResult | null): LocalScheduleRunStatus => {
    if (!result) return 'created';
    if (result.status === 'request_human') return 'request_human';
    if (result.status === 'completed') return 'completed';
    if (result.status === 'failed') return 'failed';
    return 'created';
  };

  const agentRunStatusFor = (result: LocalAgentRunResult | null): AgentRunStatus => {
    if (!result) return 'failed';
    if (result.status === 'request_human') return 'request_human';
    if (result.status === 'completed') return 'completed';
    if (result.status === 'failed') return 'failed';
    return 'running';
  };

  const runAgentTaskWithHarness = async ({
    task,
    llmConfig,
    assessor,
    trigger,
  }: {
    task: LocalHelperTask;
    llmConfig: LocalLLMConfig | null;
    assessor: ControlledAgentOptions['assessor'];
    trigger: string;
  }): Promise<LocalAgentRunResult & { agentRunId: string }> => {
    const run = await agentHarness.startRun({
      taskId: task.id,
      sourceName: task.sourceName,
      entryUrl: task.entryUrl,
      searchTerms: task.searchTerms,
      trigger,
    });
    const recordStep = async (step: AgentHarnessStepInput) => {
      await agentHarness.appendStep(run.id, step);
    };
    await recordStep({
      phase: 'plan',
      action: 'agent_run_requested',
      result: {
        trigger,
        taskId: task.id,
        sourceName: task.sourceName,
        entryUrl: task.entryUrl,
        searchTerms: task.searchTerms || '',
      },
    });

    try {
      const result = await runAgentTask({
        task,
        browser: getBrowser(task),
        llm: createDefaultLLMAgent({ config: llmConfig }),
        assessor,
        terms: store.getProductTerms(),
        planner: createDefaultReActPlanner({ config: llmConfig }),
        recordStep,
      });
      await recordStep({
        phase: 'complete',
        action: 'agent_run_finished',
        result: {
          status: result.status,
          discoveredLinkCount: result.discoveredLinks?.length || 0,
          candidateCount: result.candidateBundle?.candidates?.length || 0,
          opportunityCardCount: result.opportunityCards?.length || 0,
          artifactCount: result.artifacts?.length || 0,
        },
      });
      await agentHarness.finishRun(run.id, {
        status: agentRunStatusFor(result),
        resultSummary: String(result.resultSummary || result.humanReason || ''),
      });
      return {
        ...result,
        agentRunId: run.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await recordStep({
        phase: 'error',
        action: 'agent_run_failed',
        errorMessage,
      }).catch(() => undefined);
      await agentHarness.finishRun(run.id, {
        status: 'failed',
        errorMessage,
      }).catch(() => undefined);
      throw error;
    }
  };

  const runSchedule = async ({
    schedule,
    runKey,
    manual = false,
  }: {
    schedule: LocalSchedule;
    runKey: string;
    manual?: boolean;
  }) => {
    if (runningSchedules.has(schedule.id)) {
      return {
        schedule,
        skipped: true,
        reason: 'schedule already running',
      };
    }
    runningSchedules.add(schedule.id);
    const created = store.createTask(scheduleTaskInput(schedule));
    let result: LocalAgentRunResult | null = null;
    let status: LocalScheduleRunStatus = 'created';
    try {
      if (schedule.runMode === 'create_task_only') {
        status = 'created';
      } else {
        const task = store.startTask(created.id);
        if (schedule.runMode === 'open_browser') {
          result = await runLocalTask({
            task,
            browser: getBrowser(task),
          });
          applyTaskRunResult(task.id, result, manual ? '已按计划打开采集浏览器。' : '每日计划已打开采集浏览器。');
        } else {
          const llmConfig = store.getLLMConfig({ includeApiKey: true });
          result = await runAgentTaskWithHarness({
            task,
            llmConfig,
            assessor: createDefaultBidAssessor({ config: llmConfig }),
            trigger: manual ? 'manual_schedule_agent_run' : 'scheduled_agent_run',
          });
          applyTaskRunResult(task.id, result, manual ? '已手动运行每日 Agent 计划。' : '每日 Agent 计划已启动。');
        }
        status = scheduleStatusFor(result);
        if (result?.status === 'completed' || result?.status === 'failed') await closeBrowser(task);
      }
      const updatedSchedule = store.markScheduleRun(schedule.id, {
        runKey,
        taskId: created.id,
        status,
      });
      return {
        schedule: updatedSchedule,
        task: store.getTask(created.id),
        result,
        skipped: false,
      };
    } catch (error) {
      await closeBrowser(created);
      store.failTask(created.id, {
        observation: '本地自动巡检运行失败。',
        log: error instanceof Error ? error.message : String(error),
      });
      const updatedSchedule = store.markScheduleRun(schedule.id, {
        runKey,
        taskId: created.id,
        status: 'failed',
      });
      return {
        schedule: updatedSchedule,
        task: store.getTask(created.id),
        error: error instanceof Error ? error.message : String(error),
        skipped: false,
      };
    } finally {
      runningSchedules.delete(schedule.id);
    }
  };

  const runDueSchedules = async ({
    now = new Date(),
    windowMinutes = scheduleWindowMinutes,
  }: {
    now?: Date;
    windowMinutes?: number;
  } = {}) => {
    const due = store.dueSchedules({ now, windowMinutes });
    const runs = [];
    for (const item of due) {
      runs.push(await runSchedule({
        schedule: item.schedule,
        runKey: item.runKey,
      }));
    }
    return {
      checkedAt: now.toISOString(),
      dueCount: due.length,
      runs,
    };
  };

  const runScheduleById = async (id: string) => {
    const schedule = store.listSchedules().find((item) => item.id === id);
    if (!schedule) throw new Error(`schedule not found: ${id}`);
    return runSchedule({
      schedule,
      runKey: `manual ${new Date().toISOString()}`,
      manual: true,
    });
  };

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {});
        return;
      }

      const url = new URL(request.url || '/', `http://${host}`);
      const parts = url.pathname.split('/').filter(Boolean);

      if (request.method === 'GET' && url.pathname === '/ui') {
        response.writeHead(302, { Location: '/ui/tasks' });
        response.end();
        return;
      }

      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204, { 'Cache-Control': 'public, max-age=86400' });
        response.end();
        return;
      }

      if (request.method === 'GET' && rendererDir && UI_FILES[url.pathname]) {
        const fileName = UI_FILES[url.pathname];
        const filePath = path.join(rendererDir, fileName);
        const content = await fs.readFile(filePath);
        response.writeHead(200, {
          'Content-Type': UI_MIME[path.extname(fileName)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        response.end(content);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, store.health());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/site-profiles') {
        sendJson(response, 200, {
          profiles: Object.values(SITE_PROFILES).map((profile) => ({
            sourceName: profile.sourceName,
            entryUrl: profile.entryUrl || '',
            buyerName: profile.buyerName || '',
            defaultSearchTerms: profile.defaultSearchTerms || '',
            defaultActionSteps: profile.defaultActionSteps || '',
            pilot: PILOT_SITE_NAMES.includes(profile.sourceName as typeof PILOT_SITE_NAMES[number]),
          })),
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/agent-tools') {
        sendJson(response, 200, {
          tools: DEFAULT_AGENT_TOOL_MANIFESTS,
          mcpServers: describeMcpToolPlans(),
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/schedules') {
        sendJson(response, 200, { schedules: store.listSchedules() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/schedules') {
        const body = await readBody(request);
        sendJson(response, 200, { schedule: store.upsertSchedule({
          id: String(body.id || ''),
          sourceName: String(body.sourceName || ''),
          searchTerms: String(body.searchTerms || ''),
          entryUrl: String(body.entryUrl || ''),
          actionSteps: String(body.actionSteps || ''),
          times: String(body.times || ''),
          enabled: body.enabled !== false,
          runMode: body.runMode as LocalSchedule['runMode'],
        }) });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/schedules/run-due') {
        const body = await readBody(request);
        sendJson(response, 200, await runDueSchedules({
          now: body.now ? new Date(String(body.now)) : new Date(),
          windowMinutes: body.windowMinutes === undefined ? scheduleWindowMinutes : Number(body.windowMinutes),
        }));
        return;
      }

      if (request.method === 'POST' && parts[0] === 'schedules' && parts[2] === 'run-now') {
        sendJson(response, 200, await runScheduleById(parts[1]));
        return;
      }

      if (request.method === 'POST' && parts[0] === 'schedules' && parts[2] === 'delete') {
        sendJson(response, 200, store.deleteSchedule(parts[1]));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/settings/llm') {
        sendJson(response, 200, store.getLLMConfig());
        return;
      }

      if (request.method === 'POST' && url.pathname === '/settings/llm') {
        const body = await readBody(request);
        const config = llmConfigFromBody(body, store.getLLMConfig({ includeApiKey: true }));
        sendJson(response, 200, store.setLLMConfig(config));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/settings/llm/test') {
        const body = await readBody(request);
        const config = llmConfigFromBody(body, store.getLLMConfig({ includeApiKey: true }));
        sendJson(response, 200, await testLLMConnection({ config }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/settings/feedback-learning') {
        sendJson(response, 200, store.getFeedbackLearningSummary());
        return;
      }

      if (request.method === 'POST' && url.pathname === '/settings/feedback-learning/clear') {
        sendJson(response, 200, store.clearFeedbackLearning());
        return;
      }

      if (request.method === 'POST' && url.pathname === '/pair') {
        const body = await readBody(request);
        sendJson(response, 200, store.pair({
          code: String(body.code || ''),
          userName: String(body.userName || ''),
        }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/cloud/pair') {
        const body = await readBody(request);
        const cloudUrl = String(body.cloudUrl || process.env.HCZ_AGENT_CLOUD_URL || '');
        const paired = await pairWithCloud({ cloudUrl }, {
          code: String(body.code || ''),
          deviceName: String(body.deviceName || ''),
          deviceFingerprint: String(body.deviceFingerprint || ''),
          helperVersion: String(body.helperVersion || helperVersion),
          platform: String(body.platform || process.platform),
        });
        store.setCloudPairing({
          cloudUrl,
          token: String(paired.token || ''),
          device: paired.device || {},
        });
        sendJson(response, 200, paired);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/cloud/heartbeat') {
        const pairing = store.getCloudPairing();
        const body = await readBody(request);
        const result = await sendHeartbeat({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        }, {
          helperVersion: String(body.helperVersion || helperVersion),
          platform: String(body.platform || process.platform),
        });
        store.markCloudHeartbeat(result);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/cloud/release') {
        const pairing = store.getCloudPairing();
        const result = await getReleaseInfo({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        }, url.searchParams.get('currentVersion') || helperVersion);
        store.markCloudHeartbeat({ release: result });
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/cloud/tasks') {
        const pairing = store.getCloudPairing();
        const result = await pullCloudTasks({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        });
        const tasks = store.syncCloudTasks(result.tasks || []);
        sendJson(response, 200, { tasks });
        return;
      }

      if (request.method === 'POST' && parts[0] === 'cloud' && parts[1] === 'tasks' && parts[3] === 'start') {
        const pairing = store.getCloudPairing();
        const body = await readBody(request);
        const result = await startCloudTask({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        }, parts[2], body);
        if (result.task) store.startTask(parts[2]);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'cloud' && parts[1] === 'tasks' && parts[3] === 'continue') {
        const pairing = store.getCloudPairing();
        const body = await readBody(request);
        const result = await continueCloudTask({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        }, parts[2], body);
        if (store.listTasks().some((task) => task.id === parts[2])) {
          store.continueTask(parts[2], {
            observation: String(body.observation || ''),
            screenshotPath: String(body.screenshotPath || ''),
            log: String(body.log || ''),
            status: body.status === 'failed' ? 'failed' : 'waiting_agent',
          });
        }
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'cloud' && parts[1] === 'tasks' && parts[3] === 'run') {
        const pairing = store.getCloudPairing();
        const task = store.getTask(parts[2]);
        let result;
        try {
          result = await runTask({
            task,
            browser: getBrowser(task),
            cloud: cloudChannel(pairing),
          });
        } catch (error) {
          await closeBrowser(task);
          throw error;
        }
        applyTaskRunResult(parts[2], result, '已打开采集浏览器。');
        if (result?.status === 'completed' || result?.status === 'failed') await closeBrowser(task);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'cloud' && parts[1] === 'tasks' && parts[3] === 'continue-run') {
        const pairing = store.getCloudPairing();
        const task = store.getTask(parts[2]);
        let result;
        try {
          result = await continueTaskAfterHuman({
            task,
            browser: getBrowser(task),
            cloud: cloudChannel(pairing),
          });
        } catch (error) {
          await closeBrowser(task);
          throw error;
        }
        applyTaskRunResult(parts[2], result, '已尝试继续采集。');
        if (result?.status === 'completed' || result?.status === 'failed') await closeBrowser(task);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'cloud' && parts[1] === 'tasks' && parts[3] === 'cancel') {
        const pairing = store.getCloudPairing();
        const body = await readBody(request);
        const task = store.listTasks().find((item) => item.id === parts[2]);
        const result = await cancelCloudTask({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        }, parts[2], body);
        if (store.listTasks().some((task) => task.id === parts[2])) store.cancelTask(parts[2]);
        await closeBrowser(task || parts[2]);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/tasks') {
        sendJson(response, 200, {
          tasks: store.listTasks().map((task) => ({
            ...task,
            collectionReport: buildCollectionReport(task),
          })),
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/agent-runs') {
        const requestedLimit = Number(url.searchParams.get('limit') || 50);
        sendJson(response, 200, {
          runs: await agentHarness.listRuns({
            limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 50,
          }),
        });
        return;
      }

      if (request.method === 'GET' && parts[0] === 'agent-runs' && parts[1]) {
        sendJson(response, 200, await agentHarness.getRun(parts[1]));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/wechat/daily-report') {
        sendJson(response, 200, {
          text: buildDailyWechatDigest(store.listTasks()),
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/opportunities/priority-board') {
        sendJson(response, 200, buildDailyPriorityBoard(store.listTasks(), {
          limit: Number(url.searchParams.get('limit') || 20),
          includeLow: url.searchParams.get('includeLow') === '1',
        }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/wechat/priority-report') {
        sendJson(response, 200, {
          text: buildDailyPriorityReport(store.listTasks(), {
            limit: Number(url.searchParams.get('limit') || 20),
          }),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/tasks') {
        const body = await readBody(request);
        const task = store.createTask({
          sourceName: String(body.sourceName || ''),
          ownerName: String(body.ownerName || ''),
          entryUrl: String(body.entryUrl || ''),
          searchTerms: String(body.searchTerms || ''),
          actionSteps: String(body.actionSteps || ''),
        });
        sendJson(response, 201, { task });
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'run') {
        const task = store.startTask(parts[1]);
        let result;
        try {
          result = await runLocalTask({
            task,
            browser: getBrowser(task),
          });
        } catch (error) {
          await closeBrowser(task);
          throw error;
        }
        applyTaskRunResult(parts[1], result, '已打开本地采集浏览器。');
        if (result?.status === 'completed' || result?.status === 'failed') await closeBrowser(task);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'continue-run') {
        const task = store.getTask(parts[1]);
        const llmConfig = store.getLLMConfig({ includeApiKey: true });
        let result;
        try {
          result = await continueLocalTaskAfterHuman({
            task,
            browser: getBrowser(task),
            assessor: createDefaultBidAssessor({ config: llmConfig }),
            terms: store.getProductTerms(),
          });
        } catch (error) {
          await closeBrowser(task);
          throw error;
        }
        applyTaskRunResult(parts[1], result, '已继续本地采集。');
        if (result?.status === 'completed' || result?.status === 'failed') await closeBrowser(task);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'agent-run') {
        const task = store.startTask(parts[1]);
        const llmConfig = store.getLLMConfig({ includeApiKey: true });
        const assessor = createDefaultBidAssessor({ config: llmConfig });
        let result;
        try {
          result = await runAgentTaskWithHarness({
            task,
            llmConfig,
            assessor,
            trigger: 'manual_agent_run',
          });
        } catch (error) {
          await closeBrowser(task);
          throw error;
        }
        applyTaskRunResult(parts[1], result, 'Agent 已开始搜索公开入口并打开浏览器。');
        if (result?.status === 'completed' || result?.status === 'failed') await closeBrowser(task);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'opportunities' && parts[4] === 'deep-read') {
        sendJson(response, 200, await deepReadOpportunity(parts[1], parts[3]));
        return;
      }

      if (request.method === 'GET' && parts[0] === 'tasks' && parts[2] === 'wechat-report') {
        sendJson(response, 200, {
          text: buildTaskWechatReport(store.getTask(parts[1])),
        });
        return;
      }

      if (request.method === 'GET' && parts[0] === 'tasks' && parts[2] === 'collection-report') {
        sendJson(response, 200, buildCollectionReport(store.getTask(parts[1])));
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'upload') {
        const task = store.getTask(parts[1]);
        const report = buildCollectionReport(task);
        if (!['has_matches', 'no_matches'].includes(report.status)) {
          throw new Error('当前采集尚未完成，不能上传');
        }
        const pairing = store.getCloudPairing();
        const result = await uploadReport({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        }, task.id, report as unknown as Record<string, unknown>);
        sendJson(response, 200, { uploaded: true, report, cloud: result });
        return;
      }

      if (request.method === 'GET' && parts[0] === 'tasks' && parts[2] === 'opportunities' && parts[4] === 'wechat-summary') {
        const task = store.getTask(parts[1]);
        const cardIndex = Number(parts[3]);
        if (!Number.isInteger(cardIndex) || cardIndex < 0) throw new Error('invalid opportunity index');
        const card = task.lastOpportunityCards?.[cardIndex];
        if (!card) throw new Error('opportunity card not found');
        sendJson(response, 200, {
          text: buildOpportunityWechatSummary(card),
        });
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'opportunities' && parts[4] === 'feedback') {
        const body = await readBody(request);
        const status = String(body.status || '') as OpportunityFeedbackStatus;
        if (!VALID_FEEDBACK_STATUSES.has(status)) throw new Error('invalid feedback status');
        const cardIndex = Number(parts[3]);
        const result = store.updateOpportunityFeedback(parts[1], cardIndex, {
          status,
          note: String(body.note || ''),
          source: 'employee',
        });
        sendJson(response, 200, {
          ...result,
          reviewDraft: result.card.erpReviewDraft || null,
          learning: result.learning,
        });
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'start') {
        sendJson(response, 200, store.startTask(parts[1]));
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'continue') {
        const body = await readBody(request);
        sendJson(response, 200, store.continueTask(parts[1], {
          observation: String(body.observation || ''),
          screenshotPath: String(body.screenshotPath || ''),
          log: String(body.log || ''),
          status: body.status === 'failed' ? 'failed' : undefined,
        }));
        return;
      }

      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'cancel') {
        sendJson(response, 200, store.cancelTask(parts[1]));
        return;
      }

      sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    start: () => new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        if (enableScheduler && scheduleIntervalMs > 0 && !scheduleTimer) {
          scheduleTimer = setInterval(() => {
            void runDueSchedules().catch(() => undefined);
          }, scheduleIntervalMs);
        }
        resolve();
      };
      server.once('error', onError);
      server.listen(port, host, onListening);
    }),
    stop: () => new Promise<void>((resolve, reject) => {
      if (scheduleTimer) {
        clearInterval(scheduleTimer);
        scheduleTimer = null;
      }
      server.close(async (error) => {
        await Promise.all([...browserRuntimes.values()].map((browser) => browser.close?.().catch(() => undefined)));
        browserRuntimes.clear();
        error ? reject(error) : resolve();
      });
    }),
    url: () => {
      const address = server.address();
      if (!address || typeof address === 'string') return `http://${host}:${port}`;
      return `http://${host}:${address.port}`;
    },
  };
};
