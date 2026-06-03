// 首次运行配对界面用到的纯逻辑（校验 + 构造配对请求体），与 Electron/渲染层解耦以便单测。

export const DEFAULT_CLOUD_URL = 'https://agent.henghuacheng.cn';

export type PairFormInput = {
  cloudUrl?: string;
  code?: string;
  deviceName?: string;
};

export type PairFormValidation = {
  valid: boolean;
  errors: { cloudUrl?: string; code?: string };
  normalized: { cloudUrl: string; code: string; deviceName: string };
};

export const validatePairForm = (input: PairFormInput = {}): PairFormValidation => {
  const cloudUrl = String(input.cloudUrl ?? '').trim() || DEFAULT_CLOUD_URL;
  const code = String(input.code ?? '').trim();
  const deviceName = String(input.deviceName ?? '').trim();
  const errors: { cloudUrl?: string; code?: string } = {};
  if (!/^https?:\/\/.+/i.test(cloudUrl)) {
    errors.cloudUrl = '云端地址需以 http:// 或 https:// 开头';
  }
  if (!code) {
    errors.code = '请输入配对码';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: { cloudUrl, code, deviceName },
  };
};

export type PairPayload = {
  cloudUrl: string;
  code: string;
  deviceName: string;
  deviceFingerprint: string;
};

// 构造与 POST /cloud/pair 一致的请求体；非法输入抛错，设备名缺省时回落到机器名。
export const buildPairPayload = (
  input: PairFormInput = {},
  env: Record<string, string | undefined> = {},
): PairPayload => {
  const { valid, errors, normalized } = validatePairForm(input);
  if (!valid) {
    throw new Error(Object.values(errors).join('；'));
  }
  const fallbackName = env.COMPUTERNAME || env.HOSTNAME || 'Windows 本地助手';
  const deviceName = normalized.deviceName || fallbackName;
  return {
    cloudUrl: normalized.cloudUrl.replace(/\/+$/, ''),
    code: normalized.code,
    deviceName,
    deviceFingerprint: deviceName,
  };
};
