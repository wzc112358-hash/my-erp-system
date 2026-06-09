import http from 'node:http';

import {
  cancelCloudTask,
  continueCloudTask,
  pairWithCloud,
  pullCloudTasks,
  sendHeartbeat,
  startCloudTask,
} from './cloud-client.ts';
import { createPlaywrightRuntime } from './playwright-runtime.ts';
import { runLocalHelperTask } from './task-runner.ts';
import type { createTaskStore } from './task-store.ts';

type Store = ReturnType<typeof createTaskStore>;

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

export const createLocalApiServer = ({
  store,
  port = 17321,
  host = '127.0.0.1',
}: {
  store: Store;
  port?: number;
  host?: string;
}) => {
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {});
        return;
      }

      const url = new URL(request.url || '/', `http://${host}`);
      const parts = url.pathname.split('/').filter(Boolean);

      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, store.health());
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
          helperVersion: String(body.helperVersion || process.env.npm_package_version || '0.1.0'),
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
          helperVersion: String(body.helperVersion || process.env.npm_package_version || '0.1.0'),
          platform: String(body.platform || process.platform),
        });
        store.markCloudHeartbeat();
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
          store.continueTask(parts[2], { observation: String(body.observation || '') });
        }
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'cloud' && parts[1] === 'tasks' && parts[3] === 'run') {
        const pairing = store.getCloudPairing();
        const task = store.getTask(parts[2]);
        const browser = createPlaywrightRuntime({
          profileDir: String(process.env.HCZ_LOCAL_HELPER_PROFILE_DIR || `profiles/${task.sourceName || 'default'}`),
          screenshotDir: String(process.env.HCZ_LOCAL_HELPER_ARTIFACT_DIR || 'artifacts'),
          headless: process.env.HCZ_LOCAL_HELPER_HEADLESS === '1',
        });
        const result = await runLocalHelperTask({
          task,
          browser,
          cloud: {
            start: (taskId, payload = {}) => startCloudTask({
              cloudUrl: pairing.cloudUrl,
              token: pairing.token,
            }, taskId, payload),
            continue: (taskId, payload) => continueCloudTask({
              cloudUrl: pairing.cloudUrl,
              token: pairing.token,
            }, taskId, payload),
          },
        });
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && parts[0] === 'cloud' && parts[1] === 'tasks' && parts[3] === 'cancel') {
        const pairing = store.getCloudPairing();
        const body = await readBody(request);
        const result = await cancelCloudTask({
          cloudUrl: pairing.cloudUrl,
          token: pairing.token,
        }, parts[2], body);
        if (store.listTasks().some((task) => task.id === parts[2])) store.cancelTask(parts[2]);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/tasks') {
        sendJson(response, 200, { tasks: store.listTasks() });
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
    start: () => new Promise<void>((resolve) => {
      server.listen(port, host, () => resolve());
    }),
    stop: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
    url: () => {
      const address = server.address();
      if (!address || typeof address === 'string') return `http://${host}:${port}`;
      return `http://${host}:${address.port}`;
    },
  };
};
