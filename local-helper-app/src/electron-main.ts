import path from 'node:path';
import process from 'node:process';

import { parseDeepLink } from './deep-link.ts';
import {
  buildProtocolRegistration,
  buildTrayMenuTemplate,
  resolveAppConfig,
  type TrayMenuItem,
} from './electron-shell.ts';
import { createLocalApiServer } from './local-api.ts';
import { createTaskStore } from './task-store.ts';

const electron = await import('electron');
const { app, BrowserWindow, Menu, shell, Tray, nativeImage } = electron;

const config = resolveAppConfig();
const store = createTaskStore();
const server = createLocalApiServer({ store, port: config.port });
let tray: InstanceType<typeof Tray> | null = null;
let pairWindow: InstanceType<typeof BrowserWindow> | null = null;

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
  void pairWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/pair.html'), {
    search: `api=${encodeURIComponent(config.localUrl)}`,
  });
  pairWindow.on('closed', () => {
    pairWindow = null;
    refreshTray();
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
    await fetch(`${config.localUrl}/cloud/tasks/${encodeURIComponent(link.taskId)}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => null);
  }
};

app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find((item) => item.startsWith('hcz-helper://'));
  if (deepLink) handleDeepLink(deepLink);
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

await app.whenReady();
registerProtocol();
await server.start();

const icon = nativeImage.createEmpty();
tray = new Tray(icon);
tray.setToolTip('恒化成本地采集助手');
refreshTray();

const startupLink = process.argv.find((item) => item.startsWith('hcz-helper://'));
if (startupLink) handleDeepLink(startupLink);

// 首次运行（尚未与云端配对）且不是通过配对深链启动时，自动弹出配对窗口。
if (!store.health().cloudPaired && !startupLink) {
  openPairingWindow();
}

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', async () => {
  await server.stop().catch(() => null);
});
