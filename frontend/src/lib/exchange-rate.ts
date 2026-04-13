import { pb } from '@/lib/pocketbase';

const DEFAULT_RATE = 7.25;
let cachedRate: number | null = null;

export const getUsdToCnyRate = async (): Promise<number> => {
  if (cachedRate !== null) return cachedRate;
  try {
    const settings = await pb.collection('settings').getFirstListItem(`key="default"`);
    cachedRate = (settings as unknown as Record<string, unknown>).usd_to_cny as number ?? DEFAULT_RATE;
    return cachedRate;
  } catch {
    return DEFAULT_RATE;
  }
};

export const updateUsdToCnyRate = async (rate: number): Promise<void> => {
  const settings = await pb.collection('settings').getFirstListItem(`key="default"`);
  await pb.collection('settings').update(settings.id, { usd_to_cny: rate });
  cachedRate = rate;
};

export const clearRateCache = () => { cachedRate = null; };

export const usdToCny = (usd: number, rate: number) => usd * rate;
export const formatUSD = (value: number) => `$${value?.toFixed(4)}`;
export const formatCNY = (value: number) => `¥${value?.toFixed(4)}`;
export const fmtMoney = (v: number | undefined | null) => v != null ? Number(v).toFixed(4) : '0.0000';
