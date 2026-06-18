import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRendererFileUrl,
  buildProtocolRegistration,
  buildTrayMenuTemplate,
  buildStartupFailureMessage,
  chromiumStartupFallbackSwitches,
  decideStartupMode,
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
  assert.match(menu[1].label, /已连接/);
  assert.ok(menu.some((item) => item.label === '打开 ERP'));
  assert.ok(menu.some((item) => item.label === '打开任务列表'));
  assert.ok(menu.some((item) => item.click === 'tasks'));
  assert.ok(menu.some((item) => item.label === '退出'));
  assert.ok(menu.some((item) => item.click === 'pair'));
});

test('electron shell tray menu offers immediate pairing when not paired', () => {
  const menu = buildTrayMenuTemplate({
    localUrl: 'http://127.0.0.1:17321',
    erpUrl: 'https://erp.henghuacheng.cn',
    paired: false,
  });

  const pairItem = menu.find((item) => item.click === 'pair');
  assert.ok(pairItem);
  assert.match(pairItem.label || '', /配对/);
});

test('electron shell loads renderer files outside app.asar when packaged', () => {
  const filePath = resolveRendererFilePath({
    isPackaged: true,
    appPath: '/opt/hcz/resources/app.asar',
    resourcesPath: '/opt/hcz/resources',
    fileName: 'pair.html',
  });

  assert.equal(filePath, '/opt/hcz/resources/app.asar.unpacked/dist/renderer/pair.html');
});

test('electron shell builds encoded file URLs for renderer pages', () => {
  const url = buildRendererFileUrl('/opt/hcz/resources/app.asar.unpacked/dist/renderer/pair.html', {
    api: 'http://127.0.0.1:17321',
  });

  assert.equal(url, 'file:///opt/hcz/resources/app.asar.unpacked/dist/renderer/pair.html?api=http%3A%2F%2F127.0.0.1%3A17321');
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
