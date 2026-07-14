import fs from 'node:fs';
import path from 'node:path';

import type {
  BrowserHarnessRuntime,
  BrowserLink,
  BrowserNetworkResponse,
  BrowserObservation,
} from './site-harness.ts';

type PageLike = {
  goto?: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  waitForLoadState?: (state?: string, options?: Record<string, unknown>) => Promise<unknown>;
  waitForTimeout?: (timeout: number) => Promise<unknown>;
  title: () => Promise<string>;
  url: () => string;
  content?: () => Promise<string>;
  locator: (selector: string) => {
    innerText: (options?: Record<string, unknown>) => Promise<string>;
    evaluateAll?: <T>(fn: (elements: Element[]) => T) => Promise<T>;
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

export type PlaywrightRuntimeOptions = {
  chromium?: ChromiumLike;
  profileDir: string;
  screenshotDir?: string;
  headless?: boolean;
  navigationTimeoutMs?: number;
  settleTimeoutMs?: number;
  browserChannels?: string[];
  proxyServer?: string;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
};

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });
const MAX_NETWORK_RESPONSES = 30;
const MAX_RESPONSE_BODY = 40_000;
const MAX_DOM_SNAPSHOT = 180_000;
const RESPONSE_INTEREST_PATTERN = /招标|采购|询价|询比|竞价|谈判|公告|notice|bid|tender|bulletin|query|page|list/i;

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
  if (['win32', 'darwin', 'linux'].includes(platform)) return ['chrome', 'msedge', ''];
  return [''];
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
  const playwright = await import('playwright');
  return playwright.chromium;
};

const trim = (value = '', limit: number) => (
  value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value
);

const collectLinks = async (target: PageLike): Promise<BrowserLink[]> => {
  const locator = target.locator('a');
  if (!locator.evaluateAll) return [];
  return locator.evaluateAll((anchors) => anchors
    .map((anchor) => {
      const element = anchor as HTMLAnchorElement;
      return {
        text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
        href: element.href || element.getAttribute('href') || '',
        title: element.title || element.getAttribute('title') || '',
      };
    })
    .filter((link) => link.text || link.title || link.href)
    .slice(0, 240));
};

export const createPlaywrightRuntime = ({
  chromium,
  profileDir,
  screenshotDir = path.join(profileDir, 'artifacts'),
  headless = false,
  env = process.env,
  navigationTimeoutMs = 45000,
  settleTimeoutMs = Number(env.HCZ_LOCAL_HELPER_SETTLE_TIMEOUT_MS || 3000),
  browserChannels,
  proxyServer,
  platform = process.platform,
}: PlaywrightRuntimeOptions): BrowserHarnessRuntime => {
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
        let bodySnippet = '';
        if (/json|text|html|xml|javascript/i.test(contentType)) {
          bodySnippet = trim(await response.text?.().catch(() => '') || '', MAX_RESPONSE_BODY);
        }
        pushNetworkResponse({
          url,
          status: response.status?.() || 0,
          contentType,
          bodySnippet,
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
    title: await target.title(),
    url: target.url(),
    visibleText: await target.locator('body').innerText({ timeout: 5000 }).catch(() => ''),
    domSnapshot: trim(await target.content?.().catch(() => '') || '', MAX_DOM_SNAPSHOT),
    links: await collectLinks(target).catch(() => []),
    networkResponses: [...networkResponses],
    downloadedFiles: [...downloadedFiles],
    screenshotPath,
  });

  const settlePage = async (target: PageLike) => {
    if (settleTimeoutMs <= 0) return;
    await target.waitForLoadState?.('networkidle', { timeout: settleTimeoutMs }).catch(() => undefined);
    await target.waitForTimeout?.(150).catch(() => undefined);
  };

  return {
    async open(url: string) {
      const target = await page();
      await target.goto?.(url, {
        waitUntil: 'domcontentloaded',
        timeout: navigationTimeoutMs,
      });
      await settlePage(target);
      return observePage(target);
    },

    async observe() {
      return observePage(await page());
    },

    async screenshot() {
      const target = await page();
      const file = path.join(screenshotDir, `${Date.now()}-screenshot.png`);
      await target.screenshot?.({ path: file, fullPage: true });
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
