import http from 'node:http';

import { createPocketBaseLocalHelperStore } from './local-helper-store.js';

const readJson = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
};

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(body));
};

const bearerToken = (request) => {
  const header = request.headers.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const taskRoute = (parts) => {
  if (parts[0] !== 'local-helper' || parts[1] !== 'tasks' || !parts[2]) return null;
  return {
    taskId: decodeURIComponent(parts[2]),
    action: parts[3] || '',
  };
};

export const createLocalHelperApiServer = ({
  store = createPocketBaseLocalHelperStore(),
  port = Number(process.env.LOCAL_HELPER_API_PORT || 8097),
  host = process.env.LOCAL_HELPER_API_HOST || '0.0.0.0',
} = {}) => {
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {});
        return;
      }

      const url = new URL(request.url || '/', `http://${host}`);
      const parts = url.pathname.split('/').filter(Boolean);

      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true, service: 'hcz-local-helper-cloud-api' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/local-helper/pair') {
        const body = await readJson(request);
        sendJson(response, 200, await store.pairDevice(body));
        return;
      }

      const token = bearerToken(request);
      if (!token && url.pathname.startsWith('/local-helper/')) {
        sendJson(response, 401, { error: 'missing bearer token' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/local-helper/heartbeat') {
        const body = await readJson(request);
        sendJson(response, 200, await store.heartbeat(token, body));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/local-helper/tasks') {
        sendJson(response, 200, { tasks: await store.listTasks(token) });
        return;
      }

      const route = taskRoute(parts);
      if (route && request.method === 'POST' && route.action === 'start') {
        const body = await readJson(request);
        sendJson(response, 200, await store.startTask(token, route.taskId, body));
        return;
      }

      if (route && request.method === 'POST' && route.action === 'continue') {
        const body = await readJson(request);
        sendJson(response, 200, await store.continueTask(token, route.taskId, body));
        return;
      }

      if (route && request.method === 'POST' && route.action === 'cancel') {
        const body = await readJson(request);
        sendJson(response, 200, await store.cancelTask(token, route.taskId, body));
        return;
      }

      sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /invalid local helper token|missing bearer/i.test(message) ? 401 : 400;
      sendJson(response, status, { error: message });
    }
  });

  return {
    start: () => new Promise((resolve) => {
      server.listen(port, host, () => resolve());
    }),
    stop: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
    url: () => {
      const address = server.address();
      if (!address || typeof address === 'string') return `http://${host}:${port}`;
      return `http://${host}:${address.port}`;
    },
  };
};
