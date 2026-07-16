import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import type { BrowserSession, LocalHelperTask } from '../browser/types.ts';
import {
  testOCRConfig,
  type LocalOCRConfig,
} from '../browser/ocr.ts';
import { createPlaywrightSession } from '../browser/playwright-session.ts';
import {
  runCollection,
  type CollectionRunResult,
} from '../collection/pipeline.ts';
import {
  createAgentHarnessStore,
  type AgentHarnessStore,
  type AgentRunStatus,
} from '../collection/run-log.ts';
import { buildCollectionReport } from '../domain/collection-report.ts';
import { createDefaultBidAssessor } from '../llm/bid-assessor.ts';
import {
  testOpenAICompatibleLLMConfig,
  type LLMConnectionTestResult,
  type LocalLLMConfig,
} from '../llm/client.ts';
import {
  definitionFor,
  PILOT_SITE_NAMES,
  SITE_DEFINITIONS,
} from '../sites/registry.ts';
import {
  pairWithCloud,
  uploadCloudTaskReport,
} from './cloud-client.ts';
import type { createTaskStore } from './task-store.ts';

type Store = ReturnType<typeof createTaskStore>;
type BrowserSessionFactory = (task: { sourceName?: string }) => BrowserSession;
type LLMConnectionTester = (input: { config: LocalLLMConfig | null }) => Promise<LLMConnectionTestResult>;
type OCRConnectionTester = (input: { config: LocalOCRConfig | null }) => Promise<{
  ok: boolean;
  provider: string;
  message: string;
}>;
type CloudReportUploader = typeof uploadCloudTaskReport;

const DEFAULT_HELPER_VERSION = process.env.HCZ_LOCAL_HELPER_VERSION || process.env.npm_package_version || 'dev';
const DEFAULT_DATA_DIR_NAME = 'HengHuaChengLocalHelper';

const UI_FILES: Record<string, string> = {
  '/ui/pair': 'pair.html',
  '/ui/pair.html': 'pair.html',
  '/ui/pair.js': 'pair.js',
  '/ui/tasks': 'tasks.html',
  '/ui/tasks.html': 'tasks.html',
  '/ui/tasks-minimal.js': 'tasks-minimal.js',
};

const UI_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const readBody = async (request: http.IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

const sanitizePathSegment = (value = '') => String(value || 'default')
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[. ]+$/g, '') || 'default';

export const resolveDataRoot = (
  env: Record<string, string | undefined> = process.env,
) => path.join(env.LOCALAPPDATA || env.APPDATA || os.tmpdir(), DEFAULT_DATA_DIR_NAME);

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

const runStatusFor = (result: CollectionRunResult): AgentRunStatus => {
  if (result.status === 'request_human') return 'request_human';
  if (result.status === 'completed') return 'completed';
  return 'failed';
};

export const createLocalApiServer = ({
  store,
  port = 17321,
  host = '127.0.0.1',
  helperVersion = DEFAULT_HELPER_VERSION,
  rendererDir = '',
  testLLMConnection = ({ config }) => testOpenAICompatibleLLMConfig({ config }),
  testOCRConnection = ({ config }) => testOCRConfig({ config }),
  createBrowserSession,
  agentHarness = createAgentHarnessStore({ rootDir: resolveAgentHarnessDir() }),
  uploadReport = uploadCloudTaskReport,
  now = () => new Date(),
}: {
  store: Store;
  port?: number;
  host?: string;
  helperVersion?: string;
  rendererDir?: string;
  testLLMConnection?: LLMConnectionTester;
  testOCRConnection?: OCRConnectionTester;
  createBrowserSession?: BrowserSessionFactory;
  agentHarness?: AgentHarnessStore;
  uploadReport?: CloudReportUploader;
  now?: () => Date;
}) => {
  const browserSessions = new Map<string, BrowserSession>();
  const taskBrowserKeys = new Map<string, string>();

  const browserKeyFor = (task: { sourceName?: string }) => resolveRuntimeDirs(task).profileDir;
  const getBrowser = (task: { id?: string; sourceName?: string }) => {
    const key = browserKeyFor(task);
    if (task.id) taskBrowserKeys.set(task.id, key);
    const existing = browserSessions.get(key);
    if (existing) return existing;
    const browser = createBrowserSession
      ? createBrowserSession(task)
      : createPlaywrightSession({
        ...resolveRuntimeDirs(task),
        headless: process.env.HCZ_LOCAL_HELPER_HEADLESS === '1',
      });
    browserSessions.set(key, browser);
    return browser;
  };
  const closeBrowser = async (taskOrId: { id?: string; sourceName?: string } | string) => {
    const key = typeof taskOrId === 'string'
      ? taskBrowserKeys.get(taskOrId) || taskOrId
      : browserKeyFor(taskOrId);
    const browser = browserSessions.get(key);
    browserSessions.delete(key);
    if (typeof taskOrId === 'string') taskBrowserKeys.delete(taskOrId);
    if (typeof taskOrId !== 'string' && taskOrId.id) taskBrowserKeys.delete(taskOrId.id);
    await browser?.close?.().catch(() => undefined);
  };
  const reportFor = (task: Parameters<typeof buildCollectionReport>[0]) => (
    buildCollectionReport(task, now().toISOString())
  );
  const llmConfigFromBody = (
    body: Record<string, unknown>,
    existing: LocalLLMConfig | null,
  ): LocalLLMConfig => ({
    enabled: body.enabled === undefined ? existing?.enabled !== false : body.enabled !== false,
    baseUrl: String(body.baseUrl ?? existing?.baseUrl ?? ''),
    apiKey: Object.prototype.hasOwnProperty.call(body, 'apiKey')
      ? String(body.apiKey || '')
      : existing?.apiKey || '',
    model: String(body.model ?? existing?.model ?? ''),
  });
  const ocrConfigFromBody = (
    body: Record<string, unknown>,
    existing: LocalOCRConfig | null,
  ): LocalOCRConfig => ({
    enabled: body.enabled === undefined ? existing?.enabled !== false : body.enabled !== false,
    provider: String(body.provider ?? existing?.provider ?? 'disabled') as LocalOCRConfig['provider'],
    baiduApiKey: Object.prototype.hasOwnProperty.call(body, 'baiduApiKey')
      ? String(body.baiduApiKey || '')
      : existing?.baiduApiKey || '',
    baiduSecretKey: Object.prototype.hasOwnProperty.call(body, 'baiduSecretKey')
      ? String(body.baiduSecretKey || '')
      : existing?.baiduSecretKey || '',
    paddleCommand: String(body.paddleCommand ?? existing?.paddleCommand ?? ''),
    paddleConfigPath: String(body.paddleConfigPath ?? existing?.paddleConfigPath ?? ''),
    paddleDevice: String(body.paddleDevice ?? existing?.paddleDevice ?? ''),
  });

  const applyResult = (taskId: string, result: CollectionRunResult) => {
    const observation = result.observation;
    const status = result.status === 'completed'
      ? 'completed'
      : result.status === 'failed'
        ? 'failed'
        : 'waiting_agent';
    return store.continueTask(taskId, {
      observation: observation?.visibleText || '',
      screenshotPath: observation?.screenshotPath || '',
      log: result.resultSummary || result.humanReason,
      status,
      candidateBundle: result.candidateBundle,
      artifacts: result.artifacts,
      resultSummary: result.resultSummary,
      discoveredLinks: result.discoveredLinks,
      screenedNotices: result.screenedNotices || [],
    });
  };

  const executeCollection = async (task: LocalHelperTask, resume: boolean) => {
    const run = await agentHarness.startRun({
      taskId: task.id,
      sourceName: task.sourceName,
      entryUrl: task.entryUrl,
      searchTerms: task.searchTerms,
      trigger: resume ? 'human_resume' : 'manual_run',
    });
    const config = store.getLLMConfig({ includeApiKey: true }) as LocalLLMConfig | null;
    const ocrConfig = store.getOCRConfig({ includeSecrets: true }) as LocalOCRConfig | null;
    try {
      const result = await runCollection({
        task,
        browser: getBrowser(task),
        llmConfig: config,
        ocrConfig,
        assessor: createDefaultBidAssessor({ config }),
        terms: store.getProductTerms(),
        resume,
        recordStep: (step) => agentHarness.appendStep(run.id, step).then(() => undefined),
      });
      applyResult(task.id, result);
      await agentHarness.finishRun(run.id, {
        status: runStatusFor(result),
        resultSummary: result.resultSummary || result.humanReason,
      });
      if (result.status !== 'request_human') await closeBrowser(task);
      return { ...result, agentRunId: run.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.failTask(task.id, { observation: '本地采集运行失败。', log: message });
      await agentHarness.finishRun(run.id, { status: 'failed', errorMessage: message }).catch(() => undefined);
      await closeBrowser(task);
      throw error;
    }
  };

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {});
        return;
      }
      const url = new URL(request.url || '/', `http://${host}:${port}`);
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
        const content = await fs.readFile(path.join(rendererDir, fileName));
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
          profiles: Object.values(SITE_DEFINITIONS).map((site) => ({
            sourceName: site.sourceName,
            owner: site.owner,
            entryUrl: site.entryUrl || '',
            defaultSearchTerms: site.defaultSearchTerms || '',
            defaultActionSteps: site.defaultActionSteps || '',
            collectionMode: site.collectionMode,
            browserEngine: site.browserEngine,
            pilot: PILOT_SITE_NAMES.includes(site.sourceName),
          })),
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/settings/llm') {
        sendJson(response, 200, store.getLLMConfig());
        return;
      }
      if (request.method === 'POST' && url.pathname === '/settings/llm') {
        const body = await readBody(request);
        const config = llmConfigFromBody(body, store.getLLMConfig({ includeApiKey: true }) as LocalLLMConfig | null);
        sendJson(response, 200, store.setLLMConfig(config));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/settings/llm/test') {
        const body = await readBody(request);
        const config = llmConfigFromBody(body, store.getLLMConfig({ includeApiKey: true }) as LocalLLMConfig | null);
        sendJson(response, 200, await testLLMConnection({ config }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/settings/ocr') {
        sendJson(response, 200, store.getOCRConfig());
        return;
      }
      if (request.method === 'POST' && url.pathname === '/settings/ocr') {
        const body = await readBody(request);
        const config = ocrConfigFromBody(body, store.getOCRConfig({ includeSecrets: true }) as LocalOCRConfig | null);
        sendJson(response, 200, store.setOCRConfig(config));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/settings/ocr/test') {
        const body = await readBody(request);
        const config = ocrConfigFromBody(body, store.getOCRConfig({ includeSecrets: true }) as LocalOCRConfig | null);
        sendJson(response, 200, await testOCRConnection({ config }));
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
      if (request.method === 'GET' && url.pathname === '/tasks') {
        sendJson(response, 200, {
          tasks: store.listTasks().map((task) => ({ ...task, collectionReport: reportFor(task) })),
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/tasks') {
        const body = await readBody(request);
        const site = definitionFor(String(body.sourceName || ''));
        const task = store.createTask({
          sourceName: site.sourceName,
          ownerName: String(body.ownerName || site.owner || ''),
          entryUrl: String(body.entryUrl || site.entryUrl || ''),
          searchTerms: String(body.searchTerms || site.defaultSearchTerms || ''),
          actionSteps: String(body.actionSteps || site.defaultActionSteps || ''),
        });
        sendJson(response, 201, { task });
        return;
      }
      if (request.method === 'DELETE' && parts[0] === 'tasks' && parts[1] && parts.length === 2) {
        const task = store.getTask(parts[1]);
        if (task.status === 'running') throw new Error('该巡检正在采集，暂时不能删除');
        await closeBrowser(task);
        store.deleteTask(task.id);
        sendJson(response, 200, { deleted: true, id: task.id });
        return;
      }
      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'agent-run') {
        const task = store.startTask(parts[1]);
        sendJson(response, 200, await executeCollection(task, false));
        return;
      }
      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'continue-run') {
        const task = store.getTask(parts[1]);
        sendJson(response, 200, await executeCollection(task, true));
        return;
      }
      if (request.method === 'GET' && parts[0] === 'tasks' && parts[2] === 'collection-report') {
        sendJson(response, 200, reportFor(store.getTask(parts[1])));
        return;
      }
      if (request.method === 'POST' && parts[0] === 'tasks' && parts[2] === 'upload') {
        const task = store.getTask(parts[1]);
        const report = reportFor(task);
        if (!['has_matches', 'no_matches'].includes(report.status)) {
          throw new Error('当前采集尚未完成，不能上传');
        }
        const pairing = store.getCloudPairing();
        const cloud = await uploadReport({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        }, task.id, report as unknown as Record<string, unknown>);
        sendJson(response, 200, { uploaded: true, report, cloud });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/agent-runs') {
        sendJson(response, 200, { runs: await agentHarness.listRuns({ limit: 50 }) });
        return;
      }
      if (request.method === 'GET' && parts[0] === 'agent-runs' && parts[1]) {
        sendJson(response, 200, await agentHarness.getRun(parts[1]));
        return;
      }

      sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    async start() {
      if (server.listening) return;
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    async stop() {
      await Promise.all([...browserSessions.values()].map((browser) => browser.close?.().catch(() => undefined)));
      browserSessions.clear();
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
    url() {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      return `http://${host}:${actualPort}`;
    },
  };
};
