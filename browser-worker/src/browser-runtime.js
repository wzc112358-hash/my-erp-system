const runtimeTargetUrl = (session = {}) => session.target_url || session.login_url || 'about:blank';

const htmlEscape = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export const navigationFailurePage = ({ targetUrl = '', message = '' } = {}) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>目标网站打开失败</title>
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #111827; }
      main { max-width: 840px; margin: 0 auto; padding: 56px 24px; }
      section { background: #fff; border: 1px solid #fecaca; border-radius: 8px; padding: 24px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 10px 0; line-height: 1.7; color: #374151; }
      code { display: block; margin-top: 10px; padding: 12px; border-radius: 6px; background: #f3f4f6; color: #111827; white-space: pre-wrap; word-break: break-word; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>目标网站打开失败</h1>
        <p>远程浏览器已经启动，但目标网站没有正常返回页面。通常是目标站点限制服务器访问、反爬拦截、网络超时、证书或登录入口失效导致。</p>
        <p>可以尝试在下方地址栏重新导航，或由员工在本地助手/本机浏览器完成登录和验证。</p>
        <p>目标地址：</p>
        <code>${htmlEscape(targetUrl)}</code>
        <p>错误信息：</p>
        <code>${htmlEscape(message)}</code>
      </section>
    </main>
  </body>
</html>`;

const navigationErrorMessage = (error) => (
  error?.message ? String(error.message) : String(error)
);

const navigateOrShowFailure = async (page, targetUrl, { successAction = `navigate ${targetUrl}` } = {}) => {
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return {
      target_url: targetUrl,
      last_action: successAction,
      last_error: '',
    };
  } catch (error) {
    const message = navigationErrorMessage(error);
    try {
      await page.setContent(navigationFailurePage({ targetUrl, message }), { waitUntil: 'domcontentloaded' });
    } catch {
      // If even the fallback page cannot render, keep the original navigation error.
    }
    return {
      target_url: targetUrl,
      last_action: `navigation failed ${targetUrl}`,
      last_error: message,
    };
  }
};

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
  chromium: injectedChromium,
} = {}) => {
  const running = new Map();

  return {
    async start(session) {
      const existing = running.get(session.id);
      if (existing) return {
        runtime_status: 'running',
        runtime_url: existing.runtime_url,
        target_url: existing.target_url,
        last_action: existing.last_action,
        last_error: existing.last_error,
      };

      const chromium = injectedChromium || (await import('playwright')).chromium;
      let context;
      try {
        context = await chromium.launchPersistentContext(session.profile_dir, buildPersistentContextOptions({
          headless,
          executablePath,
        }));
        const page = context.pages()[0] || await context.newPage();
        const targetUrl = runtimeTargetUrl(session);
        const runtime = {
          context,
          page,
          runtime_url: `chrome-profile://${session.id}`,
          target_url: targetUrl,
          last_action: 'starting',
          last_error: '',
        };
        running.set(session.id, runtime);
        const navigation = await navigateOrShowFailure(page, targetUrl, { successAction: 'started' });
        Object.assign(runtime, navigation);
        return {
          runtime_status: 'running',
          runtime_url: runtime.runtime_url,
          target_url: runtime.target_url,
          last_action: runtime.last_action,
          last_error: runtime.last_error,
        };
      } catch (error) {
        if (!running.has(session.id) && context) {
          await context.close().catch(() => {});
        }
        throw error;
      }
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
      const navigation = await navigateOrShowFailure(existing.page, targetUrl);
      Object.assign(existing, navigation);
      return {
        runtime_status: 'running',
        runtime_url: existing.runtime_url,
        target_url: existing.target_url,
        last_action: existing.last_action,
        last_error: existing.last_error,
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
