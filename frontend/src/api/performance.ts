import { pb } from '@/lib/pocketbase';

export interface ContractDetail {
  id: string;
  no: string;
  product_name: string;
  total_amount: number;
  total_quantity: number;
  sign_date: string;
}

interface PerformanceRecord {
  id: string;
  no: string;
  product_name: string;
  total_amount: number;
  total_quantity: number;
  sign_date: string;
  created: string;
  creator_user?: string;
  expand?: {
    creator_user?: {
      id: string;
      name: string;
    };
  };
}

export interface UserPerformance {
  userId: string;
  userName: string;
  contractCount: number;
  totalAmount: number;
  amountPercent: number;
  contracts: ContractDetail[];
}

async function fetchUserNames(userIds: string[]): Promise<Record<string, string>> {
  const nameMap: Record<string, string> = {};
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) return nameMap;

  for (const id of uniqueIds) {
    try {
      const user = await pb.collection('users').getOne<{ id: string; name: string }>(id);
      nameMap[id] = user.name;
    } catch (err) {
      console.error(`[Performance] Failed to fetch user ${id}:`, err);
    }
  }
  return nameMap;
}

function groupByUser(items: PerformanceRecord[], nameMap: Record<string, string>, grandTotal: number): UserPerformance[] {
  const grouped: Record<string, PerformanceRecord[]> = {};
  items.forEach((item) => {
    const userId = item.creator_user || 'unknown';
    if (!grouped[userId]) grouped[userId] = [];
    grouped[userId].push(item);
  });

  return Object.entries(grouped).map(([userId, contracts]) => {
    const totalAmount = contracts.reduce((sum, c) => sum + (c.total_amount || 0), 0);
    return {
      userId,
      userName: nameMap[userId] || '未知用户',
      contractCount: contracts.length,
      totalAmount,
      amountPercent: grandTotal > 0 ? (totalAmount / grandTotal) * 100 : 0,
      contracts: contracts.map(c => ({
        id: c.id,
        no: c.no,
        product_name: c.product_name,
        total_amount: c.total_amount,
        total_quantity: c.total_quantity,
        sign_date: c.sign_date,
      })),
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount);
}

async function resolveNames(items: PerformanceRecord[]): Promise<Record<string, string>> {
  const nameMap: Record<string, string> = {};
  items.forEach((item) => {
    if (item.creator_user && item.expand?.creator_user?.name) {
      nameMap[item.creator_user] = item.expand.creator_user.name;
    }
  });

  const missingIds = [...new Set(items.map(i => i.creator_user).filter(id => id && !nameMap[id]))];
  if (missingIds.length > 0) {
    const extraNames = await fetchUserNames(missingIds as string[]);
    Object.assign(nameMap, extraNames);
  }
  return nameMap;
}

export const PerformanceAPI = {
  getSalesPerformance: async (startDate?: string, endDate?: string): Promise<UserPerformance[]> => {
    const filters: string[] = [];
    if (startDate) filters.push(`created_at >= "${startDate}"`);
    if (endDate) filters.push(`created_at <= "${endDate}"`);

    const result = await pb.collection('sales_contracts').getList<PerformanceRecord>(1, 5000, {
      filter: filters.length > 0 ? filters.join(' && ') : undefined,
      expand: 'creator_user',
    });

    const nameMap = await resolveNames(result.items);
    const grandTotal = result.items.reduce((s, c) => s + (c.total_amount || 0), 0);
    return groupByUser(result.items, nameMap, grandTotal);
  },

  getPurchasePerformance: async (startDate?: string, endDate?: string): Promise<UserPerformance[]> => {
    const filters: string[] = [];
    if (startDate) filters.push(`created_at >= "${startDate}"`);
    if (endDate) filters.push(`created_at <= "${endDate}"`);

    const result = await pb.collection('purchase_contracts').getList<PerformanceRecord>(1, 5000, {
      filter: filters.length > 0 ? filters.join(' && ') : undefined,
      expand: 'creator_user',
    });

    const nameMap = await resolveNames(result.items);
    const grandTotal = result.items.reduce((s, c) => s + (c.total_amount || 0), 0);
    return groupByUser(result.items, nameMap, grandTotal);
  },
};
