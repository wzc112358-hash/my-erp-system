import { pb } from '@/lib/pocketbase';
import type {
  BidCollectionRun,
  BidNoticeListParams,
  BidNoticeListResult,
  BidSourceOption,
} from '@/types/opportunity';

const agentBaseUrl = () => {
  const override = import.meta.env.VITE_BID_AGENT_URL;
  if (override) return String(override).replace(/\/+$/, '');
  return import.meta.env.DEV ? 'http://127.0.0.1:8097' : 'https://agent.henghuacheng.cn';
};

const request = async <T>(path: string): Promise<T> => {
  const token = pb.authStore.token;
  if (!token) throw new Error('请重新登录 ERP');
  const response = await fetch(`${agentBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-ERP-Region': localStorage.getItem('erp_system') || 'beijing',
    },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `招投标信息服务请求失败（${response.status}）`);
  return body;
};

export const OpportunityAPI = {
  listNotices: (params: BidNoticeListParams = {}) => {
    const query = new URLSearchParams({
      page: String(params.page || 1),
      perPage: String(params.perPage || 30),
    });
    if (params.kind) query.set('kind', params.kind);
    if (params.source) query.set('source', params.source);
    if (params.search) query.set('search', params.search);
    return request<BidNoticeListResult>(`/api/bids/notices?${query}`);
  },

  listRuns: async () => {
    const result = await request<{ items: BidCollectionRun[] }>('/api/bids/runs');
    return result.items;
  },

  listSources: async () => {
    const result = await request<{ items: BidSourceOption[] }>('/api/bids/sources');
    return result.items;
  },
};
