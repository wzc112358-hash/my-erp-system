import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createElectronCdpSession } from './electron-cdp-session.ts';
import { rewriteYulongSearchRequestUrl } from '../sites/yulong-agent.ts';

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

test('Electron CDP session follows the BrowserWindow behind a child WebContents popup', async () => {
  const parentHandlers: Record<string, (...args: any[]) => void> = {};
  const childHandlers: Record<string, (...args: any[]) => void> = {};
  const makeDebugger = () => {
    let attached = false;
    return {
      attach: () => { attached = true; },
      isAttached: () => attached,
      detach: () => { attached = false; },
      on: () => undefined,
      sendCommand: async () => ({}),
    };
  };
  let parentClosed = false;
  let childClosed = false;
  let childShown = false;
  const childWindow: any = {
    webContents: null,
    isDestroyed: () => false,
    show: () => { childShown = true; },
    focus: () => undefined,
    close: () => { childClosed = true; },
    on: () => undefined,
  };
  const childWebContents = {
    debugger: makeDebugger(),
    loadURL: async () => undefined,
    getURL: () => 'https://ctbpsp.com/#/bulletinDetail?uuid=yulong-1',
    getTitle: () => '安全验证',
    executeJavaScript: async () => ({
      title: '安全验证',
      url: 'https://ctbpsp.com/#/bulletinDetail?uuid=yulong-1',
      visibleText: '请完成安全验证',
      links: [],
      interactiveElements: [],
      searchQuery: '',
      currentPage: 0,
      totalPages: 0,
      structuredRows: [],
    }),
    capturePage: async () => ({ toPNG: () => Buffer.from('child') }),
    on: (event: string, listener: (...args: any[]) => void) => { childHandlers[event] = listener; },
    getOwnerBrowserWindow: () => childWindow,
  };
  childWindow.webContents = childWebContents;
  const parentWebContents = {
    debugger: makeDebugger(),
    loadURL: async () => undefined,
    getURL: () => 'https://ctbpsp.com/#/',
    getTitle: () => '搜索首页',
    executeJavaScript: async (script: string) => {
      if (script.includes('left_body_name')) {
        parentHandlers['did-create-window']?.({}, childWebContents);
        return { performed: true, detail: '裕龙石化采购公告' };
      }
      return {
        title: '搜索首页',
        url: 'https://ctbpsp.com/#/',
        visibleText: '裕龙石化采购公告',
        links: [],
        interactiveElements: [],
        searchQuery: '',
        currentPage: 0,
        totalPages: 0,
        structuredRows: [],
      };
    },
    capturePage: async () => ({ toPNG: () => Buffer.from('parent') }),
    on: (event: string, listener: (...args: any[]) => void) => { parentHandlers[event] = listener; },
  };
  const parentWindow = {
    webContents: parentWebContents,
    isDestroyed: () => false,
    show: () => undefined,
    focus: () => undefined,
    close: () => { parentClosed = true; },
    on: () => undefined,
  };
  const session = createElectronCdpSession({
    createWindow: () => parentWindow,
    screenshotDir: os.tmpdir(),
    settleTimeoutMs: 0,
  });

  await session.open('https://ctbpsp.com/#/');
  const action = await session.act?.({ type: 'click_first_notice' });

  assert.equal(action?.observation.url, 'https://ctbpsp.com/#/bulletinDetail?uuid=yulong-1');
  assert.equal(action?.observation.visibleText, '请完成安全验证');
  assert.equal(childShown, true);

  let verificationClosed: () => void = () => undefined;
  const verificationWindow: any = {
    webContents: null,
    isDestroyed: () => false,
    show: () => undefined,
    focus: () => undefined,
    close: () => undefined,
    on: (event: string, listener: () => void) => {
      if (event === 'closed') verificationClosed = listener;
    },
  };
  const verificationContents = {
    debugger: makeDebugger(),
    loadURL: async () => undefined,
    getURL: () => 'https://cdn4.vaptcha.com/src/verify.html',
    getTitle: () => 'VAPTCHA',
    executeJavaScript: async () => ({
      title: 'VAPTCHA', url: 'https://cdn4.vaptcha.com/src/verify.html',
      visibleText: '请绘制图中轨迹完成验证', links: [], interactiveElements: [],
      searchQuery: '', currentPage: 0, totalPages: 0, structuredRows: [],
      humanChallengeVisible: true,
    }),
    capturePage: async () => ({ toPNG: () => Buffer.from('verification') }),
    on: () => undefined,
    getOwnerBrowserWindow: () => verificationWindow,
  };
  verificationWindow.webContents = verificationContents;
  childHandlers['did-create-window']?.({}, verificationContents);
  assert.match((await session.observe()).url, /vaptcha/);

  verificationClosed();
  const afterVerification = await session.observe();
  assert.equal(afterVerification.url, 'https://ctbpsp.com/#/bulletinDetail?uuid=yulong-1');
  await session.close?.();
  assert.equal(parentClosed, true);
  assert.equal(childClosed, true);
});

test('Electron CDP next-page action targets the Yulong Vue pageEvent state machine', async () => {
  let attached = false;
  let sawVuePageEvent = false;
  const webContents = {
    debugger: {
      attach: () => { attached = true; },
      isAttached: () => attached,
      detach: () => { attached = false; },
      on: () => undefined,
      sendCommand: async () => ({}),
    },
    loadURL: async () => undefined,
    getURL: () => 'https://ctbpsp.com/#/bulletinList',
    getTitle: () => '搜索结果',
    executeJavaScript: async (script: string) => {
      if (script.includes('vm.pageEvent(current + 1)')) {
        sawVuePageEvent = true;
        return { performed: true, detail: 'vue pageEvent 2' };
      }
      return {
        title: '搜索结果',
        url: 'https://ctbpsp.com/#/bulletinList',
        visibleText: '裕龙石化采购公告',
        links: [],
        interactiveElements: [],
        searchQuery: '裕龙石化',
        currentPage: 2,
        totalPages: 10,
        structuredRows: [{ noticeName: '裕龙石化采购公告', url: 'https://ctbpsp.com/#/bulletinDetail?uuid=2' }],
      };
    },
    capturePage: async () => ({ toPNG: () => Buffer.from('png') }),
  };
  const window = {
    webContents,
    isDestroyed: () => false,
    show: () => undefined,
    focus: () => undefined,
    close: () => undefined,
    on: () => undefined,
  };
  const session = createElectronCdpSession({
    createWindow: () => window,
    screenshotDir: os.tmpdir(),
    settleTimeoutMs: 0,
  });

  await session.open('https://ctbpsp.com/#/bulletinList');
  const result = await session.act?.({ type: 'next_page' });

  assert.equal(sawVuePageEvent, true);
  assert.equal(result?.performed, true);
  assert.equal(result?.observation.currentPage, 2);
  await session.close?.();
});

test('Electron CDP rewrites Yulong search traffic to tender announcements before the request is sent', async () => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const commands: Array<{ method: string; params?: Record<string, unknown> }> = [];
  let attached = false;
  const webContents = {
    debugger: {
      attach: () => { attached = true; },
      isAttached: () => attached,
      detach: () => { attached = false; },
      on: (event: string, listener: (...args: any[]) => void) => { handlers[event] = listener; },
      sendCommand: async (method: string, params?: Record<string, unknown>) => {
        commands.push({ method, params });
        return {};
      },
    },
    loadURL: async () => undefined,
    getURL: () => 'https://ctbpsp.com/#/bulletinList',
    getTitle: () => '搜索结果',
    executeJavaScript: async () => ({
      title: '搜索结果', url: 'https://ctbpsp.com/#/bulletinList', visibleText: '', links: [],
      interactiveElements: [], searchQuery: '裕龙石化', currentPage: 1, totalPages: 1,
      humanChallengeVisible: false, structuredRows: [],
    }),
    capturePage: async () => ({ toPNG: () => Buffer.from('png') }),
  };
  const window = {
    webContents,
    isDestroyed: () => false,
    show: () => undefined,
    focus: () => undefined,
    close: () => undefined,
    on: () => undefined,
  };
  const session = createElectronCdpSession({
    createWindow: () => window,
    screenshotDir: os.tmpdir(),
    settleTimeoutMs: 0,
    rewriteRequestUrl: rewriteYulongSearchRequestUrl,
  });

  await session.open('https://ctbpsp.com/#/bulletinList');
  handlers.message?.({}, 'Fetch.requestPaused', {
    requestId: 'fetch-1',
    request: {
      url: 'https://ctbpsp.com/cutominfoapi/searchkeyword?keyword=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96&bulletinType=5&CurrentPage=1',
    },
  });
  await wait(0);

  const continued = commands.find((command) => command.method === 'Fetch.continueRequest');
  assert.match(String(continued?.params?.url), /bulletinType=0/);
  assert.doesNotMatch(String(continued?.params?.url), /bulletinType=5/);
  await session.close?.();
});

test('Electron CDP reads decrypted Yulong detail state and PDF.js text from the employee browser', async () => {
  let attached = false;
  let readDocument = false;
  const webContents = {
    debugger: {
      attach: () => { attached = true; },
      isAttached: () => attached,
      detach: () => { attached = false; },
      on: () => undefined,
      sendCommand: async () => ({}),
    },
    loadURL: async () => undefined,
    getURL: () => 'https://ctbpsp.com/#/bulletinDetail?uuid=yulong-doc-1',
    getTitle: () => '裕龙石化阻聚剂采购招标公告',
    executeJavaScript: async (script: string) => {
      if (script.includes('HCZ_READ_DOCUMENT')) {
        readDocument = true;
        return {
          title: '裕龙石化阻聚剂采购招标公告',
          noticeType: '招标公告',
          publishedAt: '2026-07-15',
          buyerName: '山东裕龙石化有限公司',
          pdfUrl: 'https://ctbpsp.com/files/yulong-doc-1.pdf',
          attachmentUrls: ['https://ctbpsp.com/files/spec.docx'],
          text: '采购货物：阻聚剂。投标截止时间：2026年7月20日。',
          pageCount: 2,
        };
      }
      return {
        title: '裕龙石化阻聚剂采购招标公告',
        url: 'https://ctbpsp.com/#/bulletinDetail?uuid=yulong-doc-1',
        visibleText: '公告详情', links: [], interactiveElements: [], searchQuery: '',
        currentPage: 0, totalPages: 0, humanChallengeVisible: false, structuredRows: [],
      };
    },
    capturePage: async () => ({ toPNG: () => Buffer.from('png') }),
  };
  const window = {
    webContents,
    isDestroyed: () => false,
    show: () => undefined,
    focus: () => undefined,
    close: () => undefined,
    on: () => undefined,
  };
  const session = createElectronCdpSession({
    createWindow: () => window,
    screenshotDir: os.tmpdir(),
    settleTimeoutMs: 0,
  });

  await session.open(webContents.getURL());
  const result = await session.act?.({ type: 'read_document' });

  assert.equal(readDocument, true);
  assert.equal(result?.observation.document?.noticeType, '招标公告');
  assert.match(result?.observation.document?.text || '', /阻聚剂/);
  assert.equal(result?.observation.document?.pageCount, 2);
  await session.close?.();
});
