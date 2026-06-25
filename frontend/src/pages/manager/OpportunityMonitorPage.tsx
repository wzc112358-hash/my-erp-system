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
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CopyOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { OpportunityAPI } from '@/api/opportunity';
import type {
  BidDocument,
  BidOpportunity,
  MonitorRun,
  OpportunityReviewDecision,
  OpportunityStatus,
} from '@/types/opportunity';
import { useAuthStore } from '@/stores/auth';

const { Title, Text } = Typography;
const { TextArea } = Input;

const statusMap: Record<string, { label: string; color: string }> = {
  pending_review: { label: '待判断', color: 'orange' },
  follow: { label: '可关注', color: 'green' },
  irrelevant: { label: '不相关', color: 'default' },
  needs_boss: { label: '需管理判断', color: 'purple' },
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

const documentStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待解析', color: 'orange' },
  parsed: { label: '已解析', color: 'green' },
  empty: { label: '无文本', color: 'default' },
  failed: { label: '解析失败', color: 'red' },
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
  { label: '需管理判断', value: 'needs_boss' },
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
  `来源：${opportunity.source_name}`,
  `采购单位：${opportunity.buyer_name || '-'}`,
  `截止日期：${fmtDate(opportunity.deadline_date)}`,
  `产品关键词：${opportunity.product_keywords || '-'}`,
  `Agent证据：${opportunity.evidence_text || opportunity.agent_summary || '-'}`,
  `硬性条件：${opportunity.hard_requirements || '-'}`,
  `风险点：${opportunity.risk_flags || '-'}`,
  `员工自评：${opportunity.employee_assessment || '-'}`,
  `管理意见：${decisionComment || opportunity.boss_decision || '-'}`,
  `建议动作：${opportunity.recommended_action || '同意后进入报价准备，由业务继续补充采购价格和报价资料'}`,
].join('\n');

const OpportunityMonitorPage: React.FC = () => {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const [opportunities, setOpportunities] = useState<BidOpportunity[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>();
  const [reviewing, setReviewing] = useState<BidOpportunity | null>(null);
  const [reviewMode, setReviewMode] = useState<'employee' | 'boss'>('employee');
  const [detail, setDetail] = useState<BidOpportunity | null>(null);
  const [documents, setDocuments] = useState<BidDocument[]>([]);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [reviewForm] = Form.useForm<{ decision: OpportunityReviewDecision; comment?: string }>();
  const [documentForm] = Form.useForm<{
    title: string;
    document_type?: string;
    url?: string;
    summary?: string;
    extracted_text?: string;
  }>();

  const isManager = user?.type === 'manager';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [opportunityRes, runRes] = await Promise.all([
        OpportunityAPI.listOpportunities({
          per_page: 500,
          search: search || undefined,
          status: statusFilter as OpportunityStatus | undefined,
        }),
        OpportunityAPI.listRuns(),
      ]);
      setOpportunities(opportunityRes.items);
      setRuns(newestFirst(runRes.items));
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

  const myPending = useMemo(() => {
    if (!user) return [];
    return opportunities.filter((item) => (
      item.status === 'pending_review' &&
      (item.responsible_user === user.id || item.owner_name === user.name || user.type === 'manager')
    ));
  }, [opportunities, user]);

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
      recommended_action: approvedForQuote ? '已同意继续，进入报价准备' : reviewing.recommended_action,
      quote_ready_at: approvedForQuote ? new Date().toISOString() : reviewing.quote_ready_at,
    });
    message.success('判断已保存');
    setReviewing(null);
    void fetchAll();
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
    { title: '网站', dataIndex: 'source_name', key: 'source_name', width: 120, ellipsis: true },
    { title: '采购单位', dataIndex: 'buyer_name', key: 'buyer_name', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    { title: '产品关键词', dataIndex: 'product_keywords', key: 'product_keywords', width: 150, render: (v: string) => v || '-' },
    { title: '相关性', dataIndex: 'relevance', key: 'relevance', width: 110, render: (v: string) => tag(relevanceMap, v) },
    { title: '分数', dataIndex: 'relevance_score', key: 'relevance_score', width: 80, render: fmtScore },
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
              决策
            </Button>
          )}
        </Space>
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
    { title: '网站', dataIndex: 'source_name', key: 'source_name', width: 160 },
    { title: '结果', dataIndex: 'status', key: 'status', width: 110, render: (v: string) => tag(statusMap, v) },
    { title: '新增', dataIndex: 'found_count', key: 'found_count', width: 80 },
    { title: '疑似相关', dataIndex: 'related_count', key: 'related_count', width: 90 },
    { title: '错误/说明', dataIndex: 'error_message', key: 'error_message', ellipsis: true, render: (v: string) => v || '-' },
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
        <Button icon={<ReloadOutlined />} onClick={() => void fetchAll()}>刷新</Button>
      </Space>
      <Button icon={<CopyOutlined />} onClick={copyGroupSummary}>复制群摘要</Button>
    </Flex>
  );

  return (
    <div style={{ padding: 24 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 4 }}>商机监测</Title>
          <Text type="secondary">云端仅保留国能网自动巡检；其他网站由本地助手独立采集。</Text>
        </div>
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
                  <Table rowKey="id" loading={loading} columns={opportunityColumns} dataSource={opportunities} scroll={{ x: 1120 }} />
                </>
              ),
            },
            {
              key: 'mine',
              label: `我的待判断(${myPending.length})`,
              children: <Table rowKey="id" loading={loading} columns={opportunityColumns} dataSource={myPending} scroll={{ x: 1120 }} />,
            },
            {
              key: 'runs',
              label: '每日巡检记录',
              children: <Table rowKey="id" loading={loading} columns={runColumns} dataSource={runs} />,
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
            <TextArea rows={4} placeholder="写明能否操作、缺哪些资料、需进一步确认的问题等" />
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
              <Descriptions.Item label="来源">{detail.source_name}</Descriptions.Item>
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
              <Descriptions.Item label="管理意见">{detail.boss_decision || '-'}</Descriptions.Item>
              <Descriptions.Item label="建议动作">{detail.recommended_action || '-'}</Descriptions.Item>
              <Descriptions.Item label="报价准备时间">{fmtDate(detail.quote_ready_at)}</Descriptions.Item>
              <Descriptions.Item label="确认包">
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
