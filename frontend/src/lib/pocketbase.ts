import PocketBase from 'pocketbase';

const getCurrentSystem = (): string => {
  return localStorage.getItem('erp_system') || 'beijing';
};

const getApiBaseUrl = (): string => {
  const overrideUrl = import.meta.env.VITE_POCKETBASE_URL;
  if (overrideUrl) return overrideUrl;

  if (import.meta.env.DEV && import.meta.env.VITE_USE_REMOTE_API !== '1') {
    return 'http://127.0.0.1:8090';
  }
  const system = getCurrentSystem();
  switch (system) {
    case 'beijing':
      return 'https://api-beijing.henghuacheng.cn';
    case 'lanzhou':
      return 'https://api-lanzhou.henghuacheng.cn';
    default:
      return 'https://api-beijing.henghuacheng.cn';
  }
};

export const pb = new PocketBase(getApiBaseUrl());
pb.autoCancellation(false);

export const switchSystem = (system: string) => {
  localStorage.setItem('erp_system', system);
  pb.baseUrl = getApiBaseUrl();
};

export const API_BASE_URL = getApiBaseUrl();
export const getCurrentSystemName = (): string => {
  const system = getCurrentSystem();
  return system === 'beijing' ? '北京' : '兰州';
};
