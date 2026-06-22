import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { parseDeepLink } from './deep-link.ts';
import {
  buildProtocolRegistration,
  buildRendererFileUrl,
  buildStartupFailureMessage,
  buildTrayMenuTemplate,
  chromiumStartupFallbackSwitches,
  decideStartupMode,
  resolveAppConfig,
  resolveRendererFilePath,
  type TrayMenuItem,
} from './electron-shell.ts';
import { createJsonFileConfigStore } from './local-config-store.ts';
import { createLocalApiServer } from './local-api.ts';
import { createTaskStore } from './task-store.ts';

const electron = await import('electron');
const { app, BrowserWindow, Menu, shell, Tray, nativeImage, dialog } = electron;

const localDataDir = path.join(
  process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir(),
  'HengHuaChengLocalHelper',
);
const startupLogFile = path.join(
  localDataDir,
  'startup.log',
);
const configFile = path.join(localDataDir, 'config.json');

const appendStartupLog = (message: string, error?: unknown) => {
  try {
    fs.mkdirSync(path.dirname(startupLogFile), { recursive: true });
    const detail = error instanceof Error ? `${error.stack || error.message}` : error ? String(error) : '';
    fs.appendFileSync(startupLogFile, `[${new Date().toISOString()}] [pid:${process.pid}] ${message}${detail ? `\n${detail}` : ''}\n`, 'utf8');
  } catch {
    // Logging must never stop the helper from opening.
  }
};

appendStartupLog(`process start; pid=${process.pid}; platform=${process.platform}; arch=${process.arch}; electron=${process.versions.electron || ''}; argv=${process.argv.join(' ')}`);
app.disableHardwareAcceleration();
for (const item of chromiumStartupFallbackSwitches()) {
  app.commandLine.appendSwitch(item.name, item.value);
}
appendStartupLog(`chromium startup fallbacks enabled: ${chromiumStartupFallbackSwitches().map((item) => (item.value ? `${item.name}=${item.value}` : item.name)).join(', ')}`);

process.on('uncaughtException', (error) => {
  appendStartupLog('uncaughtException', error);
});
process.on('unhandledRejection', (error) => {
  appendStartupLog('unhandledRejection', error);
});
process.on('exit', (code) => {
  appendStartupLog(`process exit: ${code}`);
});

app.on('will-finish-launching', () => appendStartupLog('app event: will-finish-launching'));
app.on('ready', () => appendStartupLog('app event: ready'));
app.on('before-quit', () => appendStartupLog('app event: before-quit'));
app.on('quit', (_event, exitCode) => appendStartupLog(`app event: quit ${exitCode}`));
app.on('render-process-gone', (_event, _webContents, details) => {
  appendStartupLog(`app event: render-process-gone ${JSON.stringify(details)}`);
});
app.on('child-process-gone', (_event, details) => {
  appendStartupLog(`app event: child-process-gone ${JSON.stringify(details)}`);
});

const config = resolveAppConfig();
const helperVersion = app.getVersion();
const store = createTaskStore({
  configStore: createJsonFileConfigStore(configFile),
  helperVersion,
});
let tray: InstanceType<typeof Tray> | null = null;
let pairWindow: InstanceType<typeof BrowserWindow> | null = null;
let taskWindow: InstanceType<typeof BrowserWindow> | null = null;
let resolveLocalApiReady: () => void = () => {};
let rejectLocalApiReady: (error: unknown) => void = () => {};
const localApiReady = new Promise<void>((resolve, reject) => {
  resolveLocalApiReady = resolve;
  rejectLocalApiReady = reject;
});
void localApiReady.catch(() => null);
const electronReady = app.whenReady();
void electronReady.catch((error) => appendStartupLog('app.whenReady rejected', error));

const rendererPath = (fileName: string) => resolveRendererFilePath({
  isPackaged: app.isPackaged,
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath || path.dirname(app.getAppPath()),
  fileName,
});
const rendererDir = path.dirname(rendererPath('pair.html'));
const server = createLocalApiServer({
  store,
  port: config.port,
  helperVersion,
  rendererDir,
});
let serverStopped = false;
let gracefulQuitStarted = false;

const loadRendererWindow = async (
  window: InstanceType<typeof BrowserWindow>,
  fileName: string,
  params: Record<string, string>,
  label: string,
) => {
  const filePath = rendererPath(fileName);
  const fileExists = fs.existsSync(filePath);
  const url = buildRendererFileUrl(filePath, params);
  appendStartupLog(`${label}: ${filePath}; exists=${fileExists}; url=${url}`);
  if (!fileExists) {
    throw new Error(`renderer file missing: ${filePath}`);
  }
  await window.loadURL(url);
};

const loadDiagnosticPage = (
  window: InstanceType<typeof BrowserWindow>,
  title: string,
  message: string,
) => {
  const body = `
    <!doctype html>
    <meta charset="utf-8" />
    <title>${title}</title>
    <body style="font-family: system-ui, sans-serif; padding: 24px; line-height: 1.6;">
      <h2>${title}</h2>
      <pre style="white-space: pre-wrap; background: #f6f7f9; padding: 12px; border-radius: 6px;">${message}</pre>
    </body>
  `;
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(body)}`)
    .catch((error) => appendStartupLog('diagnostic page load failed', error));
};

const openPairingWindow = () => {
  if (pairWindow && !pairWindow.isDestroyed()) {
    pairWindow.focus();
    return;
  }
  pairWindow = new BrowserWindow({
    width: 480,
    height: 460,
    resizable: false,
    title: '恒化成本地采集助手 · 配对',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  pairWindow.setMenuBarVisibility(false);
  pairWindow.on('close', () => appendStartupLog('pairing window close'));
  pairWindow.webContents.on('render-process-gone', (_event, details) => {
    appendStartupLog(`pairing window render gone: ${JSON.stringify(details)}`);
  });
  pairWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    appendStartupLog(`pairing window load failed event: ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  void loadRendererWindow(pairWindow, 'pair.html', {
    api: config.localUrl,
  }, 'open pairing window').catch((error) => {
    appendStartupLog('pairing window load failed', error);
    if (pairWindow && !pairWindow.isDestroyed()) {
      loadDiagnosticPage(pairWindow, '本地助手页面加载失败', `${error instanceof Error ? error.stack || error.message : String(error)}\n\n日志位置：${startupLogFile}`);
    }
  });
  pairWindow.on('closed', () => {
    pairWindow = null;
    refreshTray();
  });
};

const openTaskWindow = (taskId = '') => {
  if (taskWindow && !taskWindow.isDestroyed()) {
    taskWindow.focus();
    if (taskId) {
      void loadRendererWindow(taskWindow, 'tasks.html', {
        api: config.localUrl,
        taskId,
      }, 'reload task window').catch((error) => {
        appendStartupLog('task window reload failed', error);
        if (taskWindow && !taskWindow.isDestroyed()) {
          loadDiagnosticPage(taskWindow, '本地助手任务页加载失败', `${error instanceof Error ? error.stack || error.message : String(error)}\n\n日志位置：${startupLogFile}`);
        }
      });
    }
    return;
  }
  taskWindow = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    title: '恒化成本地采集助手 · 任务',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  taskWindow.setMenuBarVisibility(false);
  taskWindow.on('close', () => appendStartupLog('task window close'));
  taskWindow.webContents.on('render-process-gone', (_event, details) => {
    appendStartupLog(`task window render gone: ${JSON.stringify(details)}`);
  });
  taskWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    appendStartupLog(`task window load failed event: ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  void loadRendererWindow(taskWindow, 'tasks.html', {
    api: config.localUrl,
    taskId,
  }, 'open task window').catch((error) => {
    appendStartupLog('task window load failed', error);
    if (taskWindow && !taskWindow.isDestroyed()) {
      loadDiagnosticPage(taskWindow, '本地助手任务页加载失败', `${error instanceof Error ? error.stack || error.message : String(error)}\n\n日志位置：${startupLogFile}`);
    }
  });
  taskWindow.on('closed', () => {
    taskWindow = null;
  });
};

const runMenuAction = (action = '') => {
  if (action.startsWith('open:')) {
    shell.openExternal(action.slice('open:'.length));
    return;
  }
  if (action === 'pair') {
    openPairingWindow();
    return;
  }
  if (action === 'tasks') {
    openTaskWindow();
    return;
  }
  if (action === 'quit') app.quit();
};

const electronMenuFrom = (items: TrayMenuItem[]) => Menu.buildFromTemplate(
  items.map((item) => {
    if (item.type === 'separator') return { type: 'separator' };
    return {
      label: item.label,
      enabled: item.enabled !== false,
      click: () => runMenuAction(item.click),
    };
  }),
);

const refreshTray = () => {
  const template = buildTrayMenuTemplate({
    localUrl: config.localUrl,
    erpUrl: config.erpUrl,
    paired: Boolean(store.health().cloudPaired),
  });
  tray?.setContextMenu(electronMenuFrom(template));
};

const registerProtocol = () => {
  const registration = buildProtocolRegistration({
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    appPath: app.getAppPath(),
  });
  app.setAsDefaultProtocolClient(
    registration.protocol,
    registration.executable,
    registration.args,
  );
};

const handleDeepLink = async (rawUrl = '') => {
  const link = parseDeepLink(rawUrl);
  if (link.type === 'pair') {
    await fetch(`${config.localUrl}/cloud/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cloudUrl: link.cloudUrl,
        code: link.code,
        deviceName: process.env.COMPUTERNAME || process.env.HOSTNAME || 'Windows 本地助手',
        deviceFingerprint: process.env.COMPUTERNAME || process.env.HOSTNAME || 'local-helper',
      }),
    }).catch(() => null);
    refreshTray();
    return;
  }
  if (link.type === 'task') {
    await fetch(`${config.localUrl}/cloud/tasks`).catch(() => null);
    afterElectronReady('open task window from deep link', () => openTaskWindow(link.taskId));
  }
};

const openDefaultWindow = () => {
  openTaskWindow();
};

const afterLocalApiReady = (label: string, action: () => void | Promise<void>) => {
  void localApiReady
    .then(() => action())
    .catch((error) => appendStartupLog(`${label} skipped because startup failed`, error));
};

const afterElectronReady = (label: string, action: () => void | Promise<void>) => {
  void electronReady
    .then(() => action())
    .catch((error) => appendStartupLog(`${label} skipped because Electron failed`, error));
};

const probeLocalApiHealth = async (timeoutMs = 1500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.localUrl}/health`, {
      signal: controller.signal,
    });
    appendStartupLog(`local api health probe: status=${response.status}`);
    return response.ok;
  } catch (error) {
    appendStartupLog('local api health probe failed', error);
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const summarizeError = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  const code = 'code' in error ? String((error as Error & { code?: unknown }).code || '') : '';
  return code ? `${error.message} (${code})` : error.message;
};

app.on('second-instance', (_event, argv) => {
  appendStartupLog(`second-instance; argv=${argv.join(' ')}`);
  const deepLink = argv.find((item) => item.startsWith('hcz-helper://'));
  if (deepLink) {
    afterLocalApiReady('second-instance deep link', () => handleDeepLink(deepLink));
    return;
  }
  afterElectronReady('second-instance focus', () => openDefaultWindow());
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  afterLocalApiReady('open-url deep link', () => handleDeepLink(url));
});

const singleInstance = app.requestSingleInstanceLock();
const startupMode = decideStartupMode({
  hasSingleInstanceLock: singleInstance,
  existingLocalApiReachable: singleInstance ? false : await probeLocalApiHealth(),
});
if (startupMode === 'exit-secondary') {
  appendStartupLog('single instance lock unavailable and existing local api is healthy; exiting secondary process');
  app.quit();
  process.exit(0);
}
if (startupMode === 'recover-stale-lock') {
  appendStartupLog('single instance lock unavailable but local api is not healthy; continuing startup to recover a stale helper process');
}

let startupStage = '启动本地服务端口';
try {
  startupStage = '启动本地服务端口';
  await server.start();
  resolveLocalApiReady();
  appendStartupLog(`local api listening: ${config.localUrl}`);
} catch (error) {
  if (startupStage === '启动本地服务端口' && await probeLocalApiHealth()) {
    appendStartupLog('local api became healthy after startup failure; exiting this helper process');
    app.quit();
    process.exit(0);
  }
  rejectLocalApiReady(error);
  appendStartupLog('local api start failed', error);
  dialog.showErrorBox(
    '恒化成本地采集助手启动失败',
    buildStartupFailureMessage({
      port: config.port,
      stage: startupStage,
      errorMessage: summarizeError(error),
      logFile: startupLogFile,
    }),
  );
  throw error;
}

let desktopShellStarted = false;
const startupLink = process.argv.find((item) => item.startsWith('hcz-helper://'));
const startDesktopShell = async () => {
  appendStartupLog('waiting for Electron ready for desktop shell');
  startupStage = '等待 Electron 初始化';
  await electronReady;
  desktopShellStarted = true;
  appendStartupLog(`app ready; version=${app.getVersion()}; path=${app.getAppPath()}; resources=${process.resourcesPath || ''}; fallbackUi=${config.localUrl}/ui/tasks`);

  startupStage = '注册深链协议';
  registerProtocol();

  try {
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP8z8BQDwAFgwJ/lU0+IwAAAABJRU5ErkJggg==');
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('恒化成本地采集助手');
    refreshTray();
  } catch (error) {
    appendStartupLog('tray creation failed; continuing without tray', error);
  }

  if (startupLink) {
    await handleDeepLink(startupLink);
    return;
  }
  openDefaultWindow();
};

void startDesktopShell().catch((error) => {
  appendStartupLog('desktop shell start failed; local api remains available', error);
  dialog.showErrorBox(
    '恒化成本地采集助手界面启动失败',
    `${buildStartupFailureMessage({
      port: config.port,
      stage: startupStage,
      errorMessage: summarizeError(error),
      logFile: startupLogFile,
    })}\n\n本地服务已启动，可先在浏览器打开：${config.localUrl}/ui/tasks`,
  );
});

setTimeout(() => {
  if (desktopShellStarted || app.isReady()) return;
  const error = new Error(`app.whenReady still pending after 30000ms; isReady=${app.isReady()}; pid=${process.pid}; execPath=${process.execPath}`);
  appendStartupLog('desktop shell readiness delayed; local api remains available', error);
  dialog.showErrorBox(
    '恒化成本地采集助手界面启动较慢',
    `本地服务已经启动：${config.localUrl}\n\n桌面窗口仍在初始化。你可以先在浏览器打开备用界面：${config.localUrl}/ui/tasks\n\n日志位置：${startupLogFile}`,
  );
}, 30000);

app.on('window-all-closed', (event) => {
  appendStartupLog('window-all-closed; quitting helper process');
  if (!gracefulQuitStarted) app.quit();
});

app.on('before-quit', (event) => {
  appendStartupLog('before quit');
  if (serverStopped) return;
  event.preventDefault();
  gracefulQuitStarted = true;
  void (async () => {
    serverStopped = true;
    tray?.destroy();
    tray = null;
    await server.stop().catch((error) => appendStartupLog('local api stop failed during quit', error));
    app.quit();
  })();
});
