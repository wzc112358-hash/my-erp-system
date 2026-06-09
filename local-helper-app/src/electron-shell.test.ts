import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProtocolRegistration,
  buildTrayMenuTemplate,
  resolveAppConfig,
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
