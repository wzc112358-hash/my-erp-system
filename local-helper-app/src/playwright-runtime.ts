import fs from 'node:fs';
import path from 'node:path';

import type { BrowserHarnessRuntime, BrowserObservation } from './huajin-harness.ts';

type PageLike = {
  goto?: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  title: () => Promise<string>;
  url: () => string;
  locator: (selector: string) => { innerText: (options?: Record<string, unknown>) => Promise<string> };
  screenshot?: (options: { path: string; fullPage?: boolean }) => Promise<unknown>;
};

type ContextLike = {
  pages: () => PageLike[];
  newPage: () => Promise<PageLike>;
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
};

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });

const loadChromium = async (): Promise<ChromiumLike> => {
  const playwright = await import('playwright');
  return playwright.chromium;
};

export const createPlaywrightRuntime = ({
  chromium,
  profileDir,
  screenshotDir = path.join(profileDir, 'artifacts'),
  headless = false,
  navigationTimeoutMs = 45000,
}: PlaywrightRuntimeOptions): BrowserHarnessRuntime => {
  let contextPromise: Promise<ContextLike> | null = null;
  let activePage: PageLike | null = null;

  const context = async () => {
    if (!contextPromise) {
      ensureDir(profileDir);
      ensureDir(screenshotDir);
      contextPromise = (async () => {
        const resolvedChromium = chromium || await loadChromium();
        return resolvedChromium.launchPersistentContext(profileDir, {
          headless,
          viewport: { width: 1366, height: 900 },
          acceptDownloads: true,
          ignoreHTTPSErrors: true,
        });
      })();
    }
    return contextPromise;
  };

  const page = async () => {
    const browserContext = await context();
    activePage = activePage || browserContext.pages()[0] || await browserContext.newPage();
    return activePage;
  };

  const observePage = async (target: PageLike, screenshotPath = ''): Promise<BrowserObservation> => ({
    title: await target.title(),
    url: target.url(),
    visibleText: await target.locator('body').innerText({ timeout: 5000 }).catch(() => ''),
    screenshotPath,
  });

  return {
    async open(url: string) {
      const target = await page();
      await target.goto?.(url, {
        waitUntil: 'domcontentloaded',
        timeout: navigationTimeoutMs,
      });
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
  };
};
