import fs from 'node:fs';
import path from 'node:path';

import type {
  BrowserAction,
  BrowserActionResult,
  BrowserDocumentObservation,
  BrowserLink,
  BrowserNetworkResponse,
  BrowserObservation,
  BrowserSession,
} from './types.ts';
import {
  CLICK_FIRST_NOTICE_SCRIPT,
  NEXT_PAGE_SCRIPT,
  PAGE_OBSERVATION_SCRIPT,
  READ_DOCUMENT_SCRIPT,
  SEARCH_SCRIPT,
} from './electron-cdp-session.ts';

type PageLike = {
  goto?: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  waitForTimeout?: (timeout: number) => Promise<unknown>;
  title: () => Promise<string>;
  url: () => string;
  content?: () => Promise<string>;
  evaluate?: <T>(expression: string) => Promise<T>;
  goBack?: (options?: Record<string, unknown>) => Promise<unknown>;
  locator: (selector: string) => {
    innerText: (options?: Record<string, unknown>) => Promise<string>;
    evaluateAll?: (fn: (elements: Element[]) => unknown) => Promise<unknown>;
  };
  screenshot?: (options: { path: string; fullPage?: boolean }) => Promise<unknown>;
  on?: (event: 'response' | 'download', handler: (payload: unknown) => void) => void;
};

type ContextLike = {
  pages: () => PageLike[];
  newPage: () => Promise<PageLike>;
  close?: () => Promise<unknown>;
};

type ChromiumLike = {
  launchPersistentContext: (profileDir: string, options: Record<string, unknown>) => Promise<ContextLike>;
};

export type PlaywrightSessionOptions = {
  chromium?: ChromiumLike;
  profileDir: string;
  screenshotDir?: string;
  headless?: boolean;
  navigationTimeoutMs?: number;
  settleTimeoutMs?: number;
  browserChannels?: string[];
  proxyServer?: string;
  captureDomSnapshot?: boolean;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
};

const MAX_NETWORK_RESPONSES = 16;
const MAX_RESPONSE_BODY = 24_000;
const MAX_DOM_SNAPSHOT = 60_000;
const MAX_LINKS = 120;
const RESPONSE_INTEREST_PATTERN = /招标|采购|询价|询比|竞价|谈判|公告|notice|bid|tender|bulletin|query|search|page|list/i;
const CHALLENGE_PATTERN = /sigchl|punish-type|网易盾|安全验证|访问验证|captcha|traceid|访问过于频繁/i;
const SAFE_RESPONSE_HEADERS = new Set(['content-type', 'punish-type', 'location', 'retry-after']);

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });
const trim = (value = '', limit: number) => value.length > limit
  ? `${value.slice(0, limit)}\n...[truncated]`
  : value;

export const browserChannelCandidatesFor = ({
  env = process.env,
  platform = process.platform,
}: {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
} = {}) => {
  const configured = String(env.HCZ_LOCAL_HELPER_BROWSER_CHANNEL || '').trim();
  if (configured) {
    const normalized = configured.toLowerCase();
    if (normalized === 'bundled' || normalized === 'chromium') return [''];
    return [configured, ''];
  }
  return ['win32', 'darwin', 'linux'].includes(platform) ? ['chrome', 'msedge', ''] : [''];
};

export const proxyServerFor = (env: Record<string, string | undefined> = process.env) => (
  env.HCZ_LOCAL_HELPER_PROXY ||
  env.HTTPS_PROXY ||
  env.HTTP_PROXY ||
  env.https_proxy ||
  env.http_proxy ||
  ''
).trim();

const loadChromium = async (): Promise<ChromiumLike> => {
  const { chromium } = await import('playwright');
  return {
    launchPersistentContext: async (profileDir, options) => (
      chromium.launchPersistentContext(profileDir, options) as unknown as Promise<ContextLike>
    ),
  };
};

const safeHeaders = (headers: Record<string, string>) => Object.fromEntries(
  Object.entries(headers).filter(([name]) => SAFE_RESPONSE_HEADERS.has(name.toLowerCase())),
);

const collectLinks = async (target: PageLike): Promise<BrowserLink[]> => {
  const locator = target.locator('a');
  if (!locator.evaluateAll) return [];
  const result = await locator.evaluateAll((anchors) => anchors
    .map((anchor) => {
      const element = anchor as HTMLAnchorElement;
      return {
        text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
        href: element.href || element.getAttribute('href') || '',
        title: element.title || element.getAttribute('title') || '',
      };
    })
    .filter((link) => link.text || link.title || link.href)
    .slice(0, MAX_LINKS));
  return Array.isArray(result) ? result as BrowserLink[] : [];
};

export const createPlaywrightSession = ({
  chromium,
  profileDir,
  screenshotDir = path.join(profileDir, 'artifacts'),
  headless = false,
  env = process.env,
  navigationTimeoutMs = 45_000,
  settleTimeoutMs = Number(env.HCZ_LOCAL_HELPER_SETTLE_TIMEOUT_MS || 700),
  browserChannels,
  proxyServer,
  captureDomSnapshot = false,
  platform = process.platform,
}: PlaywrightSessionOptions): BrowserSession => {
  let contextPromise: Promise<ContextLike> | null = null;
  let activePage: PageLike | null = null;
  const networkResponses: BrowserNetworkResponse[] = [];
  const downloadedFiles: string[] = [];
  const wiredPages = new WeakSet<PageLike>();

  const pushNetworkResponse = (response: BrowserNetworkResponse) => {
    networkResponses.push(response);
    if (networkResponses.length > MAX_NETWORK_RESPONSES) {
      networkResponses.splice(0, networkResponses.length - MAX_NETWORK_RESPONSES);
    }
  };

  const wirePage = (target: PageLike) => {
    if (!target.on || wiredPages.has(target)) return;
    wiredPages.add(target);
    target.on('response', (payload: unknown) => {
      void (async () => {
        const response = payload as {
          url?: () => string;
          status?: () => number;
          headers?: () => Record<string, string>;
          text?: () => Promise<string>;
        };
        const url = response.url?.() || '';
        const headers = response.headers?.() || {};
        const contentType = headers['content-type'] || headers['Content-Type'] || '';
        if (!RESPONSE_INTEREST_PATTERN.test(`${url} ${contentType}`)) return;
        const selectedHeaders = safeHeaders(headers);
        let bodySnippet = '';
        if (/json|text|html|xml|javascript/i.test(contentType)) {
          bodySnippet = trim(await response.text?.().catch(() => '') || '', MAX_RESPONSE_BODY);
        }
        pushNetworkResponse({
          url,
          status: response.status?.() || 0,
          contentType,
          bodySnippet,
          responseHeaders: selectedHeaders,
          challenge: CHALLENGE_PATTERN.test(`${url} ${JSON.stringify(selectedHeaders)} ${bodySnippet.slice(0, 1000)}`),
        });
      })();
    });
    target.on('download', (payload: unknown) => {
      void (async () => {
        const download = payload as {
          suggestedFilename?: () => string;
          path?: () => Promise<string | null>;
        };
        const filePath = await download.path?.().catch(() => null);
        downloadedFiles.push(filePath || download.suggestedFilename?.() || 'download');
      })();
    });
  };

  const context = async () => {
    if (!contextPromise) {
      ensureDir(profileDir);
      ensureDir(screenshotDir);
      contextPromise = (async () => {
        const resolvedChromium = chromium || await loadChromium();
        const channels = browserChannels || browserChannelCandidatesFor({ env, platform });
        const proxy = proxyServer ?? proxyServerFor(env);
        let lastError: unknown = null;
        for (const channel of channels) {
          try {
            return await resolvedChromium.launchPersistentContext(profileDir, {
              ...(channel ? { channel } : {}),
              ...(proxy ? { proxy: { server: proxy } } : {}),
              args: ['--disable-features=AsyncDns'],
              headless,
              viewport: { width: 1366, height: 900 },
              acceptDownloads: true,
              ignoreHTTPSErrors: true,
            });
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError || 'failed to launch browser'));
      })();
    }
    return contextPromise;
  };

  const page = async () => {
    const browserContext = await context();
    activePage = activePage || browserContext.pages()[0] || await browserContext.newPage();
    wirePage(activePage);
    return activePage;
  };

  const observePage = async (target: PageLike, screenshotPath = ''): Promise<BrowserObservation> => ({
    ...await (async () => {
      const evaluated = target.evaluate
        ? await target.evaluate<BrowserObservation>(PAGE_OBSERVATION_SCRIPT).catch(() => undefined)
        : undefined;
      if (evaluated?.url) return evaluated;
      return {
        title: await target.title().catch(() => ''),
        url: target.url(),
        visibleText: await target.locator('body').innerText({ timeout: 3_000 }).catch(() => ''),
        links: await collectLinks(target).catch(() => []),
      };
    })(),
    domSnapshot: captureDomSnapshot
      ? trim(await target.content?.().catch(() => '') || '', MAX_DOM_SNAPSHOT)
      : '',
    networkResponses: [...networkResponses],
    downloadedFiles: [...downloadedFiles],
    screenshotPath,
  });

  const finishAction = async (
    target: PageLike,
    performed: boolean,
    detail = '',
    delayMs = settleTimeoutMs,
  ): Promise<BrowserActionResult> => {
    if (delayMs > 0) await target.waitForTimeout?.(Math.min(delayMs, 5_000)).catch(() => undefined);
    const pages = (await context()).pages();
    const newest = [...pages].reverse().find((candidate) => candidate.url() && candidate.url() !== 'about:blank');
    if (newest) {
      activePage = newest;
      wirePage(newest);
    }
    return {
      performed,
      detail,
      observation: await observePage(activePage || target),
    };
  };

  return {
    engine: 'playwright',
    async open(url: string) {
      const target = await page();
      await target.goto?.(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
      if (settleTimeoutMs > 0) await target.waitForTimeout?.(settleTimeoutMs).catch(() => undefined);
      return observePage(target);
    },
    async observe() {
      const target = await page();
      if (settleTimeoutMs > 0) await target.waitForTimeout?.(Math.min(350, settleTimeoutMs)).catch(() => undefined);
      return observePage(target);
    },
    async act(action: BrowserAction) {
      const target = await page();
      if (action.type === 'navigate') {
        await target.goto?.(action.url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
        return finishAction(target, true, action.url);
      }
      if (action.type === 'back') {
        const result = target.goBack
          ? await target.goBack({ waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs }).catch(() => null)
          : null;
        return finishAction(target, Boolean(result), result ? 'back' : 'no history');
      }
      if (action.type === 'wait') {
        return finishAction(target, true, 'wait', Math.max(0, Math.min(action.milliseconds, 5_000)));
      }
      if (!target.evaluate) return finishAction(target, false, 'page evaluate unavailable');
      if (action.type === 'read_document') {
        const document = await target.evaluate<BrowserDocumentObservation>(READ_DOCUMENT_SCRIPT).catch(() => undefined);
        const result = await finishAction(target, Boolean(document), document ? 'document read' : 'document unavailable', 0);
        return document ? { ...result, observation: { ...result.observation, document } } : result;
      }
      const script = action.type === 'click'
        ? `(() => {
          const target = document.querySelector('[data-hcz-agent-id="${action.elementId.replace(/[^a-zA-Z0-9_-]/g, '')}"]');
          if (!target) return { performed: false, detail: 'element missing' };
          target.click();
          return { performed: true, detail: String(target.innerText || target.textContent || '').trim() };
        })()`
        : action.type === 'click_first_notice'
          ? CLICK_FIRST_NOTICE_SCRIPT
          : action.type === 'search'
            ? SEARCH_SCRIPT(action.query)
            : NEXT_PAGE_SCRIPT;
      const executed = await target.evaluate<{ performed?: boolean; detail?: string }>(script).catch(() => undefined);
      return finishAction(target, Boolean(executed?.performed), executed?.detail || '');
    },
    async screenshot() {
      const target = await page();
      const file = path.join(screenshotDir, `${Date.now()}-screenshot.png`);
      await target.screenshot?.({ path: file, fullPage: false });
      return file;
    },
    async close() {
      const existingContext = await contextPromise?.catch(() => null);
      contextPromise = null;
      activePage = null;
      await existingContext?.close?.();
    },
  };
};

// Temporary compatibility export for callers being migrated to BrowserSession.
export const createPlaywrightRuntime = createPlaywrightSession;
export type PlaywrightRuntimeOptions = PlaywrightSessionOptions;
