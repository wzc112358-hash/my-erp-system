export type MonitorLoginType = 'none' | 'account' | 'manual';
export type MonitorSourceStatus = 'active' | 'paused' | 'manual_required';
export type MonitorCrawlStrategy = 'http_html' | 'http_json' | 'playwright_dom' | 'playwright_network' | 'manual_assist' | 'local_helper';
export type MonitorSiteSearchBehavior = 'none' | 'supplemental' | 'primary';
export type MonitorRunStatus = 'success' | 'failed' | 'no_new' | 'partial' | 'manual_required';
export type AgentTaskType = 'manual_assist' | 'local_helper' | 'document_upload' | 'captcha' | 'purchase_document';
export type AgentTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type AgentLoginSessionStatus = 'not_started' | 'login_required' | 'active' | 'expired' | 'failed' | 'revoked';
export type OpportunityRelevance = 'likely_related' | 'needs_manual_review' | 'irrelevant';
export type OpportunityStatus =
  | 'pending_review'
  | 'follow'
  | 'irrelevant'
  | 'needs_boss'
  | 'needs_documents'
  | 'expired'
  | 'converted';
export type OpportunityUrgency = 'normal' | 'soon' | 'urgent' | 'unknown';
export type OpportunityReviewDecision =
  | 'follow'
  | 'irrelevant'
  | 'needs_boss'
  | 'needs_documents'
  | 'expired'
  | 'approved'
  | 'rejected';

export interface MonitorSource {
  id: string;
  source_name: string;
  owner_name: string;
  owner_user?: string;
  source_url?: string;
  login_type: MonitorLoginType;
  requires_login: boolean;
  may_have_captcha: boolean;
  schedule_times?: string;
  category_names?: string;
  category_urls?: string;
  crawl_strategy?: MonitorCrawlStrategy;
  site_search_behavior?: MonitorSiteSearchBehavior;
  credential_ref?: string;
  manual_assist_reason?: string;
  keywords?: string;
  product_scope?: string;
  status: MonitorSourceStatus;
  last_run_at?: string;
  last_result?: string;
  remark?: string;
  created: string;
  updated: string;
  expand?: {
    owner_user?: { id: string; name: string; type?: string };
  };
}

export interface MonitorSourceFormData {
  source_name: string;
  owner_name: string;
  source_url?: string;
  login_type?: MonitorLoginType;
  requires_login?: boolean;
  may_have_captcha?: boolean;
  schedule_times?: string;
  category_names?: string;
  category_urls?: string;
  crawl_strategy?: MonitorCrawlStrategy;
  site_search_behavior?: MonitorSiteSearchBehavior;
  credential_ref?: string;
  manual_assist_reason?: string;
  keywords?: string;
  product_scope?: string;
  status?: MonitorSourceStatus;
  remark?: string;
}

export interface MonitorRun {
  id: string;
  source?: string;
  source_name: string;
  owner_name: string;
  run_at?: string;
  status: MonitorRunStatus;
  found_count: number;
  related_count: number;
  error_message?: string;
  group_summary?: string;
  created: string;
  updated: string;
  expand?: {
    source?: MonitorSource;
  };
}

export interface BidOpportunity {
  id: string;
  source?: string;
  monitor_run?: string;
  responsible_user?: string;
  source_name: string;
  owner_name: string;
  title: string;
  url?: string;
  fingerprint: string;
  publish_date?: string;
  deadline_date?: string;
  buyer_name?: string;
  product_keywords?: string;
  relevance: OpportunityRelevance;
  relevance_score?: number;
  matched_terms?: string;
  matched_sources?: string;
  evidence_text?: string;
  negative_terms?: string;
  classification_version?: string;
  needs_human_check?: boolean;
  status: OpportunityStatus;
  urgency: OpportunityUrgency;
  agent_summary?: string;
  hard_requirements?: string;
  risk_flags?: string;
  employee_assessment?: string;
  boss_decision?: string;
  confirmation_package?: string;
  recommended_action?: string;
  quote_ready_at?: string;
  group_summary?: string;
  attachment_urls?: string;
  raw_text?: string;
  created: string;
  updated: string;
  expand?: {
    source?: MonitorSource;
    monitor_run?: MonitorRun;
    responsible_user?: { id: string; name: string; type?: string };
  };
}

export interface OpportunityListParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: OpportunityStatus;
  relevance?: OpportunityRelevance;
  owner_name?: string;
}

export interface OpportunityReview {
  id: string;
  opportunity: string;
  reviewer?: string;
  review_type: 'employee' | 'boss';
  decision: OpportunityReviewDecision;
  comment?: string;
  created: string;
  updated: string;
  expand?: {
    reviewer?: { id: string; name: string };
  };
}

export interface OpportunityReviewFormData {
  opportunity: string;
  review_type: 'employee' | 'boss';
  decision: OpportunityReviewDecision;
  comment?: string;
}

export interface BidDocument {
  id: string;
  opportunity: string;
  title: string;
  url?: string;
  document_type?: string;
  summary?: string;
  extracted_text?: string;
  extraction_status?: 'pending' | 'parsed' | 'empty' | 'failed';
  evidence_text?: string;
  parse_summary?: string;
  created: string;
  updated: string;
}

export interface BidDocumentFormData {
  opportunity: string;
  title: string;
  url?: string;
  document_type?: string;
  summary?: string;
  extracted_text?: string;
  extraction_status?: BidDocument['extraction_status'];
  evidence_text?: string;
  parse_summary?: string;
}

export interface AgentTask {
  id: string;
  source?: string;
  monitor_run?: string;
  opportunity?: string;
  session?: string;
  source_name: string;
  owner_name: string;
  task_type: AgentTaskType;
  status: AgentTaskStatus;
  session_status?: AgentLoginSessionStatus;
  reason?: string;
  required_artifact?: string;
  entry_url?: string;
  action_steps?: string;
  search_terms?: string;
  browser_url?: string;
  due_at?: string;
  last_attempt_at?: string;
  result_summary?: string;
  uploaded_artifacts?: string;
  created: string;
  updated: string;
  expand?: {
    source?: MonitorSource;
    monitor_run?: MonitorRun;
    opportunity?: BidOpportunity;
    session?: AgentLoginSession;
  };
}

export interface AgentLoginSession {
  id: string;
  source?: string;
  source_name: string;
  owner_name: string;
  status: AgentLoginSessionStatus;
  login_url?: string;
  browser_url?: string;
  profile_ref?: string;
  expires_at?: string;
  last_verified_at?: string;
  last_error?: string;
  authorized_by?: string;
  security_note?: string;
  created: string;
  updated: string;
}

export interface ProductTerm {
  id: string;
  term: string;
  term_type: 'erp_history' | 'chat_history' | 'curated' | 'alias' | 'feedback_positive' | 'feedback_negative';
  source?: string;
  weight?: number;
  aliases?: string;
  status: 'active' | 'paused';
  created: string;
  updated: string;
}

export interface ProductTermFormData {
  term: string;
  term_type: ProductTerm['term_type'];
  source?: string;
  weight?: number;
  aliases?: string;
  status?: ProductTerm['status'];
}
