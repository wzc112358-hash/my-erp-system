const runtimeTargetUrl = (session = {}) => session.target_url || session.login_url || 'about:blank';

const requireRunning = (running, sessionId) => {
  const existing = running.get(sessionId);
  if (!existing) throw new Error('browser session is not running');
  return existing;
};

const svgSnapshot = ({ sessionId, targetUrl, lastAction = 'started' }) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#f8fafc"/>
  <rect x="24" y="24" width="912" height="56" rx="8" fill="#e5e7eb"/>
  <text x="44" y="59" font-family="Arial, sans-serif" font-size="18" fill="#111827">${sessionId}</text>
  <rect x="24" y="104" width="912" height="360" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="44" y="152" font-family="Arial, sans-serif" font-size="22" fill="#1f2937">${targetUrl}</text>
  <text x="44" y="200" font-family="Arial, sans-serif" font-size="18" fill="#4b5563">last action: ${lastAction}</text>
  <text x="44" y="438" font-family="Arial, sans-serif" font-size="14" fill="#64748b">stub browser snapshot</text>
</svg>`;

const createStubRuntime = () => {
  const running = new Map();

  return {
    async start(session) {
      const existing = running.get(session.id);
      if (existing) return existing;
      const started = {
        runtime_status: 'running',
        runtime_url: `stub://browser/${session.id}`,
        target_url: runtimeTargetUrl(session),
        last_action: 'started',
      };
      running.set(session.id, started);
      return started;
    },

    async stop(sessionId) {
      const existing = running.get(sessionId);
      if (existing?.context?.close) {
        await existing.context.close();
      }
      running.delete(sessionId);
      return {
        runtime_status: 'stopped',
        runtime_url: '',
      };
    },

    isRunning(sessionId) {
      return running.has(sessionId);
    },

    async snapshot(sessionId) {
      const existing = requireRunning(running, sessionId);
      return {
        content_type: 'image/svg+xml',
        data: svgSnapshot({
          sessionId,
          targetUrl: existing.target_url,
          lastAction: existing.last_action,
        }),
      };
    },

    async navigate(sessionId, targetUrl) {
      const existing = requireRunning(running, sessionId);
      const updated = {
        ...existing,
        target_url: targetUrl,
        last_action: `navigate ${targetUrl}`,
      };
      running.set(sessionId, updated);
      return {
        runtime_status: 'running',
        runtime_url: updated.runtime_url,
        target_url: updated.target_url,
        last_action: updated.last_action,
      };
    },

    async click(sessionId, { x = 0, y = 0 } = {}) {
      const existing = requireRunning(running, sessionId);
      const updated = {
        ...existing,
        last_action: `click ${Number(x)},${Number(y)}`,
      };
      running.set(sessionId, updated);
      return {
        runtime_status: 'running',
        runtime_url: updated.runtime_url,
        target_url: updated.target_url,
        last_action: updated.last_action,
      };
    },

    async typeText(sessionId, text = '') {
      const existing = requireRunning(running, sessionId);
      const updated = {
        ...existing,
        last_action: `type ${text}`,
      };
      running.set(sessionId, updated);
      return {
        runtime_status: 'running',
        runtime_url: updated.runtime_url,
        target_url: updated.target_url,
        last_action: updated.last_action,
      };
    },
  };
};

export const buildPersistentContextOptions = ({
  headless = process.env.BROWSER_HEADLESS !== '0',
  executablePath = process.env.BROWSER_EXECUTABLE_PATH || '',
} = {}) => ({
  headless,
  viewport: { width: 1366, height: 900 },
  ...(executablePath ? { executablePath } : {}),
});

const createPlaywrightRuntime = ({
  headless = process.env.BROWSER_HEADLESS !== '0',
  executablePath = process.env.BROWSER_EXECUTABLE_PATH || '',
} = {}) => {
  const running = new Map();

  return {
    async start(session) {
      const existing = running.get(session.id);
      if (existing) return {
        runtime_status: 'running',
        runtime_url: existing.runtime_url,
        target_url: existing.target_url,
      };

      const { chromium } = await import('playwright');
      const context = await chromium.launchPersistentContext(session.profile_dir, buildPersistentContextOptions({
        headless,
        executablePath,
      }));
      const page = context.pages()[0] || await context.newPage();
      const targetUrl = runtimeTargetUrl(session);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      const runtime = {
        context,
        page,
        runtime_url: `chrome-profile://${session.id}`,
        target_url: targetUrl,
      };
      running.set(session.id, runtime);
      return {
        runtime_status: 'running',
        runtime_url: runtime.runtime_url,
        target_url: runtime.target_url,
      };
    },

    async stop(sessionId) {
      const existing = running.get(sessionId);
      if (existing?.context) {
        await existing.context.close();
      }
      running.delete(sessionId);
      return {
        runtime_status: 'stopped',
        runtime_url: '',
      };
    },

    isRunning(sessionId) {
      return running.has(sessionId);
    },

    async snapshot(sessionId) {
      const existing = requireRunning(running, sessionId);
      const data = await existing.page.screenshot({ type: 'png', fullPage: false });
      return {
        content_type: 'image/png',
        data,
      };
    },

    async navigate(sessionId, targetUrl) {
      const existing = requireRunning(running, sessionId);
      await existing.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      existing.target_url = targetUrl;
      return {
        runtime_status: 'running',
        runtime_url: existing.runtime_url,
        target_url: existing.target_url,
        last_action: `navigate ${targetUrl}`,
      };
    },

    async click(sessionId, { x = 0, y = 0 } = {}) {
      const existing = requireRunning(running, sessionId);
      await existing.page.mouse.click(Number(x), Number(y));
      return {
        runtime_status: 'running',
        runtime_url: existing.runtime_url,
        target_url: existing.target_url,
        last_action: `click ${Number(x)},${Number(y)}`,
      };
    },

    async typeText(sessionId, text = '') {
      const existing = requireRunning(running, sessionId);
      await existing.page.keyboard.type(String(text));
      return {
        runtime_status: 'running',
        runtime_url: existing.runtime_url,
        target_url: existing.target_url,
        last_action: `type ${text}`,
      };
    },
  };
};

export const createBrowserRuntime = ({
  mode = process.env.BROWSER_RUNTIME_MODE || 'stub',
  ...options
} = {}) => {
  if (mode === 'playwright') return createPlaywrightRuntime(options);
  return createStubRuntime();
};
