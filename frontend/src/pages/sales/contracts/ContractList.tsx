import { useState, useEffect } from 'react';
import { Table, Button, Space, Form, Input, Select, App, Popconfirm, Modal, Progress } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { SalesContractAPI } from '@/api/sales-contract';
import type { SalesContract, SalesContractFormData } from '@/types/sales-contract';
import { ContractForm } from './ContractForm';

const statusMap: Record<string, { text: string; color: string }> = {
  executing: { text: '执行中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  cancelled: { text: '已取消', color: 'red' },
};

export const ContractList: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [formVisible, setFormVisible] = useState(false);
  const [editingContract, setEditingContract] = useState<SalesContract | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await SalesContractAPI.list({
        page,
        per_page: pageSize,
        search: search || undefined,
        status,
      });
      setData(result.items);
      setTotal(result.totalItems);
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

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, status]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleAdd = () => {
    setEditingContract(null);
    form.resetFields();
    setFormVisible(true);
  };

  const handleEdit = (record: SalesContract) => {
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
      await SalesContractAPI.delete(id);
      message.success('删除成功');
      fetchData();
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

  const handleView = (record: SalesContract) => {
    navigate(`/sales/contracts/${record.id}`);
  };

  const handleFormFinish = async (values: SalesContractFormData) => {
    let attachments: File[] | undefined;
    
    if (values.attachments) {
      const arr = Array.isArray(values.attachments) ? values.attachments : [];
      attachments = arr
        .map((file: unknown) => {
          const f = file as { originFileObj?: File; url?: string; name?: string };
          if (f.originFileObj) return f.originFileObj;
          return null;
        })
        .filter((f): f is File => f !== null);
    }
    
    const data = {
      ...Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== undefined && v !== '' && v !== null)
      ),
      attachments,
    } as SalesContractFormData;
    
    try {
      if (editingContract) {
        await SalesContractAPI.update(editingContract.id, data);
        message.success('更新成功');
      } else {
        await SalesContractAPI.create(data);
        message.success('创建成功');
      }
      setFormVisible(false);
      fetchData();
    } catch (error) {
      const err = error as Error;
      message.error(err.message || (editingContract ? '更新失败' : '创建失败'));
    }
  };

  const columns = [
    {
      title: '合同编号',
      dataIndex: 'no',
      key: 'no',
      width: 150,
    },
    {
      title: '产品名称',
      dataIndex: 'product_name',
      key: 'product_name',
    },
    {
      title: '签订日期',
      dataIndex: 'sign_date',
      key: 'sign_date',
      width: 120,
      render: (date: string) => date ? date.split(' ')[0] : '-',
    },
    {
      title: '合同金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 120,
      render: (amount: number) => amount ? `¥${amount.toLocaleString()}` : '-',
    },
    {
      title: '到货进度',
      dataIndex: 'execution_percent',
      key: 'execution_percent',
      width: 100,
      render: (percent: number) => (
        <Progress percent={percent || 0} size="small" />
      ),
    },
    {
      title: '收款进度',
      dataIndex: 'receipt_percent',
      key: 'receipt_percent',
      width: 100,
      render: (percent: number) => (
        <Progress percent={percent || 0} size="small" status="normal" />
      ),
    },
    {
      title: '开票进度',
      dataIndex: 'invoice_percent',
      key: 'invoice_percent',
      width: 100,
      render: (percent: number) => (
        <Progress percent={percent || 0} size="small" status="normal" />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const info = statusMap[status] || { text: status, color: 'default' };
        return <span style={{ color: info.color }}>{info.text}</span>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: SalesContract) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          />
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="确定删除此合同？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
            />
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
            <Input
              placeholder="搜索合同编号或产品名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 220 }}
            />
          </Form.Item>
          <Form.Item>
            <Select
              placeholder="选择状态"
              value={status}
              onChange={setStatus}
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
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
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
    </div>
  );
};

export default ContractList;
