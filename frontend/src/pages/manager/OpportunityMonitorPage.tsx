import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CopyOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { OpportunityAPI } from '@/api/opportunity';
import type {
  AgentTask,
  BidDocument,
  BidOpportunity,
  MonitorRun,
  MonitorSource,
  MonitorSourceFormData,
  OpportunityReviewDecision,
  OpportunityStatus,
  LocalHelperHealth,
} from '@/types/opportunity';
import { useAuthStore } from '@/stores/auth';

const { Title, Text } = Typography;
const { TextArea } = Input;

const statusMap: Record<string, { label: string; color: string }> = {
  pending_review: { label: '待判断', color: 'orange' },
  follow: { label: '可关注', color: 'green' },
  irrelevant: { label: '不相关', color: 'default' },
  needs_boss: { label: '需王总判断', color: 'purple' },
  needs_documents: { label: '需补标书', color: 'blue' },
  expired: { label: '已错过截止', color: 'red' },
  converted: { label: '已转正式业务', color: 'cyan' },
  success: { label: '成功', color: 'green' },
  failed: { label: '失败', color: 'red' },
  no_new: { label: '无新增', color: 'default' },
  partial: { label: '部分成功', color: 'orange' },
  manual_required: { label: '需人工处理', color: 'purple' },
};

const relevanceMap: Record<string, { label: string; color: string }> = {
  likely_related: { label: '疑似相关', color: 'green' },
  needs_manual_review: { label: '需人工判断', color: 'orange' },
  irrelevant: { label: '不相关', color: 'default' },
};

const urgencyMap: Record<string, { label: string; color: string }> = {
  urgent: { label: '3日内截止', color: 'red' },
  soon: { label: '临近截止', color: 'orange' },
  normal: { label: '正常', color: 'green' },
  unknown: { label: '未知', color: 'default' },
};

const crawlStrategyMap: Record<string, { label: string; color: string }> = {
  http_html: { label: 'HTML', color: 'green' },
  http_json: { label: 'API', color: 'cyan' },
  playwright_dom: { label: '浏览器DOM', color: 'blue' },
  playwright_network: { label: '浏览器网络', color: 'purple' },
  manual_assist: { label: '人工协助', color: 'orange' },
  local_helper: { label: '本地助手', color: 'magenta' },
};

const searchBehaviorMap: Record<string, { label: string; color: string }> = {
  none: { label: '不用站内搜索', color: 'default' },
  supplemental: { label: '搜索作补充', color: 'blue' },
  primary: { label: '搜索为主', color: 'purple' },
};

const documentStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待解析', color: 'orange' },
  parsed: { label: '已解析', color: 'green' },
  empty: { label: '无文本', color: 'default' },
  failed: { label: '解析失败', color: 'red' },
};

const agentTaskTypeMap: Record<string, { label: string; color: string }> = {
  manual_assist: { label: '人工协助', color: 'orange' },
  local_helper: { label: '本地助手', color: 'magenta' },
  document_upload: { label: '补资料', color: 'blue' },
  captcha: { label: '验证码', color: 'red' },
  purchase_document: { label: '买标书', color: 'purple' },
};

const agentTaskStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'orange' },
  in_progress: { label: '处理中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
  cancelled: { label: '已取消', color: 'default' },
};

const loginSessionStatusMap: Record<string, { label: string; color: string }> = {
  not_started: { label: '未开始', color: 'default' },
  login_required: { label: '需登录', color: 'orange' },
  active: { label: '已登录', color: 'green' },
  expired: { label: '已过期', color: 'red' },
  failed: { label: '失败', color: 'red' },
  revoked: { label: '已撤销', color: 'default' },
};

const fmtDate = (value?: string) => value?.split(' ')[0] || '-';
const fmtScore = (value?: number) => typeof value === 'number' ? value.toFixed(2) : '-';
const newestFirst = <T extends { created?: string }>(items: T[]) => (
  [...items].sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')))
);
const tag = (map: Record<string, { label: string; color: string }>, value?: string) => {
  const item = value ? map[value] : undefined;
  return item ? <Tag color={item.color}>{item.label}</Tag> : '-';
};

const OPPORTUNITY_DECISIONS: Array<{ label: string; value: OpportunityReviewDecision }> = [
  { label: '可关注', value: 'follow' },
  { label: '不相关', value: 'irrelevant' },
  { label: '需王总判断', value: 'needs_boss' },
  { label: '需补标书', value: 'needs_documents' },
  { label: '已错过截止', value: 'expired' },
];

const BOSS_DECISIONS: Array<{ label: string; value: OpportunityReviewDecision }> = [
  { label: '同意继续', value: 'approved' },
  { label: '不同意做', value: 'rejected' },
  { label: '需补资料', value: 'needs_documents' },
];

const decisionToStatus = (decision: OpportunityReviewDecision): OpportunityStatus => {
  if (decision === 'approved') return 'converted';
  if (decision === 'rejected') return 'irrelevant';
  return decision as OpportunityStatus;
};

const buildConfirmationPackageText = (opportunity: BidOpportunity, decisionComment?: string) => [
  `商机：${opportunity.title}`,
  `来源：${opportunity.source_name} / ${opportunity.owner_name}`,
  `采购单位：${opportunity.buyer_name || '-'}`,
  `截止日期：${fmtDate(opportunity.deadline_date)}`,
  `产品关键词：${opportunity.product_keywords || '-'}`,
  `Agent证据：${opportunity.evidence_text || opportunity.agent_summary || '-'}`,
  `硬性条件：${opportunity.hard_requirements || '-'}`,
  `风险点：${opportunity.risk_flags || '-'}`,
  `员工自评：${opportunity.employee_assessment || '-'}`,
  `王总意见：${decisionComment || opportunity.boss_decision || '-'}`,
  `建议动作：${opportunity.recommended_action || '同意后进入报价准备，由业务继续补充采购价格和报价资料'}`,
].join('\n');

const OpportunityMonitorPage: React.FC = () => {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const [opportunities, setOpportunities] = useState<BidOpportunity[]>([]);
  const [sources, setSources] = useState<MonitorSource[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>();
  const [reviewing, setReviewing] = useState<BidOpportunity | null>(null);
  const [reviewMode, setReviewMode] = useState<'employee' | 'boss'>('employee');
  const [sourceEditing, setSourceEditing] = useState<MonitorSource | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [detail, setDetail] = useState<BidOpportunity | null>(null);
  const [documents, setDocuments] = useState<BidDocument[]>([]);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [localHelperHealth, setLocalHelperHealth] = useState<LocalHelperHealth | null>(null);
  const [localHelperChecking, setLocalHelperChecking] = useState(false);
  const [reviewForm] = Form.useForm<{ decision: OpportunityReviewDecision; comment?: string }>();
  const [sourceForm] = Form.useForm<MonitorSourceFormData>();
  const [documentForm] = Form.useForm<{
    title: string;
    document_type?: string;
    url?: string;
    summary?: string;
    extracted_text?: string;
  }>();

  const isManager = user?.type === 'manager';

  const fetchAll = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    try {
      const [opportunityRes, sourceRes, runRes, taskRes] = await Promise.all([
        OpportunityAPI.listOpportunities({
          per_page: 500,
          search: search || undefined,
          status: statusFilter as OpportunityStatus | undefined,
        }),
        OpportunityAPI.listSources(),
        OpportunityAPI.listRuns(),
        OpportunityAPI.listAgentTasks(),
      ]);
      setOpportunities(opportunityRes.items);
      setSources(sourceRes.items);
      setRuns(newestFirst(runRes.items));
      setAgentTasks(newestFirst(taskRes.items));
    } catch (error) {
      console.error('Fetch opportunities error:', error);
      message.error('加载商机监测数据失败');
    } finally {
      setLoading(false);
    }
  }, [message, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAll();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAll]);

  const checkLocalHelper = useCallback(async () => {
    setLocalHelperChecking(true);
    try {
      const health = await OpportunityAPI.checkLocalHelper();
      setLocalHelperHealth(health);
    } catch {
      setLocalHelperHealth(null);
    } finally {
      setLocalHelperChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkLocalHelper();
  }, [checkLocalHelper]);

  const myPending = useMemo(() => {
    if (!user) return [];
    return opportunities.filter((item) => (
      item.status === 'pending_review' &&
      (item.responsible_user === user.id || item.owner_name === user.name || user.type === 'manager')
    ));
  }, [opportunities, user]);

  const bossQueue = useMemo(() => opportunities.filter((item) => item.status === 'needs_boss' || item.status === 'follow'), [opportunities]);

  const pendingAgentTasks = useMemo(() => agentTasks.filter((item) => ['pending', 'in_progress'].includes(item.status)), [agentTasks]);

  const openDetail = async (record: BidOpportunity) => {
    setDetail(record);
    try {
      const result = await OpportunityAPI.listDocuments(record.id);
      setDocuments(result.items);
    } catch (error) {
      console.error('Fetch bid documents error:', error);
      setDocuments([]);
    }
  };

  const openReview = (record: BidOpportunity, boss = false) => {
    setReviewing(record);
    setReviewMode(boss ? 'boss' : 'employee');
    reviewForm.setFieldsValue({
      decision: boss ? 'approved' : 'follow',
      comment: boss ? record.boss_decision : record.employee_assessment,
    });
  };

  const submitReview = async () => {
    if (!reviewing) return;
    const values = await reviewForm.validateFields();
    const reviewType = reviewMode;
    const status = decisionToStatus(values.decision);
    await OpportunityAPI.createReview({
      opportunity: reviewing.id,
      review_type: reviewType,
      decision: values.decision,
      comment: values.comment,
    });
    const approvedForQuote = reviewType === 'boss' && values.decision === 'approved';
    await OpportunityAPI.updateOpportunity(reviewing.id, {
      status,
      employee_assessment: reviewType === 'employee' ? values.comment : reviewing.employee_assessment,
      boss_decision: reviewType === 'boss' ? values.comment : reviewing.boss_decision,
      confirmation_package: approvedForQuote ? buildConfirmationPackageText(reviewing, values.comment) : reviewing.confirmation_package,
      recommended_action: approvedForQuote ? '王总已同意继续，进入报价准备' : reviewing.recommended_action,
      quote_ready_at: approvedForQuote ? new Date().toISOString() : reviewing.quote_ready_at,
    });
    message.success('判断已保存');
    setReviewing(null);
    fetchAll();
  };

  const openSourceModal = (source?: MonitorSource) => {
    setSourceEditing(source || null);
    if (source) {
      sourceForm.setFieldsValue(source);
    } else {
      sourceForm.setFieldsValue({
        login_type: 'none',
        requires_login: false,
        may_have_captcha: false,
        schedule_times: '09:00,12:00,15:00,17:30',
        status: 'active',
        crawl_strategy: 'http_html',
        site_search_behavior: 'supplemental',
      });
    }
    setSourceModalOpen(true);
  };

  const submitSource = async () => {
    const values = await sourceForm.validateFields();
    if (sourceEditing) {
      await OpportunityAPI.updateSource(sourceEditing.id, values);
      message.success('监测源已更新');
    } else {
      await OpportunityAPI.createSource(values);
      message.success('监测源已创建');
    }
    setSourceModalOpen(false);
    fetchAll();
  };

  const copyGroupSummary = async () => {
    const summary = await OpportunityAPI.copyGroupSummary();
    await navigator.clipboard.writeText(summary);
    message.success('群摘要已复制');
  };

  const openDocumentModal = () => {
    if (!detail) return;
    documentForm.setFieldsValue({
      title: `${detail.title} - 人工补充资料`,
      document_type: 'manual_text',
    });
    setDocumentModalOpen(true);
  };

  const submitDocument = async () => {
    if (!detail) return;
    const values = await documentForm.validateFields();
    await OpportunityAPI.createDocument({
      opportunity: detail.id,
      title: values.title,
      document_type: values.document_type,
      url: values.url,
      summary: values.summary,
      extracted_text: values.extracted_text,
      extraction_status: values.extracted_text ? 'pending' : 'empty',
      parse_summary: values.extracted_text ? '待 Agent 解析' : '未提供可解析文本',
    });
    const result = await OpportunityAPI.listDocuments(detail.id);
    setDocuments(result.items);
    setDocumentModalOpen(false);
    message.success('补充资料已保存');
  };

  const updateAgentTaskStatus = async (task: AgentTask, status: AgentTask['status']) => {
    await OpportunityAPI.updateAgentTask(task.id, {
      status,
      result_summary: status === 'completed' ? '员工已完成处理，等待 Agent 读取补充资料。' : task.result_summary,
    });
    message.success('任务状态已更新');
    fetchAll();
  };

  const startLocalHelperTask = async (task: AgentTask) => {
    try {
      await OpportunityAPI.startLocalHelperTask(task);
      await OpportunityAPI.updateAgentTask(task.id, {
        status: 'in_progress',
        result_summary: '已交给本地助手处理。',
      });
      message.success('已启动本地助手任务');
      fetchAll();
    } catch (error) {
      console.error('Start local helper task error:', error);
      message.warning('未检测到本地助手，请先安装并启动');
      setLocalHelperHealth(null);
    }
  };

  const opportunityColumns: ColumnsType<BidOpportunity> = [
    {
      title: '商机标题',
      dataIndex: 'title',
      key: 'title',
      width: 260,
      ellipsis: true,
      render: (value: string, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(record)}>
          {value}
        </Button>
      ),
    },
    { title: '网站', dataIndex: 'source_name', key: 'source_name', width: 150, ellipsis: true },
    { title: '负责人', dataIndex: 'owner_name', key: 'owner_name', width: 80 },
    { title: '采购单位', dataIndex: 'buyer_name', key: 'buyer_name', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    { title: '产品关键词', dataIndex: 'product_keywords', key: 'product_keywords', width: 150, render: (v: string) => v || '-' },
    { title: '相关性', dataIndex: 'relevance', key: 'relevance', width: 110, render: (v: string) => tag(relevanceMap, v) },
    { title: '分数', dataIndex: 'relevance_score', key: 'relevance_score', width: 80, render: fmtScore },
    { title: '匹配来源', dataIndex: 'matched_sources', key: 'matched_sources', width: 120, ellipsis: true, render: (v: string) => v || '-' },
    { title: '截止', dataIndex: 'deadline_date', key: 'deadline_date', width: 105, render: fmtDate },
    { title: '紧急度', dataIndex: 'urgency', key: 'urgency', width: 110, render: (v: string) => tag(urgencyMap, v) },
    { title: '状态', dataIndex: 'status', key: 'status', width: 120, render: (v: string) => tag(statusMap, v) },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.url && (
            <Button type="text" icon={<LinkOutlined />} href={record.url} target="_blank" />
          )}
            <Button type="text" icon={<CheckCircleOutlined />} onClick={() => openReview(record)}>
              判断
            </Button>
            {isManager && (record.status === 'needs_boss' || record.status === 'follow') && (
              <Button type="text" icon={<ExclamationCircleOutlined />} onClick={() => openReview(record, true)}>
                王总
              </Button>
            )}
        </Space>
      ),
    },
  ];

  const sourceColumns: ColumnsType<MonitorSource> = [
    { title: '网站', dataIndex: 'source_name', key: 'source_name', width: 180 },
    { title: '负责人', dataIndex: 'owner_name', key: 'owner_name', width: 90 },
    { title: '登录', dataIndex: 'login_type', key: 'login_type', width: 90 },
    { title: '采集策略', dataIndex: 'crawl_strategy', key: 'crawl_strategy', width: 120, render: (v: string) => tag(crawlStrategyMap, v) },
    { title: '站内搜索', dataIndex: 'site_search_behavior', key: 'site_search_behavior', width: 120, render: (v: string) => tag(searchBehaviorMap, v) },
    { title: '验证码', dataIndex: 'may_have_captcha', key: 'may_have_captcha', width: 90, render: (v: boolean) => v ? <Tag color="orange">可能</Tag> : '-' },
    { title: '巡检时间', dataIndex: 'schedule_times', key: 'schedule_times', width: 160 },
    { title: '关键词', dataIndex: 'keywords', key: 'keywords', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 110, render: (v: string) => tag(statusMap, v) },
    { title: '最近结果', dataIndex: 'last_result', key: 'last_result', width: 160, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, record) => (
        isManager ? <Button type="text" icon={<EditOutlined />} onClick={() => openSourceModal(record)} /> : null
      ),
    },
  ];

  const runColumns: ColumnsType<MonitorRun> = [
    {
      title: '巡检时间',
      dataIndex: 'created',
      key: 'created',
      width: 160,
      defaultSortOrder: 'descend',
      sorter: (a, b) => String(a.created || '').localeCompare(String(b.created || '')),
    },
    { title: '网站', dataIndex: 'source_name', key: 'source_name', width: 180 },
    { title: '负责人', dataIndex: 'owner_name', key: 'owner_name', width: 90 },
    { title: '结果', dataIndex: 'status', key: 'status', width: 110, render: (v: string) => tag(statusMap, v) },
    { title: '新增', dataIndex: 'found_count', key: 'found_count', width: 80 },
    { title: '疑似相关', dataIndex: 'related_count', key: 'related_count', width: 90 },
    { title: '错误/说明', dataIndex: 'error_message', key: 'error_message', ellipsis: true, render: (v: string) => v || '-' },
  ];

  const agentTaskColumns: ColumnsType<AgentTask> = [
    {
      title: '生成时间',
      dataIndex: 'created',
      key: 'created',
      width: 160,
      defaultSortOrder: 'descend',
      sorter: (a, b) => String(a.created || '').localeCompare(String(b.created || '')),
    },
    { title: '网站', dataIndex: 'source_name', key: 'source_name', width: 180, ellipsis: true },
    { title: '负责人', dataIndex: 'owner_name', key: 'owner_name', width: 90 },
    { title: '类型', dataIndex: 'task_type', key: 'task_type', width: 110, render: (v: string) => tag(agentTaskTypeMap, v) },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => tag(agentTaskStatusMap, v) },
    {
      title: '登录态',
      key: 'session_status',
      width: 100,
      render: (_, record) => tag(loginSessionStatusMap, record.expand?.session?.status || record.session_status),
    },
    { title: '搜索词', dataIndex: 'search_terms', key: 'search_terms', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作步骤',
      dataIndex: 'action_steps',
      key: 'action_steps',
      width: 320,
      render: (v: string) => v ? (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.45 }}>{v}</pre>
      ) : '-',
    },
    { title: '原因', dataIndex: 'reason', key: 'reason', width: 220, ellipsis: true, render: (v: string) => v || '-' },
    { title: '需要材料', dataIndex: 'required_artifact', key: 'required_artifact', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    { title: '截止', dataIndex: 'due_at', key: 'due_at', width: 150, render: fmtDate },
    {
      title: '入口',
      dataIndex: 'entry_url',
      key: 'entry_url',
      width: 80,
      render: (v: string) => v ? <Button type="text" icon={<LinkOutlined />} href={v} target="_blank" /> : '-',
    },
    {
      title: '远程浏览器',
      key: 'browser_url',
      width: 110,
      render: (_, record) => {
        const url = record.expand?.session?.browser_url || record.browser_url;
        return url ? <Button type="text" icon={<LinkOutlined />} href={url} target="_blank" /> : <Tag>待创建</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 210,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.task_type === 'local_helper' && (
            <Button type="text" icon={<ApiOutlined />} onClick={() => startLocalHelperTask(record)}>
              本地
            </Button>
          )}
          {record.status !== 'completed' && (
            <Button type="text" onClick={() => updateAgentTaskStatus(record, 'completed')}>完成</Button>
          )}
          {record.status !== 'failed' && (
            <Button type="text" danger onClick={() => updateAgentTaskStatus(record, 'failed')}>失败</Button>
          )}
        </Space>
      ),
    },
  ];

  const toolbar = (
    <Flex gap="small" wrap="wrap" justify="space-between" style={{ marginBottom: 16 }}>
      <Space wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索标题、产品、采购单位"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          allowClear
          placeholder="状态"
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 150 }}
          options={Object.entries(statusMap).filter(([key]) => ['pending_review', 'follow', 'needs_boss', 'needs_documents', 'expired', 'irrelevant'].includes(key)).map(([value, item]) => ({
            value,
            label: item.label,
          }))}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchAll}>刷新</Button>
      </Space>
      <Button icon={<CopyOutlined />} onClick={copyGroupSummary}>复制群摘要</Button>
    </Flex>
  );

  return (
    <div style={{ padding: 24 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 4 }}>商机监测</Title>
          <Text type="secondary">自动巡检招投标网站，员工在 ERP 判断，群里只发摘要。</Text>
        </div>
        <Space>
          <Tag color={localHelperHealth?.ok ? 'green' : 'default'}>
            本地助手{localHelperHealth?.ok ? '在线' : '离线'}
          </Tag>
          <Button loading={localHelperChecking} onClick={checkLocalHelper}>检测助手</Button>
          {!localHelperHealth?.ok && <Button href="/downloads/hcz-local-helper-app.zip" target="_blank">下载本地助手</Button>}
          {isManager && <Button type="primary" onClick={() => openSourceModal()}>新增监测源</Button>}
        </Space>
      </Flex>

      <Card>
        <Tabs
          items={[
            {
              key: 'pool',
              label: '商机池',
              children: (
                <>
                  {toolbar}
                  <Table rowKey="id" loading={loading} columns={opportunityColumns} dataSource={opportunities} scroll={{ x: 1300 }} />
                </>
              ),
            },
            {
              key: 'mine',
              label: `我的待判断(${myPending.length})`,
              children: <Table rowKey="id" loading={loading} columns={opportunityColumns} dataSource={myPending} scroll={{ x: 1300 }} />,
            },
            {
              key: 'boss',
              label: '王总确认台',
              children: <Table rowKey="id" loading={loading} columns={opportunityColumns} dataSource={bossQueue} scroll={{ x: 1300 }} />,
            },
            {
              key: 'runs',
              label: '每日巡检记录',
              children: <Table rowKey="id" loading={loading} columns={runColumns} dataSource={runs} />,
            },
            {
              key: 'tasks',
              label: `人工协助(${pendingAgentTasks.length})`,
              children: <Table rowKey="id" loading={loading} columns={agentTaskColumns} dataSource={agentTasks} scroll={{ x: 1700 }} />,
            },
            {
              key: 'sources',
              label: '监测源管理',
              children: <Table rowKey="id" loading={loading} columns={sourceColumns} dataSource={sources} scroll={{ x: 1350 }} />,
            },
          ]}
        />
      </Card>

      <Modal
        title={reviewing ? `判断商机：${reviewing.title}` : '判断商机'}
        open={!!reviewing}
        onCancel={() => setReviewing(null)}
        onOk={submitReview}
        okText="保存"
      >
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="decision" label="判断结果" rules={[{ required: true, message: '请选择判断结果' }]}>
            <Select options={(reviewMode === 'boss' ? BOSS_DECISIONS : OPPORTUNITY_DECISIONS).map((item) => ({ ...item }))} />
          </Form.Item>
          <Form.Item name="comment" label="判断说明">
            <TextArea rows={4} placeholder="写明能否操作、缺哪些资料、需王总确认的问题等" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={sourceEditing ? '编辑监测源' : '新增监测源'}
        open={sourceModalOpen}
        onCancel={() => setSourceModalOpen(false)}
        onOk={submitSource}
        okText="保存"
        width={720}
      >
        <Form form={sourceForm} layout="vertical">
          <Flex gap={12}>
            <Form.Item name="source_name" label="网站名称" rules={[{ required: true, message: '请输入网站名称' }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="owner_name" label="负责人" rules={[{ required: true, message: '请输入负责人' }]} style={{ width: 160 }}>
              <Input placeholder="如：小白" />
            </Form.Item>
          </Flex>
          <Form.Item name="source_url" label="入口网址">
            <Input placeholder="https://..." />
          </Form.Item>
          <Flex gap={12} wrap="wrap">
            <Form.Item name="login_type" label="登录方式" style={{ width: 160 }}>
              <Select options={[
                { label: '无需登录', value: 'none' },
                { label: '账号密码', value: 'account' },
                { label: '人工处理', value: 'manual' },
              ]} />
            </Form.Item>
            <Form.Item name="requires_login" label="需要登录" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="may_have_captcha" label="可能有验证码" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="status" label="状态" style={{ width: 150 }}>
              <Select options={[
                { label: '启用', value: 'active' },
                { label: '暂停', value: 'paused' },
                { label: '需人工处理', value: 'manual_required' },
              ]} />
            </Form.Item>
          </Flex>
          <Form.Item name="schedule_times" label="每日巡检时间">
            <Input placeholder="09:00,12:00,15:00,17:30" />
          </Form.Item>
          <Flex gap={12}>
            <Form.Item name="crawl_strategy" label="采集策略" style={{ width: 200 }}>
              <Select options={[
                { label: 'HTTP/HTML', value: 'http_html' },
                { label: 'HTTP/API JSON', value: 'http_json' },
                { label: '浏览器 DOM', value: 'playwright_dom' },
                { label: '浏览器网络', value: 'playwright_network' },
                { label: '人工协助', value: 'manual_assist' },
                { label: '本地助手', value: 'local_helper' },
              ]} />
            </Form.Item>
            <Form.Item name="site_search_behavior" label="站内搜索方式" style={{ width: 200 }}>
              <Select options={[
                { label: '不用站内搜索', value: 'none' },
                { label: '搜索作补充', value: 'supplemental' },
                { label: '搜索为主', value: 'primary' },
              ]} />
            </Form.Item>
            <Form.Item name="credential_ref" label="凭据引用" style={{ flex: 1 }}>
              <Input placeholder="如：secret:yipaike:xiaofeng" />
            </Form.Item>
          </Flex>
          <Form.Item name="category_names" label="监测栏目">
            <TextArea rows={2} placeholder="招标公告、采购公告、询价公告..." />
          </Form.Item>
          <Form.Item name="category_urls" label="栏目 URL">
            <TextArea rows={2} placeholder="多个 URL 可用逗号或换行分隔" />
          </Form.Item>
          <Form.Item name="keywords" label="关键词">
            <TextArea rows={2} placeholder="缓蚀剂、阻垢剂、聚丙烯酰胺..." />
          </Form.Item>
          <Form.Item name="manual_assist_reason" label="人工协助原因">
            <TextArea rows={2} placeholder="登录、验证码、买标书、附件下载等原因" />
          </Form.Item>
          <Form.Item name="product_scope" label="产品范围">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="商机详情"
        open={!!detail}
        onCancel={() => {
          setDetail(null);
          setDocuments([]);
        }}
        footer={null}
        width={820}
      >
        {detail && (
          <>
            <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
              <Text type="secondary">补充公告正文、标书文字或截图 OCR 文本后，Agent 可继续提取硬性条件。</Text>
              <Button type="primary" onClick={openDocumentModal}>补充资料</Button>
            </Flex>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="标题">{detail.title}</Descriptions.Item>
              <Descriptions.Item label="来源">{detail.source_name} / {detail.owner_name}</Descriptions.Item>
              <Descriptions.Item label="采购单位">{detail.buyer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="发布时间">{fmtDate(detail.publish_date)}</Descriptions.Item>
              <Descriptions.Item label="截止日期">{fmtDate(detail.deadline_date)}</Descriptions.Item>
              <Descriptions.Item label="产品关键词">{detail.product_keywords || '-'}</Descriptions.Item>
              <Descriptions.Item label="相关性">{tag(relevanceMap, detail.relevance)}</Descriptions.Item>
              <Descriptions.Item label="相关性分数">{fmtScore(detail.relevance_score)}</Descriptions.Item>
              <Descriptions.Item label="匹配词">{detail.matched_terms || '-'}</Descriptions.Item>
              <Descriptions.Item label="匹配来源">{detail.matched_sources || '-'}</Descriptions.Item>
              <Descriptions.Item label="证据文本">{detail.evidence_text || '-'}</Descriptions.Item>
              <Descriptions.Item label="负向词">{detail.negative_terms || '-'}</Descriptions.Item>
              <Descriptions.Item label="需人工确认">{detail.needs_human_check ? <Tag color="orange">是</Tag> : <Tag color="green">否</Tag>}</Descriptions.Item>
              <Descriptions.Item label="分类版本">{detail.classification_version || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{tag(statusMap, detail.status)}</Descriptions.Item>
              <Descriptions.Item label="Agent 摘要">{detail.agent_summary || '-'}</Descriptions.Item>
              <Descriptions.Item label="硬性条件">{detail.hard_requirements || '-'}</Descriptions.Item>
              <Descriptions.Item label="风险标记">{detail.risk_flags || '-'}</Descriptions.Item>
              <Descriptions.Item label="员工自评">{detail.employee_assessment || '-'}</Descriptions.Item>
              <Descriptions.Item label="王总意见">{detail.boss_decision || '-'}</Descriptions.Item>
              <Descriptions.Item label="建议动作">{detail.recommended_action || '-'}</Descriptions.Item>
              <Descriptions.Item label="报价准备时间">{fmtDate(detail.quote_ready_at)}</Descriptions.Item>
              <Descriptions.Item label="王总确认包">
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{detail.confirmation_package || buildConfirmationPackageText(detail)}</pre>
              </Descriptions.Item>
              <Descriptions.Item label="链接">
                {detail.url ? <a href={detail.url} target="_blank" rel="noreferrer">{detail.url}</a> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="原文">{detail.raw_text || '-'}</Descriptions.Item>
            </Descriptions>
            <Title level={5} style={{ marginTop: 16 }}>补充资料</Title>
            {documents.length === 0 ? (
              <Text type="secondary">暂无补充资料</Text>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {documents.map((doc) => (
                  <Card key={doc.id} size="small">
                    <Flex justify="space-between" gap={12}>
                      <Space direction="vertical" size={2}>
                        <Text strong>{doc.title}</Text>
                        <Text type="secondary">{doc.summary || doc.parse_summary || '-'}</Text>
                      </Space>
                      {tag(documentStatusMap, doc.extraction_status)}
                    </Flex>
                    {doc.evidence_text && <Text>{doc.evidence_text}</Text>}
                  </Card>
                ))}
              </Space>
            )}
          </>
        )}
      </Modal>

      <Modal
        title="补充公告/标书文本"
        open={documentModalOpen}
        onCancel={() => setDocumentModalOpen(false)}
        onOk={submitDocument}
        okText="保存"
        width={720}
      >
        <Form form={documentForm} layout="vertical">
          <Form.Item name="title" label="资料标题" rules={[{ required: true, message: '请输入资料标题' }]}>
            <Input />
          </Form.Item>
          <Flex gap={12}>
            <Form.Item name="document_type" label="资料类型" style={{ width: 180 }}>
              <Select options={[
                { label: '复制正文', value: 'manual_text' },
                { label: '公告详情', value: 'notice_detail' },
                { label: '标书/附件', value: 'tender_document' },
                { label: '截图 OCR', value: 'screenshot_ocr' },
              ]} />
            </Form.Item>
            <Form.Item name="url" label="资料链接" style={{ flex: 1 }}>
              <Input placeholder="可选，原始公告或附件链接" />
            </Form.Item>
          </Flex>
          <Form.Item name="summary" label="人工说明">
            <TextArea rows={2} placeholder="例如：需要登录后下载标书，先复制了公告正文" />
          </Form.Item>
          <Form.Item name="extracted_text" label="公告/标书文本">
            <TextArea rows={8} placeholder="粘贴公告正文、标书关键页文字或截图 OCR 文本" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OpportunityMonitorPage;
