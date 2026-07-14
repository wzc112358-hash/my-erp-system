export type CloudClientOptions = {
  cloudUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

export type PairRequest = {
  code: string;
  deviceName: string;
  deviceFingerprint: string;
  helperVersion: string;
  platform: string;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const requestJson = async (
  { cloudUrl, token = '', fetchImpl = fetch }: CloudClientOptions,
  path: string,
  options: RequestInit = {},
) => {
  if (!cloudUrl) throw new Error('cloudUrl is required');
  const response = await fetchImpl(`${normalizeBaseUrl(cloudUrl)}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error || `cloud request failed: ${response.status}`);
  }
  return body;
};

export const pairWithCloud = async (
  options: CloudClientOptions,
  payload: PairRequest,
) => requestJson(options, '/local-helper/pair', {
  method: 'POST',
  body: JSON.stringify(payload),
});

export const uploadCloudTaskReport = async (
  options: CloudClientOptions,
  taskId: string,
  payload: Record<string, unknown>,
) => requestJson(options, `/local-helper/tasks/${encodeURIComponent(taskId)}/result`, {
  method: 'POST',
  body: JSON.stringify(payload),
});
