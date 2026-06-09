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
  { label: '打开 ERP', click: `open:${erpUrl}` },
  { label: '打开本地状态', click: `open:${localUrl}/health` },
  { type: 'separator' },
  { label: '退出', click: 'quit' },
];
