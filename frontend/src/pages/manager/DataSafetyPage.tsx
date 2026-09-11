import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Input, Modal, Popconfirm, Segmented, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  HistoryOutlined,
  LinkOutlined,
  RedoOutlined,
  SafetyCertificateOutlined,
  ShoppingCartOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { RecycleBinAPI } from '@/api/recycle-bin';
import type { OperationLog, OperationLogFilters, RecycleBinItem, RecycleCollection } from '@/api/recycle-bin';
import { getPbErrorMessage } from '@/api/helpers';
import './DataSafetyPage.css';

const { Text, Title } = Typography;

type LogScope = NonNullable<OperationLogFilters['contractType']>;

const collectionLabels: Record<string, string> = {
  sales_contracts: '销售合同', purchase_contracts: '采购合同',
  sales_shipments: '销售发货', sale_invoices: '销售开票', sale_receipts: '销售收款',
  purchase_arrivals: '采购到货', purchase_invoices: '采购收票', purchase_payments: '采购付款',
};

const operationLabels: Record<string, string> = {
  create_record: '创建成功', create_failed: '创建失败',
  update_record: '修改成功', update_failed: '修改失败',
  confirm_record: '管理确认', reject_record: '管理驳回',
  soft_delete: '移入回收站', restore_record: '恢复记录',
  merge: '合并合同（旧）', link: '关联合同', unlink: '解除关联',
  unlink_delete: '删除合同（旧）', delete_record: '删除记录（旧）',
};

const scopeMeta: Record<LogScope, { title: string; description: string }> = {
  sales: { title: '销售业务日志', description: '销售合同、发货、开票和收款的完整操作轨迹' },
  purchase: { title: '采购业务日志', description: '采购合同、到货、收票和付款的完整操作轨迹' },
  sales_purchase: { title: '合同关联日志', description: '销售与采购合同的关联、解除关联等操作轨迹' },
};

const collectionOptions: Record<'sales' | 'purchase', { label: string; value: RecycleCollection | 'all' }[]> = {
  sales: [
    { label: '全部', value: 'all' },
    { label: '合同', value: 'sales_contracts' },
    { label: '发货', value: 'sales_shipments' },
    { label: '开票', value: 'sale_invoices' },
    { label: '收款', value: 'sale_receipts' },
  ],
  purchase: [
    { label: '全部', value: 'all' },
    { label: '合同', value: 'purchase_contracts' },
    { label: '到货', value: 'purchase_arrivals' },
    { label: '收票', value: 'purchase_invoices' },
    { label: '付款', value: 'purchase_payments' },
  ],
};

const standardOperationOptions = [
  { label: '全部操作', value: 'all' },
  { label: '创建成功', value: 'create_record' },
  { label: '创建失败', value: 'create_failed' },
  { label: '修改成功', value: 'update_record' },
  { label: '修改失败', value: 'update_failed' },
  { label: '管理确认', value: 'confirm_record' },
  { label: '管理驳回', value: 'reject_record' },
  { label: '移入回收站', value: 'soft_delete' },
  { label: '恢复记录', value: 'restore_record' },
];

const relationOperationOptions = [
  { label: '全部操作', value: 'all' },
  { label: '关联合同', value: 'link' },
  { label: '解除关联', value: 'unlink' },
];

const formatDateTime = (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-');
const childCountText = (counts: RecycleBinItem['childCounts']) => Object.entries(counts)
  .filter(([, count]) => Boolean(count))
  .map(([collection, count]) => `${collectionLabels[collection] || collection} ${count} 条`)
  .join('、');

const formatSnapshot = (value?: string) => {
  if (!value) return '无快照';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const scopeFromTab = (tab: string): LogScope | undefined => {
  if (tab === 'sales') return 'sales';
  if (tab === 'purchase') return 'purchase';
  if (tab === 'relation') return 'sales_purchase';
  return undefined;
};

export const DataSafetyPage = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState('recycle');
  const [recycleItems, setRecycleItems] = useState<RecycleBinItem[]>([]);
  const [recycleLoading, setRecycleLoading] = useState(false);
  const [restoringBatch, setRestoringBatch] = useState('');
  const [search, setSearch] = useState('');
  const [contractType, setContractType] = useState<string>();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(20);
  const [logTotal, setLogTotal] = useState(0);
  const [logCollection, setLogCollection] = useState<RecycleCollection>();
  const [logOperation, setLogOperation] = useState<string>();
  const [logResult, setLogResult] = useState<'success' | 'failed'>();
  const [logSearchDraft, setLogSearchDraft] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<OperationLog>();
  const logScope = scopeFromTab(activeTab);

  const loadRecycleBin = useCallback(async () => {
    setRecycleLoading(true);
    try {
      setRecycleItems(await RecycleBinAPI.list());
    } catch (error) {
      message.error(getPbErrorMessage(error, '加载回收站失败'));
    } finally {
      setRecycleLoading(false);
    }
  }, [message]);

  const loadLogs = useCallback(async () => {
    if (!logScope) return;
    setLogsLoading(true);
    try {
      const result = await RecycleBinAPI.listLogs(logPage, logPageSize, {
        contractType: logScope,
        collectionName: logCollection,
        operation: logOperation,
        result: logResult,
        search: logSearch,
      });
      setLogs(result.items);
      setLogTotal(result.totalItems);
    } catch (error) {
      message.error(getPbErrorMessage(error, '加载操作日志失败'));
    } finally {
      setLogsLoading(false);
    }
  }, [logCollection, logOperation, logPage, logPageSize, logResult, logScope, logSearch, message]);

  useEffect(() => { void loadRecycleBin(); }, [loadRecycleBin]);
  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const restore = async (batchId: string) => {
    setRestoringBatch(batchId);
    try {
      await RecycleBinAPI.restore(batchId);
      message.success('记录及同批子记录已恢复');
      await loadRecycleBin();
      if (logScope) await loadLogs();
    } catch (error) {
      message.error(getPbErrorMessage(error, '恢复失败'));
    } finally {
      setRestoringBatch('');
    }
  };

  const changeTab = (tab: string) => {
    setActiveTab(tab);
    setLogPage(1);
    setLogCollection(undefined);
    setLogOperation(undefined);
    setLogResult(undefined);
    setLogSearchDraft('');
    setLogSearch('');
  };

  const filteredRecycleItems = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return recycleItems.filter((item) => {
      const matchesType = !contractType || item.contractType === contractType;
      const matchesSearch = !keyword || [item.recordNo, item.productName, item.deletedByName]
        .some((value) => value?.toLocaleLowerCase().includes(keyword));
      return matchesType && matchesSearch;
    });
  }, [contractType, recycleItems, search]);

  const recycleColumns: ColumnsType<RecycleBinItem> = [
    {
      title: '业务记录', key: 'record', width: 220,
      render: (_, item) => <Space direction="vertical" size={2}>
        <Text strong>{item.recordNo || item.rootRecordId}</Text>
        <Text type="secondary">{item.productName || collectionLabels[item.rootCollection]}</Text>
      </Space>,
    },
    {
      title: '类型', key: 'type', width: 100,
      render: (_, item) => <Tag color={item.contractType === 'sales' ? 'blue' : 'cyan'}>{item.contractType === 'sales' ? '销售' : '采购'}</Tag>,
    },
    {
      title: '包含内容', key: 'contents', width: 330,
      render: (_, item) => <Space direction="vertical" size={2}>
        <Text>{childCountText(item.childCounts) || `${item.recordCount} 条记录`}</Text>
        <Text type="secondary">共 {item.recordCount} 条记录，{item.attachmentCount} 个附件</Text>
      </Space>,
    },
    {
      title: '删除信息', key: 'deleted', width: 190,
      render: (_, item) => <Space direction="vertical" size={2}>
        <Text>{item.deletedByName || '系统'}</Text>
        <Text type="secondary">{formatDateTime(item.deletedAt)}</Text>
      </Space>,
    },
    {
      title: '操作', key: 'actions', fixed: 'right', width: 100,
      render: (_, item) => <Popconfirm
        title="恢复这批记录？" description="合同进度会根据恢复后的全部子记录重新计算。"
        okText="恢复" cancelText="取消" onConfirm={() => restore(item.batchId)}
      >
        <Button type="link" icon={<RedoOutlined />} loading={restoringBatch === item.batchId}>恢复</Button>
      </Popconfirm>,
    },
  ];

  const logColumns: ColumnsType<OperationLog> = [
    { title: '时间', dataIndex: 'created', width: 170, render: formatDateTime },
    {
      title: '结果', key: 'result', width: 88,
      render: (_, log) => <Tag color={log.result === 'failed' ? 'red' : 'green'}>{log.result === 'failed' ? '失败' : '成功'}</Tag>,
    },
    { title: '操作', dataIndex: 'operation', width: 130, render: (value: string) => operationLabels[value] || value || '-' },
    {
      title: '业务对象', key: 'record', width: 270,
      render: (_, log) => <Space direction="vertical" size={2}>
        <Text strong>
          {log.contract_type === 'sales_purchase'
            ? `${log.source_contract_no || '-'} → ${log.target_contract_no || '-'}`
            : (log.source_contract_no || log.record_id || '-')}
        </Text>
        <Text type="secondary">
          {collectionLabels[log.collection_name] || (log.contract_type === 'sales_purchase' ? '销售 / 采购合同' : '业务记录')}
        </Text>
      </Space>,
    },
    {
      title: '操作人', key: 'operator', width: 150,
      render: (_, log) => <Space direction="vertical" size={1}>
        <Text>{log.operator_name || '系统'}</Text>
        {log.operator_role && log.operator_role !== 'system' && <Text type="secondary">{log.operator_role}</Text>}
      </Space>,
    },
    {
      title: '详情', key: 'detail', fixed: 'right', width: 90,
      render: (_, log) => <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedLog(log)}>详情</Button>,
    },
  ];

  const renderLogPanel = (scope: LogScope) => {
    const meta = scopeMeta[scope];
    const businessOptions = scope === 'sales_purchase' ? undefined : collectionOptions[scope];
    const operationOptions = scope === 'sales_purchase' ? relationOperationOptions : standardOperationOptions;
    const tabKey = scope === 'sales_purchase' ? 'relation' : scope;
    return <section className="data-safety-section">
      <div className="data-safety-log-heading">
        <Text strong>{meta.title}</Text>
        <Text type="secondary">{meta.description}</Text>
      </div>
      {businessOptions && <div className="data-safety-subfilter">
        <Segmented
          block
          value={logCollection || 'all'}
          options={businessOptions}
          onChange={(value) => { setLogCollection(value === 'all' ? undefined : value as RecycleCollection); setLogPage(1); }}
        />
      </div>}
      <div className="data-safety-log-toolbar">
        <Input.Search
          allowClear
          placeholder="搜索合同号、记录 ID 或操作人"
          value={logSearchDraft}
          onChange={(event) => setLogSearchDraft(event.target.value)}
          onSearch={(value) => { setLogSearch(value); setLogPage(1); }}
          enterButton="查询"
        />
        <Select
          value={logOperation || 'all'}
          options={operationOptions}
          onChange={(value) => { setLogOperation(value === 'all' ? undefined : value); setLogPage(1); }}
        />
        <Select
          value={logResult || 'all'}
          options={[
            { label: '全部结果', value: 'all' },
            { label: '成功', value: 'success' },
            { label: '失败', value: 'failed' },
          ]}
          onChange={(value) => { setLogResult(value === 'all' ? undefined : value as 'success' | 'failed'); setLogPage(1); }}
        />
      </div>
      <Table
        rowKey="id"
        columns={logColumns}
        dataSource={activeTab === tabKey ? logs : []}
        loading={logsLoading}
        scroll={{ x: 960 }}
        locale={{ emptyText: '暂无符合条件的操作日志' }}
        pagination={{
          current: logPage,
          pageSize: logPageSize,
          total: logTotal,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page, pageSize) => { setLogPage(page); setLogPageSize(pageSize); },
        }}
      />
    </section>;
  };

  return <main className="data-safety-page">
    <header className="data-safety-header">
      <div><Title level={2}>数据安全</Title><Text type="secondary">按业务线查看记录轨迹，并恢复误删数据。</Text></div>
      <SafetyCertificateOutlined className="data-safety-header-icon" aria-hidden="true" />
    </header>

    <Alert type="info" showIcon title="删除操作保留数据和附件"
      description="合同及其发货、到货、发票和收付款记录会按批次进入回收站；恢复时一并恢复并重新计算合同进度。" />

    <Tabs activeKey={activeTab} onChange={changeTab} items={[
      {
        key: 'recycle', label: <span><RedoOutlined />回收站</span>,
        children: <section className="data-safety-section">
          <div className="data-safety-toolbar">
            <Input allowClear prefix={<HistoryOutlined />} placeholder="搜索合同号、产品或操作人" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select allowClear placeholder="全部业务类型" value={contractType} onChange={setContractType}
              options={[{ label: '销售', value: 'sales' }, { label: '采购', value: 'purchase' }]} />
          </div>
          <Table rowKey="batchId" columns={recycleColumns} dataSource={filteredRecycleItems} loading={recycleLoading}
            scroll={{ x: 940 }} pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 批` }} locale={{ emptyText: '回收站为空' }} />
        </section>,
      },
      { key: 'sales', label: <span><ShopOutlined />销售日志</span>, children: renderLogPanel('sales') },
      { key: 'purchase', label: <span><ShoppingCartOutlined />采购日志</span>, children: renderLogPanel('purchase') },
      { key: 'relation', label: <span><LinkOutlined />关联日志</span>, children: renderLogPanel('sales_purchase') },
    ]} />

    <Modal title="操作详情" open={Boolean(selectedLog)} footer={null} onCancel={() => setSelectedLog(undefined)} width={720}>
      {selectedLog?.error_message && <Alert type="error" showIcon title={selectedLog.error_message} />}
      <dl className="data-safety-detail">
        <dt>操作人</dt><dd>{selectedLog?.operator_name || '系统'}</dd>
        <dt>记录 ID</dt><dd>{selectedLog?.record_id || '-'}</dd>
        <dt>回收批次</dt><dd>{selectedLog?.delete_batch_id || '-'}</dd>
        <dt>关联目标</dt><dd>{selectedLog?.target_contract_no || '-'}</dd>
      </dl>
      <Text strong>数据快照</Text>
      <pre className="data-safety-snapshot">{formatSnapshot(selectedLog?.record_snapshot || selectedLog?.details)}</pre>
    </Modal>
  </main>;
};

export default DataSafetyPage;
