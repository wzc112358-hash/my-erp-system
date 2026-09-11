import { getPbErrorMessage } from '@/api/helpers';
import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Space, Form, Input, Select, App, Popconfirm, Modal, Progress, Tag, Tooltip, Segmented } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { PurchaseContractAPI } from '@/api/purchase-contract';
import { SalesContractAPI } from '@/api/sales-contract';
import { ComparisonAPI } from '@/api/comparison';
import type { PurchaseContract, PurchaseContractFormData } from '@/types/purchase-contract';
import type { SalesContract } from '@/types/sales-contract';
import type { BusinessDeal } from '@/types/comparison';
import { ContractLinkModal } from '@/components/common/ContractLinkModal';
import {
  matchesContractRelationFilter,
  type ContractRelationFilter,
} from '@/lib/contract-relations';
import { ContractForm } from './ContractForm';
import { extractAttachments } from '@/utils/file';
import { findDuplicateContractNumber } from '@/lib/contract-number';
import { pb } from '@/lib/pocketbase';

const statusMap: Record<string, { text: string; color: string }> = {
  executing: { text: '执行中', color: '#1890ff' },
  completed: { text: '已完成', color: '#52c41a' },
  cancelled: { text: '已取消', color: '#ff4d4f' },
};

export const ContractList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message, modal } = App.useApp();
  const [data, setData] = useState<PurchaseContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [relationFilter, setRelationFilter] = useState<ContractRelationFilter>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editingContract, setEditingContract] = useState<PurchaseContract | null>(null);
  const [salesContracts, setSalesContracts] = useState<SalesContract[]>([]);
  const [businessDeals, setBusinessDeals] = useState<BusinessDeal[]>([]);
  const [linkingContract, setLinkingContract] = useState<PurchaseContract | null>(null);
  const [linking, setLinking] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await PurchaseContractAPI.getOptions();
      setData(result.items);
    } catch (err) {
      const error = err as { name?: string; message?: string; cause?: { name?: string } };
      const isAborted =
        error.name === 'AbortError' ||
        error.name === 'CanceledError' ||
        error.message?.includes('aborted') ||
        error.message?.includes('autocancelled') ||
        error.cause?.name === 'AbortError';
      if (isAborted) {
        return;
      }
      console.error('Fetch contracts error:', err);
      message.error('加载合同列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkTargets = async () => {
    try {
      const result = await SalesContractAPI.getOptions();
      setSalesContracts(result.items);
    } catch (error) {
      message.error(getPbErrorMessage(error, '加载销售合同失败'));
    }
  };

  const fetchBusinessDeals = async () => {
    try {
      setBusinessDeals(await pb.collection('business_deals').getFullList<BusinessDeal>());
    } catch (error) {
      message.error(getPbErrorMessage(error, '加载合同关联状态失败'));
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLinkTargets();
    fetchBusinessDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const salesContractId = searchParams.get('salesContract');
    if (salesContractId) {
      setEditingContract(null);
      form.resetFields();
      form.setFieldsValue({ sales_contract: salesContractId });
      setFormVisible(true);
      window.history.replaceState({}, '', '/purchase/contracts');
    }
  }, [searchParams, form]);

  const handleSearch = () => {
    setPage(1);
  };

  const handleAdd = () => {
    setEditingContract(null);
    form.resetFields();
    setFormVisible(true);
  };

  const handleEdit = (record: PurchaseContract) => {
    setEditingContract(record);
    const attachments = Array.isArray(record.attachments)
      ? record.attachments.map((file, index) => ({
          uid: `${index}`,
          name: file,
          status: 'done',
          url: file,
        }))
      : [];
    const formData = { ...record };
    delete formData.attachments;
    form.setFieldsValue({
      ...formData,
      sign_date: record.sign_date ? dayjs(record.sign_date.split(' ')[0]) : undefined,
      attachments,
    });
    setFormVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await PurchaseContractAPI.delete(id);
      message.success('合同及关联子记录已移入回收站');
      await Promise.all([fetchData(), fetchBusinessDeals()]);
    } catch (error) {
      console.error('Delete contract error:', error);
      const err = error as { response?: { data?: unknown } };
      const errorData = err.response?.data as { message?: string; data?: Record<string, { message: string }> };
      if (errorData?.data) {
        const messages = Object.values(errorData.data).map((e: { message: string }) => e.message).join('; ');
        message.error(messages || '删除失败');
      } else {
        message.error(errorData?.message || '删除失败，可能存在关联数据');
      }
    }
  };

  const handleView = (record: PurchaseContract) => {
    navigate(`/purchase/contracts/${record.id}`);
  };

  const handleLink = async (salesId: string) => {
    if (!linkingContract) return;
    setLinking(true);
    try {
      await ComparisonAPI.linkPurchaseToSales(linkingContract.id, salesId);
      message.success('合同关联成功');
      setLinkingContract(null);
      await Promise.all([fetchData(), fetchLinkTargets(), fetchBusinessDeals()]);
    } catch (error) {
      message.error(getPbErrorMessage(error, '合同关联失败'));
    } finally {
      setLinking(false);
    }
  };

  const handleFormFinish = async (values: PurchaseContractFormData) => {
    if (!editingContract) {
      const duplicate = findDuplicateContractNumber(data, values.no);
      if (duplicate) {
        modal.warning({
          title: '采购合同号已存在',
          content: `合同 ${duplicate.no}（${duplicate.product_name}）已经存在，请打开原合同补充数据，不要重复创建。`,
          okText: '知道了',
        });
        return;
      }
    }
    let attachments: (File | string)[] | undefined;
    
    if (values.attachments) {
      attachments = extractAttachments(values.attachments);
    }

    const rawEntries = Object.entries(values).filter(([, v]) => v !== undefined && v !== '' && v !== null);
    if (values.sign_date) {
      const idx = rawEntries.findIndex(([k]) => k === 'sign_date');
      if (idx >= 0) {
        const d = values.sign_date as unknown as { format?: (fmt: string) => string };
        rawEntries[idx] = ['sign_date', d.format ? d.format('YYYY-MM-DD') : String(values.sign_date)];
      }
    }

    const payload = {
      ...Object.fromEntries(rawEntries),
      attachments,
    } as PurchaseContractFormData;

    try {
      if (editingContract) {
        await PurchaseContractAPI.update(editingContract.id, payload);
        message.success('更新成功');
      } else {
        const created = await PurchaseContractAPI.create(payload);
        setData((current) => current.some((item) => item.id === created.id) ? current : [created, ...current]);
        message.success(`采购合同 ${created.no || payload.no} 已写入数据库，记录 ID：${created.id}`);
      }
      setFormVisible(false);
      void Promise.all([fetchData(), fetchBusinessDeals()]);
    } catch (error) {
      const errorMessage = getPbErrorMessage(error, editingContract ? '更新失败' : '创建失败');
      if (!editingContract && errorMessage.includes('已存在')) {
        modal.warning({ title: '采购合同号已存在', content: errorMessage, okText: '知道了' });
      } else {
        message.error(errorMessage);
      }
    }
  };

  const filteredData = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const linkedPurchaseIds = new Set(businessDeals.flatMap((deal) => deal.purchase_contracts || []));
    return data.filter((contract) => {
      const hasRelation = linkedPurchaseIds.has(contract.id);
      const matchesSearch = !normalizedSearch
        || contract.no.toLowerCase().includes(normalizedSearch)
        || contract.product_name.toLowerCase().includes(normalizedSearch);
      const matchesStatus = !status || contract.status === status;
      return matchesSearch
        && matchesStatus
        && matchesContractRelationFilter(hasRelation, relationFilter);
    });
  }, [businessDeals, data, relationFilter, search, status]);

  const columns = [
    {
      title: '合同编号',
      dataIndex: 'no',
      key: 'no',
      width: 180,
    },
    {
      title: '产品名称',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 140,
    },
    {
      title: '关联状态',
      key: 'relation_status',
      width: 110,
      render: (_: unknown, record: PurchaseContract) => {
        const hasRelation = businessDeals.some((deal) => deal.purchase_contracts?.includes(record.id));
        return <Tag color={hasRelation ? 'green' : 'gold'}>{hasRelation ? '已关联合同' : '独立合同'}</Tag>;
      },
    },
    {
      title: '签订日期',
      dataIndex: 'sign_date',
      key: 'sign_date',
      width: 120,
      render: (date: string) => (date ? date.split(' ')[0] : '-'),
    },
    {
      title: '合同金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 150,
      render: (amount: number, record: PurchaseContract) => {
        if (!amount) return '-';
        if (record.is_cross_border) {
          return `$${amount.toFixed(6)}`;
        }
        return `¥${amount.toFixed(6)}`;
      },
    },
    {
      title: '发货进度',
      dataIndex: 'execution_percent',
      key: 'execution_percent',
      width: 120,
      render: (percent: number) => (
        <Progress
          percent={Number((percent || 0).toFixed(2))}
          size="small"
          strokeColor={{ '0%': '#722ed1', '100%': '#b37feb' }}
          trailColor="#f0f0f0"
        />
      ),
    },
    {
      title: '收票进度',
      dataIndex: 'invoiced_percent',
      key: 'invoiced_percent',
      width: 120,
      render: (percent: number) => (
        <Progress
          percent={Number((percent || 0).toFixed(2))}
          size="small"
          strokeColor={{ '0%': '#722ed1', '100%': '#b37feb' }}
          trailColor="#f0f0f0"
        />
      ),
    },
    {
      title: '付款进度',
      dataIndex: 'paid_percent',
      key: 'paid_percent',
      width: 120,
      render: (percent: number) => (
        <Progress
          percent={Number((percent || 0).toFixed(2))}
          size="small"
          strokeColor={{ '0%': '#722ed1', '100%': '#b37feb' }}
          trailColor="#f0f0f0"
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const info = statusMap[status] || { text: status, color: '#999' };
        return <Tag color={info.color} style={{ borderRadius: 8 }}>{info.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right' as const,
      render: (_: unknown, record: PurchaseContract) => (
        <Space size="small">
          <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(record)} />
          <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {!businessDeals.some((deal) => deal.purchase_contracts?.includes(record.id)) && (
            <Tooltip title="关联合同">
              <Button
                type="text"
                icon={<LinkOutlined />}
                onClick={() => setLinkingContract(record)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="将此合同移入回收站？"
            description="到货、收票和付款记录会一并移入；附件保留，管理可恢复。"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Form layout="inline">
          <Form.Item>
            <Segmented
              aria-label="合同关联状态"
              value={relationFilter}
              onChange={(value) => {
                setRelationFilter(value as ContractRelationFilter);
                setPage(1);
              }}
              options={[
                { label: '全部合同', value: 'all' },
                { label: '独立合同', value: 'unlinked' },
                { label: '关联合同', value: 'linked' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Input
              placeholder="搜索合同编号或产品名称"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              onPressEnter={handleSearch}
              style={{ width: 220 }}
            />
          </Form.Item>
          <Form.Item>
            <Select
              placeholder="选择状态"
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              allowClear
              style={{ width: 120 }}
              options={[
                { label: '执行中', value: 'executing' },
                { label: '已完成', value: 'completed' },
                { label: '已取消', value: 'cancelled' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增合同
            </Button>
          </Form.Item>
        </Form>
      </div>

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total: filteredData.length,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (p: number, ps: number) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        scroll={{ x: 1200 }}
        locale={{ emptyText: '暂无数据' }}
      />

      <Modal
        title={editingContract ? '编辑合同' : '新增合同'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={700}
      >
        <ContractForm
          form={form}
          onFinish={handleFormFinish}
          onCancel={() => setFormVisible(false)}
          initialValues={editingContract}
        />
      </Modal>

      <ContractLinkModal
        open={linkingContract !== null}
        source={linkingContract ? {
          id: linkingContract.id,
          no: linkingContract.no,
          productName: linkingContract.product_name,
        } : undefined}
        targetLabel="销售合同"
        targets={salesContracts.map((contract) => ({
          id: contract.id,
          no: contract.no,
          productName: contract.product_name,
        }))}
        confirmLoading={linking}
        onCancel={() => setLinkingContract(null)}
        onConfirm={handleLink}
      />
    </div>
  );
};

export default ContractList;
