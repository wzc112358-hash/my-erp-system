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
export const formatUSD = (value: number) => `$${value?.toFixed(6)}`;
export const formatCNY = (value: number) => `¥${value?.toFixed(6)}`;
export const fmtMoney = (v: number | undefined | null) => v != null ? Number(v).toFixed(6) : '0.0000';

/**
 * 格式化跨境金额显示
 * @param amount 金额
 * @param isCrossBorder 是否跨境合同（USD）
 * @param rate 汇率（USD to CNY）
 * @returns 格式化后的金额字符串
 */
export const formatCrossBorderAmount = (amount: number, isCrossBorder: boolean, rate: number): string => {
  if (isCrossBorder) {
    return `$${amount.toFixed(6)}（≈ ¥${(amount * rate).toFixed(6)}）`;
  }
  return `¥${amount.toFixed(6)}`;
};

/**
 * 格式化运费/杂费金额显示（带币种）
 * @param amount 金额
 * @param currency 币种（'USD' | 'CNY'）
 * @param rate 汇率（USD to CNY）
 * @returns 格式化后的金额字符串
 */
export const formatFreightAmount = (amount: number, currency: 'USD' | 'CNY', rate: number): string => {
  if (currency === 'USD') {
    return `$${amount.toFixed(6)}（≈ ¥${(amount * rate).toFixed(6)}）`;
  }
  return `¥${amount.toFixed(6)}（≈ $${(amount / rate).toFixed(6)}）`;
};

/**
 * 格式化剩余金额提示（用于表单）
 * @param amount 金额
 * @param isCrossBorder 是否跨境合同
 * @param rate 汇率
 * @returns 格式化后的金额字符串
 */
export const formatRemainingAmount = (amount: number, isCrossBorder: boolean | undefined, rate: number): string => {
  if (isCrossBorder) {
    return `$${amount.toFixed(6)}（≈ ¥${(amount * rate).toFixed(6)}）`;
  }
  return `¥${amount.toFixed(6)}`;
};
