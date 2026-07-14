import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildRendererFileUrl,
  buildProtocolRegistration,
  buildTrayMenuTemplate,
  buildStartupFailureMessage,
  chromiumStartupFallbackSwitches,
  decideStartupMode,
  resolveExistingRendererFilePath,
  resolveRendererFileCandidates,
  resolveAppConfig,
  resolveRendererFilePath,
} from './electron-shell.ts';

test('electron shell resolves default local helper config', () => {
  const config = resolveAppConfig({
    HCZ_LOCAL_HELPER_PORT: '18001',
    HCZ_ERP_URL: 'https://erp.henghuacheng.cn',
  });

  assert.equal(config.port, 18001);
  assert.equal(config.localUrl, 'http://127.0.0.1:18001');
  assert.equal(config.erpUrl, 'https://erp.henghuacheng.cn');
});

test('electron shell builds hcz-helper protocol registration for packaged app', () => {
  const registration = buildProtocolRegistration({
    isPackaged: true,
    execPath: 'C:\\Program Files\\HCZ\\hcz-local-helper.exe',
    appPath: 'C:\\Program Files\\HCZ\\resources\\app.asar',
  });

  assert.equal(registration.protocol, 'hcz-helper');
  assert.equal(registration.executable, 'C:\\Program Files\\HCZ\\hcz-local-helper.exe');
  assert.deepEqual(registration.args, []);
});

test('electron shell builds dev protocol registration with app path', () => {
  const registration = buildProtocolRegistration({
    isPackaged: false,
    execPath: 'C:\\node\\electron.exe',
    appPath: 'D:\\repo\\local-helper-app',
  });

  assert.equal(registration.executable, 'C:\\node\\electron.exe');
  assert.deepEqual(registration.args, ['D:\\repo\\local-helper-app']);
});

test('electron shell tray menu exposes status, ERP, and exit actions', () => {
  const menu = buildTrayMenuTemplate({
    localUrl: 'http://127.0.0.1:17321',
    erpUrl: 'https://erp.henghuacheng.cn',
    paired: true,
  });

  assert.equal(menu[0].label, '恒化成本地采集助手');
  assert.match(menu[1]?.label || '', /云端上传已配置/);
  assert.ok(menu.some((item) => item.label === '打开 ERP'));
  assert.ok(menu.some((item) => item.label === '打开本地任务台'));
  assert.ok(menu.some((item) => item.click === 'tasks'));
  assert.ok(menu.some((item) => item.label === '退出'));
  assert.ok(menu.some((item) => item.click === 'pair'));
});

test('electron shell tray menu keeps local task desk available when not paired', () => {
  const menu = buildTrayMenuTemplate({
    localUrl: 'http://127.0.0.1:17321',
    erpUrl: 'https://erp.henghuacheng.cn',
    paired: false,
  });

  const pairItem = menu.find((item) => item.click === 'pair');
  const taskItem = menu.find((item) => item.click === 'tasks');
  assert.ok(pairItem);
  assert.match(pairItem.label || '', /云端上传/);
  assert.ok(taskItem);
  assert.equal(taskItem.enabled, undefined);
});

test('electron shell loads packaged renderer files from the app-dist output', () => {
  const resourcesPath = path.resolve('opt', 'hcz', 'resources');
  const filePath = resolveRendererFilePath({
    isPackaged: true,
    appPath: path.join(resourcesPath, 'app.asar'),
    resourcesPath,
    fileName: 'pair.html',
  });

  assert.equal(filePath, path.join(resourcesPath, 'app.asar.unpacked', 'app-dist', 'renderer', 'pair.html'));
});

test('electron shell can fall back to renderer files inside app.asar', () => {
  const resourcesPath = path.resolve('opt', 'hcz', 'resources');
  const input = {
    isPackaged: true,
    appPath: path.join(resourcesPath, 'app.asar'),
    resourcesPath,
    fileName: 'tasks.html',
  };
  const candidates = resolveRendererFileCandidates(input);
  const unpackedFile = path.join(resourcesPath, 'app.asar.unpacked', 'app-dist', 'renderer', 'tasks.html');
  const asarFile = path.join(resourcesPath, 'app.asar', 'app-dist', 'renderer', 'tasks.html');

  assert.deepEqual(candidates, [unpackedFile, asarFile]);
  assert.equal(
    resolveExistingRendererFilePath(input, (filePath) => filePath === asarFile),
    asarFile,
  );
});

test('electron shell builds encoded file URLs for renderer pages', () => {
  const filePath = path.resolve('opt', 'hcz', 'resources', 'app.asar.unpacked', 'app-dist', 'renderer', 'pair.html');
  const url = buildRendererFileUrl(filePath, {
    api: 'http://127.0.0.1:17321',
  });

  const expected = pathToFileURL(filePath);
  expected.searchParams.set('api', 'http://127.0.0.1:17321');
  assert.equal(url, expected.toString());
});

test('electron shell exits a secondary instance only when an existing local API is healthy', () => {
  assert.equal(decideStartupMode({
    hasSingleInstanceLock: true,
    existingLocalApiReachable: false,
  }), 'primary');
  assert.equal(decideStartupMode({
    hasSingleInstanceLock: false,
    existingLocalApiReachable: true,
  }), 'exit-secondary');
  assert.equal(decideStartupMode({
    hasSingleInstanceLock: false,
    existingLocalApiReachable: false,
  }), 'recover-stale-lock');
});

test('electron shell startup failure message includes the failing stage and log path', () => {
  const message = buildStartupFailureMessage({
    port: 17321,
    stage: '启动本地服务端口',
    errorMessage: 'EADDRINUSE',
    logFile: 'C:\\Users\\wzc\\AppData\\Local\\HengHuaChengLocalHelper\\startup.log',
  });

  assert.match(message, /启动本地服务端口/);
  assert.match(message, /EADDRINUSE/);
  assert.match(message, /17321/);
  assert.match(message, /startup\.log/);
});

test('electron shell applies conservative Chromium fallback switches', () => {
  const switches = chromiumStartupFallbackSwitches();

  assert.ok(switches.some((item) => item.name === 'disable-gpu'));
  assert.ok(switches.some((item) => item.name === 'disable-gpu-sandbox'));
  assert.ok(switches.some((item) => item.value === 'NetworkServiceSandbox'));
});
