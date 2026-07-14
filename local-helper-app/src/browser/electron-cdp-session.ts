import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  BrowserLink,
  BrowserNetworkResponse,
  BrowserObservation,
  BrowserSession,
} from './types.ts';

type DebuggerLike = {
  attach(protocolVersion?: string): void;
  isAttached(): boolean;
  detach(): void;
  on(event: 'message' | 'detach', listener: (...args: any[]) => void): void;
  sendCommand(method: string, commandParams?: Record<string, unknown>, sessionId?: string): Promise<any>;
};

type WebContentsLike = {
  debugger: DebuggerLike;
  loadURL(url: string, options?: Record<string, unknown>): Promise<void>;
  getURL(): string;
  getTitle(): string;
  executeJavaScript<T>(code: string, userGesture?: boolean): Promise<T>;
  capturePage(): Promise<{ toPNG(): Buffer }>;
};

type BrowserWindowLike = {
  webContents: WebContentsLike;
  isDestroyed(): boolean;
  show(): void;
  focus(): void;
  close(): void;
  on(event: 'closed', listener: () => void): void;
};

export type ElectronCdpSessionOptions = {
  createWindow: () => BrowserWindowLike | any;
  screenshotDir: string;
  settleTimeoutMs?: number;
  cdpCommandTimeoutMs?: number;
  navigationTimeoutMs?: number;
  observationTimeoutMs?: number;
};

const MAX_NETWORK_RESPONSES = 16;
const MAX_RESPONSE_BODY = 24_000;
const MAX_LINKS = 120;
const INTEREST_PATTERN = /招标|采购|询价|询比|竞价|谈判|公告|notice|bid|tender|bulletin|query|search|page|list/i;
const CHALLENGE_PATTERN = /sigchl|punish-type|网易盾|安全验证|访问验证|captcha|traceid|访问过于频繁/i;
const SAFE_RESPONSE_HEADERS = new Set(['content-type', 'punish-type', 'location', 'retry-after']);

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const settleWithin = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> => {
  if (timeoutMs <= 0) return promise.catch(() => undefined);
  let timeout: ReturnType<typeof setTimeout> | number | undefined;
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<undefined>((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
};
const trim = (value = '', limit = MAX_RESPONSE_BODY) => value.length > limit
  ? `${value.slice(0, limit)}\n...[truncated]`
  : value;
const normalizeHeaders = (headers: Record<string, unknown> = {}) => Object.fromEntries(
  Object.entries(headers)
    .filter(([name]) => SAFE_RESPONSE_HEADERS.has(name.toLowerCase()))
    .map(([name, value]) => [name.toLowerCase(), String(value || '')]),
);

const PAGE_OBSERVATION_SCRIPT = `(() => ({
  title: document.title || '',
  url: location.href,
  visibleText: (document.body?.innerText || '').slice(0, 120000),
  links: Array.from(document.querySelectorAll('a')).slice(0, ${MAX_LINKS}).map((anchor) => ({
    text: (anchor.innerText || anchor.textContent || '').replace(/\\s+/g, ' ').trim(),
    href: anchor.href || anchor.getAttribute('href') || '',
    title: anchor.title || anchor.getAttribute('title') || ''
  }))
}))()`;

export const createElectronCdpSession = ({
  createWindow,
  screenshotDir,
  settleTimeoutMs = 800,
  cdpCommandTimeoutMs = 1_500,
  navigationTimeoutMs = 12_000,
  observationTimeoutMs = 2_000,
}: ElectronCdpSessionOptions): BrowserSession => {
  let window: BrowserWindowLike | null = null;
  let windowPromise: Promise<BrowserWindowLike> | null = null;
  let debuggerReady: Promise<void> | null = null;
  const networkResponses: BrowserNetworkResponse[] = [];
  const pendingResponses = new Map<string, BrowserNetworkResponse>();

  const pushResponse = (response: BrowserNetworkResponse) => {
    networkResponses.push(response);
    if (networkResponses.length > MAX_NETWORK_RESPONSES) {
      networkResponses.splice(0, networkResponses.length - MAX_NETWORK_RESPONSES);
    }
  };

  const wireDebugger = async (target: BrowserWindowLike) => {
    const cdp = target.webContents.debugger;
    if (!cdp.isAttached()) cdp.attach('1.3');
    cdp.on('message', (_event, method: string, params: any) => {
      if (method === 'Network.responseReceived') {
        const url = String(params?.response?.url || '');
        const mimeType = String(params?.response?.mimeType || '');
        if (!INTEREST_PATTERN.test(`${url} ${mimeType}`)) return;
        const responseHeaders = normalizeHeaders(params?.response?.headers || {});
        pendingResponses.set(String(params.requestId || ''), {
          url,
          status: Number(params?.response?.status || 0),
          contentType: responseHeaders['content-type'] || mimeType,
          responseHeaders,
          bodySnippet: '',
          challenge: CHALLENGE_PATTERN.test(`${url} ${JSON.stringify(responseHeaders)}`),
        });
      }
      if (method === 'Network.loadingFinished') {
        const requestId = String(params?.requestId || '');
        const response = pendingResponses.get(requestId);
        if (!response) return;
        pendingResponses.delete(requestId);
        void cdp.sendCommand('Network.getResponseBody', { requestId }).then((body) => {
          const decoded = body?.base64Encoded
            ? Buffer.from(String(body.body || ''), 'base64').toString('utf8')
            : String(body?.body || '');
          const bodySnippet = trim(decoded);
          pushResponse({
            ...response,
            bodySnippet,
            challenge: Boolean(response.challenge) || CHALLENGE_PATTERN.test(bodySnippet.slice(0, 1200)),
          });
        }).catch(() => pushResponse(response));
      }
    });
    cdp.on('detach', () => {
      pendingResponses.clear();
    });
    await cdp.sendCommand('Network.enable', {
      maxTotalBufferSize: 2_000_000,
      maxResourceBufferSize: 300_000,
    });
  };

  const getWindow = async () => {
    if (window && !window.isDestroyed()) {
      window.show();
      window.focus();
      return window;
    }
    if (!windowPromise) {
      windowPromise = (async () => {
        const created = createWindow();
        window = created;
        created.on('closed', () => {
          if (window === created) window = null;
          windowPromise = null;
          debuggerReady = null;
        });
        // A hidden, never-navigated WebContents can leave Network.enable
        // pending indefinitely on Windows. Make the employee window visible
        // first, then let navigation create the renderer while CDP attaches.
        created.show();
        created.focus();
        debuggerReady = settleWithin(wireDebugger(created), cdpCommandTimeoutMs).then(() => undefined);
        return created;
      })();
    }
    return windowPromise;
  };

  const observeWindow = async (target: BrowserWindowLike): Promise<BrowserObservation> => {
    const evaluated = target.webContents.executeJavaScript<{
      title: string;
      url: string;
      visibleText: string;
      links: BrowserLink[];
    }>(PAGE_OBSERVATION_SCRIPT, false);
    const page = await settleWithin(evaluated, observationTimeoutMs) || {
      title: target.webContents.getTitle(),
      url: target.webContents.getURL(),
      visibleText: '',
      links: [],
    };
    return {
      ...page,
      networkResponses: [...networkResponses],
      downloadedFiles: [],
    };
  };

  return {
    engine: 'electron-cdp',
    async open(url: string) {
      const target = await getWindow();
      const navigation = settleWithin(target.webContents.loadURL(url), navigationTimeoutMs);
      await Promise.all([debuggerReady || Promise.resolve(), navigation]);
      if (settleTimeoutMs > 0) await wait(settleTimeoutMs);
      return observeWindow(target);
    },
    async observe() {
      const target = await getWindow();
      await debuggerReady;
      if (settleTimeoutMs > 0) await wait(Math.min(350, settleTimeoutMs));
      return observeWindow(target);
    },
    async screenshot() {
      const target = await getWindow();
      await fs.mkdir(screenshotDir, { recursive: true });
      const file = path.join(screenshotDir, `${Date.now()}-electron-cdp.png`);
      const image = await settleWithin(target.webContents.capturePage(), observationTimeoutMs);
      if (!image) return '';
      await fs.writeFile(file, image.toPNG());
      return file;
    },
    async close() {
      const current = window;
      window = null;
      windowPromise = null;
      debuggerReady = null;
      if (!current || current.isDestroyed()) return;
      const cdp = current.webContents.debugger;
      if (cdp.isAttached()) cdp.detach();
      current.close();
    },
  };
};
