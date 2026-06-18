import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type AppConfig = {
  port: number;
  localUrl: string;
  erpUrl: string;
};

export type ProtocolRegistration = {
  protocol: 'hcz-helper';
  executable: string;
  args: string[];
};

export type TrayMenuItem = {
  label?: string;
  enabled?: boolean;
  type?: 'separator';
  click?: string;
};

export type RendererPathInput = {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
  fileName: string;
};

export type StartupMode = 'primary' | 'exit-secondary' | 'recover-stale-lock';

export type ChromiumStartupSwitch = {
  name: string;
  value?: string;
};

export const resolveAppConfig = (env: Record<string, string | undefined> = process.env): AppConfig => {
  const port = Number(env.HCZ_LOCAL_HELPER_PORT || 17321);
  return {
    port,
    localUrl: `http://127.0.0.1:${port}`,
    erpUrl: env.HCZ_ERP_URL || 'https://erp.henghuacheng.cn',
  };
};

export const buildProtocolRegistration = ({
  isPackaged,
  execPath,
  appPath,
}: {
  isPackaged: boolean;
  execPath: string;
  appPath: string;
}): ProtocolRegistration => ({
  protocol: 'hcz-helper',
  executable: execPath,
  args: isPackaged ? [] : [appPath],
});

export const buildTrayMenuTemplate = ({
  localUrl,
  erpUrl,
  paired = false,
}: {
  localUrl: string;
  erpUrl: string;
  paired?: boolean;
}): TrayMenuItem[] => [
  { label: '恒化成本地采集助手', enabled: false },
  { label: paired ? `已连接：${localUrl}` : `未配对：${localUrl}`, enabled: false },
  { type: 'separator' },
  { label: paired ? '配对 / 设置' : '立即配对…', click: 'pair' },
  { label: '打开任务列表', click: 'tasks', enabled: paired },
  { label: '打开 ERP', click: `open:${erpUrl}` },
  { label: '打开本地状态', click: `open:${localUrl}/health` },
  { type: 'separator' },
  { label: '退出', click: 'quit' },
];

export const resolveRendererFilePath = ({
  isPackaged,
  appPath,
  resourcesPath,
  fileName,
}: RendererPathInput) => (isPackaged
  ? path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'renderer', fileName)
  : path.join(appPath, 'dist', 'renderer', fileName));

export const buildRendererFileUrl = (
  filePath: string,
  params: Record<string, string> = {},
) => {
  const url = pathToFileURL(filePath);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};

export const decideStartupMode = ({
  hasSingleInstanceLock,
  existingLocalApiReachable,
}: {
  hasSingleInstanceLock: boolean;
  existingLocalApiReachable: boolean;
}): StartupMode => {
  if (hasSingleInstanceLock) return 'primary';
  return existingLocalApiReachable ? 'exit-secondary' : 'recover-stale-lock';
};

export const buildStartupFailureMessage = ({
  port,
  stage,
  errorMessage,
  logFile,
}: {
  port: number;
  stage: string;
  errorMessage: string;
  logFile: string;
}) => [
  `启动阶段：${stage}`,
  `错误信息：${errorMessage || '未知错误'}`,
  '',
  `本地服务地址：http://127.0.0.1:${port}`,
  '',
  '如果已经打开过本地助手，请先关闭旧进程后重试。',
  `日志位置：${logFile}`,
].join('\n');

export const chromiumStartupFallbackSwitches = (): ChromiumStartupSwitch[] => [
  { name: 'disable-gpu' },
  { name: 'disable-gpu-sandbox' },
  { name: 'disable-features', value: 'NetworkServiceSandbox' },
];
