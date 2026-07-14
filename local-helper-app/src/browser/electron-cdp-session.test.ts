import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createElectronCdpSession } from './electron-cdp-session.ts';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('Electron CDP session exposes employee-visible page and challenge evidence', async () => {
  const screenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcz-cdp-'));
  const handlers: Record<string, (...args: any[]) => void> = {};
  let attached = false;
  let closed = false;
  const cdp = {
    attach: () => { attached = true; },
    isAttached: () => attached,
    detach: () => { attached = false; },
    on: (event: string, listener: (...args: any[]) => void) => { handlers[event] = listener; },
    sendCommand: async (method: string) => method === 'Network.getResponseBody'
      ? { body: '<html>sigchl security challenge</html>', base64Encoded: false }
      : {},
  };
  const webContents = {
    debugger: cdp,
    loadURL: async () => {
      handlers.message?.({}, 'Network.responseReceived', {
        requestId: 'request-1',
        response: {
          url: 'https://ctbpsp.com/cutominfoapi/searchkeyword',
          status: 200,
          mimeType: 'text/html',
          headers: { 'content-type': 'text/html', 'punish-type': 'sigchl' },
        },
      });
      handlers.message?.({}, 'Network.loadingFinished', { requestId: 'request-1' });
    },
    getURL: () => 'https://ctbpsp.com/#/bulletinList',
    getTitle: () => '全国招标公告公示搜索引擎',
    executeJavaScript: async () => ({
      title: '全国招标公告公示搜索引擎',
      url: 'https://ctbpsp.com/#/bulletinList',
      visibleText: '加载中...',
      links: [],
    }),
    capturePage: async () => ({ toPNG: () => Buffer.from('png') }),
  };
  const window = {
    webContents,
    isDestroyed: () => false,
    show: () => undefined,
    focus: () => undefined,
    close: () => { closed = true; },
    on: () => undefined,
  };
  const session = createElectronCdpSession({
    createWindow: () => window,
    screenshotDir,
    settleTimeoutMs: 5,
  });
  const observation = await session.open('https://ctbpsp.com/#/bulletinList');
  const screenshot = await session.screenshot?.() || '';
  assert.equal(session.engine, 'electron-cdp');
  assert.equal(observation.networkResponses?.[0]?.challenge, true);
  assert.equal(observation.networkResponses?.[0]?.responseHeaders?.['punish-type'], 'sigchl');
  assert.match(screenshot, /electron-cdp\.png/);
  await session.close?.();
  assert.equal(closed, true);
  await fs.rm(screenshotDir, { recursive: true, force: true });
});

test('Electron CDP session stays visible and returns control when CDP and navigation hang', async () => {
  const order: string[] = [];
  let attached = false;
  let closed = false;
  const never = new Promise<never>(() => {});
  const window = {
    webContents: {
      debugger: {
        attach: () => { attached = true; },
        isAttached: () => attached,
        detach: () => { attached = false; },
        on: () => undefined,
        sendCommand: () => never,
      },
      loadURL: () => {
        order.push('load');
        return never;
      },
      getURL: () => 'https://ctbpsp.com/#/bulletinList',
      getTitle: () => '全国招标公告公示搜索引擎',
      executeJavaScript: () => never,
      capturePage: () => never,
    },
    isDestroyed: () => false,
    show: () => { order.push('show'); },
    focus: () => { order.push('focus'); },
    close: () => { closed = true; },
    on: () => undefined,
  };
  const session = createElectronCdpSession({
    createWindow: () => window,
    screenshotDir: os.tmpdir(),
    settleTimeoutMs: 0,
    cdpCommandTimeoutMs: 5,
    navigationTimeoutMs: 5,
    observationTimeoutMs: 5,
  });

  const outcome = await Promise.race([
    session.open('https://ctbpsp.com/#/bulletinList'),
    wait(80).then(() => null),
  ]);
  await session.close?.();

  assert.ok(outcome, 'open() must not stay pending forever');
  assert.deepEqual(order, ['show', 'focus', 'load']);
  assert.equal(outcome?.title, '全国招标公告公示搜索引擎');
  assert.equal(outcome?.visibleText, '');
  assert.equal(closed, true);
});
