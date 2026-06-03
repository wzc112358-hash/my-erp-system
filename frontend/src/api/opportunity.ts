import { pb } from '@/lib/pocketbase';
import type {
  AgentTask,
  BidOpportunity,
  BidDocument,
  BidDocumentFormData,
  LocalHelperHealth,
  MonitorRun,
  MonitorSource,
  MonitorSourceFormData,
  OpportunityListParams,
  OpportunityReview,
  OpportunityReviewFormData,
  OpportunityStatus,
  ProductTerm,
  ProductTermFormData,
} from '@/types/opportunity';

const buildOpportunityFilters = (params: OpportunityListParams = {}) => {
  const filters: string[] = [];
  if (params.search) {
    const search = params.search.replaceAll('"', '\\"');
    filters.push(`(title ~ "${search}" || buyer_name ~ "${search}" || product_keywords ~ "${search}" || source_name ~ "${search}")`);
  }
  if (params.status) filters.push(`status = "${params.status}"`);
  if (params.relevance) filters.push(`relevance = "${params.relevance}"`);
  if (params.owner_name) filters.push(`owner_name = "${params.owner_name}"`);
  return filters.length > 0 ? filters.join(' && ') : undefined;
};

export const OpportunityAPI = {
  listSources: async () => {
    return pb.collection('monitor_sources').getList<MonitorSource>(1, 500, {
      sort: 'owner_name,source_name',
      expand: 'owner_user',
    });
  },

  createSource: async (data: MonitorSourceFormData) => {
    return pb.collection('monitor_sources').create<MonitorSource>({
      login_type: 'none',
      requires_login: false,
      may_have_captcha: false,
      status: 'active',
      schedule_times: '09:00,12:00,15:00,17:30',
      crawl_strategy: 'http_html',
      site_search_behavior: 'supplemental',
      ...data,
    });
  },

  updateSource: async (id: string, data: Partial<MonitorSourceFormData>) => {
    return pb.collection('monitor_sources').update<MonitorSource>(id, data);
  },

  listRuns: async () => {
    return pb.collection('monitor_runs').getList<MonitorRun>(1, 500, {
      sort: '-created',
      expand: 'source',
    });
  },

  listAgentTasks: async () => {
    return pb.collection('agent_tasks').getList<AgentTask>(1, 500, {
      sort: '-created',
      expand: 'source,monitor_run,opportunity,session',
    });
  },

  updateAgentTask: async (id: string, data: Partial<AgentTask>) => {
    return pb.collection('agent_tasks').update<AgentTask>(id, data);
  },

  listOpportunities: async (params: OpportunityListParams = {}) => {
    return pb.collection('bid_opportunities').getList<BidOpportunity>(
      params.page || 1,
      params.per_page || 50,
      {
        filter: buildOpportunityFilters(params),
        sort: '-created',
        expand: 'source,monitor_run,responsible_user',
      },
    );
  },

  getOpportunity: async (id: string) => {
    return pb.collection('bid_opportunities').getOne<BidOpportunity>(id, {
      expand: 'source,monitor_run,responsible_user',
    });
  },

  updateOpportunity: async (id: string, data: Partial<BidOpportunity>) => {
    return pb.collection('bid_opportunities').update<BidOpportunity>(id, data);
  },

  updateStatus: async (id: string, status: OpportunityStatus, comment?: string) => {
    const update: Partial<BidOpportunity> = { status };
    if (comment !== undefined) update.employee_assessment = comment;
    return pb.collection('bid_opportunities').update<BidOpportunity>(id, update);
  },

  createReview: async (data: OpportunityReviewFormData) => {
    return pb.collection('opportunity_reviews').create<OpportunityReview>({
      ...data,
      reviewer: pb.authStore.record?.id || undefined,
    });
  },

  listReviews: async (opportunityId: string) => {
    return pb.collection('opportunity_reviews').getList<OpportunityReview>(1, 100, {
      filter: `opportunity = "${opportunityId}"`,
      sort: '-created',
      expand: 'reviewer',
    });
  },

  listDocuments: async (opportunityId: string) => {
    return pb.collection('bid_documents').getList<BidDocument>(1, 100, {
      filter: `opportunity = "${opportunityId}"`,
      sort: '-created',
    });
  },

  createDocument: async (data: BidDocumentFormData) => {
    return pb.collection('bid_documents').create<BidDocument>({
      extraction_status: data.extracted_text ? 'pending' : 'empty',
      ...data,
    });
  },

  listProductTerms: async () => {
    return pb.collection('product_terms').getList<ProductTerm>(1, 500, {
      sort: 'term_type,term',
    });
  },

  createProductTerm: async (data: ProductTermFormData) => {
    return pb.collection('product_terms').create<ProductTerm>({
      status: 'active',
      weight: 0.7,
      ...data,
    });
  },

  updateProductTerm: async (id: string, data: Partial<ProductTermFormData>) => {
    return pb.collection('product_terms').update<ProductTerm>(id, data);
  },

  checkLocalHelper: async () => {
    const response = await fetch('http://127.0.0.1:17321/health', { signal: AbortSignal.timeout(1200) });
    if (!response.ok) throw new Error(`local helper ${response.status}`);
    return response.json() as Promise<LocalHelperHealth>;
  },

  startLocalHelperTask: async (task: AgentTask) => {
    window.location.href = `hcz-helper://task/${encodeURIComponent(task.id)}`;
    const response = await fetch(`http://127.0.0.1:17321/tasks/${encodeURIComponent(task.id)}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceName: task.source_name,
        entryUrl: task.entry_url,
        reason: task.reason,
      }),
    });
    if (!response.ok) throw new Error(`local helper task ${response.status}`);
    return response.json();
  },

  copyGroupSummary: async () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = await pb.collection('monitor_runs').getList<MonitorRun>(1, 20, {
      filter: `created >= "${today} 00:00:00"`,
      sort: '-created',
    });
    const latestWithSummary = result.items.find((item) => item.group_summary);
    if (latestWithSummary?.group_summary) return latestWithSummary.group_summary;

    const opportunities = await pb.collection('bid_opportunities').getList<BidOpportunity>(1, 500, {
      filter: `created >= "${today} 00:00:00"`,
    });
    const grouped = opportunities.items.reduce<Record<string, { related: number; urgent: number }>>((acc, item) => {
      const owner = item.owner_name || '未分配';
      acc[owner] ||= { related: 0, urgent: 0 };
      if (item.relevance === 'likely_related') {
        acc[owner].related += 1;
        if (item.urgency === 'urgent') acc[owner].urgent += 1;
      }
      return acc;
    }, {});
    const lines = ['今日招投标监测摘要：'];
    Object.entries(grouped).forEach(([owner, count]) => {
      lines.push(`${owner}：${count.related} 条疑似相关，${count.urgent} 条需 3 日内确认`);
    });
    if (Object.keys(grouped).length === 0) {
      lines.push('暂无新增疑似相关商机。');
    }
    lines.push('正式处理请进入 ERP 商机池。');
    return lines.join('\n');
  },
};
