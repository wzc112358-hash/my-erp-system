import { pb } from '@/lib/pocketbase';
import type {
  BidCollectionRun,
  BidNoticeListParams,
  BidNoticeListResult,
  BidSourceOption,
  LocalHelperPairingInvitation,
  SiteSearchScope,
} from '@/types/opportunity';
import type { BidPreparation, HistoricalBidMatch } from '@/types/bidding-record';

const agentBaseUrl = () => {
  const override = import.meta.env.VITE_BID_AGENT_URL;
  if (override) return String(override).replace(/\/+$/, '');
  return import.meta.env.DEV ? 'http://127.0.0.1:8097' : 'https://agent.henghuacheng.cn';
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = pb.authStore.token;
  if (!token) throw new Error('请重新登录 ERP');
  const response = await fetch(`${agentBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-ERP-Region': localStorage.getItem('erp_system') || 'beijing',
      ...(init.headers || {}),
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

  updateSourceSearchScope: async (sourceKey: string, searchScope: SiteSearchScope) => {
    const result = await request<{ item: BidSourceOption }>(
      `/api/bids/sources/${encodeURIComponent(sourceKey)}/search-scope`,
      { method: 'PUT', body: JSON.stringify({ searchScope }), headers: { 'Content-Type': 'application/json' } },
    );
    return result.item;
  },

  resetSourceSearchScope: async (sourceKey: string) => {
    const result = await request<{ item: BidSourceOption }>(
      `/api/bids/sources/${encodeURIComponent(sourceKey)}/search-scope`,
      { method: 'DELETE' },
    );
    return result.item;
  },

  createLocalHelperPairingCode: () => request<LocalHelperPairingInvitation>(
    '/api/bids/local-helper/pairing-code',
    { method: 'POST' },
  ),

  listHistory: async (noticeId: string) => {
    const result = await request<{ items: HistoricalBidMatch[] }>(
      `/api/bids/notices/${encodeURIComponent(noticeId)}/history`,
    );
    return result.items;
  },

  prepareBid: (noticeId: string) => request<BidPreparation>(
    `/api/bids/notices/${encodeURIComponent(noticeId)}/prepare`,
    { method: 'POST' },
  ),
};
