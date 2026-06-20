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
} from './cloud-client.ts';
import {
  buildLocalAgentLog,
  continueLocalAgentTaskAfterHuman,
  openLocalAgentTask,
  type LocalAgentRunResult,
} from './local-agent-runner.ts';
import { createPlaywrightRuntime } from './playwright-runtime.ts';
import {
  continueLocalHelperTaskAfterHuman,
  runLocalHelperTask,
  type CloudTaskChannel,
} from './task-runner.ts';
import type { BrowserHarnessRuntime, LocalHelperTask } from './site-harness.ts';
import { SITE_PROFILES } from './site-profiles.ts';
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
}) => Promise<LocalAgentRunResult>;

const DEFAULT_HELPER_VERSION = process.env.HCZ_LOCAL_HELPER_VERSION || process.env.npm_package_version || '0.1.14';
const DEFAULT_DATA_DIR_NAME = 'HengHuaChengLocalHelper';

const UI_FILES: Record<string, string> = {
  '/ui/pair': 'pair.html',
  '/ui/pair.html': 'pair.html',
  '/ui/pair.js': 'pair.js',
  '/ui/tasks': 'tasks.html',
  '/ui/tasks.html': 'tasks.html',
  '/ui/tasks.js': 'tasks.js',
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

export const resolveRuntimeDirs = (
  task: { sourceName?: string } = {},
  env: Record<string, string | undefined> = process.env,
) => {
  const dataRoot = path.join(
    env.LOCALAPPDATA || env.APPDATA || os.tmpdir(),
    DEFAULT_DATA_DIR_NAME,
  );
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
  helperVersion = DEFAULT_HELPER_VERSION,
  rendererDir = '',
}: {
  store: Store;
  port?: number;
  host?: string;
  runTask?: TaskRunner;
  continueTaskAfterHuman?: TaskRunner;
  runLocalTask?: LocalAgentRunner;
  continueLocalTaskAfterHuman?: LocalAgentRunner;
  helperVersion?: string;
  rendererDir?: string;
}) => {
  const browserRuntimes = new Map<string, BrowserHarnessRuntime>();
  const taskBrowserKeys = new Map<string, string>();

  const createBrowser = (task: { sourceName?: string }): BrowserHarnessRuntime => {
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
    store.continueTask(taskId, {
      observation,
      screenshotPath,
      log,
      status,
      candidateBundle: result?.candidateBundle,
      artifacts: result?.artifacts,
      resultSummary: String(result?.resultSummary || ''),
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
          })),
        });
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
        sendJson(response, 200, { tasks: store.listTasks() });
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
        let result;
        try {
          result = await continueLocalTaskAfterHuman({
            task,
            browser: getBrowser(task),
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
        resolve();
      };
      server.once('error', onError);
      server.listen(port, host, onListening);
    }),
    stop: () => new Promise<void>((resolve, reject) => {
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
