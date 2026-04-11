import { useState, useEffect } from 'react';
import { Table, Button, Space, Form, Input, App, Popconfirm, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ExpenseRecordAPI } from '@/api/expense-record';
import type { ExpenseRecord, ExpenseRecordFormData } from '@/types/expense-record';
import { ExpenseForm } from './ExpenseForm';

export const ExpenseList: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null);
  const [form] = Form.useForm<ExpenseRecordFormData>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await ExpenseRecordAPI.list({
        page,
        per_page: pageSize,
        search: search || undefined,
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
      console.error('Fetch expense records error:', err);
      message.error('加载支出记录列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    setFormVisible(true);
  };

  const handleEdit = (record: ExpenseRecord) => {
    setEditingRecord(record);
    const attachments = Array.isArray(record.attachments)
      ? record.attachments.map((file, index) => ({
          uid: `${index}`,
          name: file,
          status: 'done' as const,
          url: file,
        }))
      : [];
    const formData = { ...record };
    delete formData.attachments;
    form.setFieldsValue({
      ...formData,
      pay_date: record.pay_date ? dayjs(record.pay_date.split(' ')[0]) : undefined,
      attachments,
    } as unknown as Partial<ExpenseRecordFormData>);
    setFormVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await ExpenseRecordAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      console.error('Delete expense record error:', error);
      message.error('删除失败');
    }
  };

  const handleView = (record: ExpenseRecord) => {
    navigate(`/purchase/expenses/${record.id}`);
  };

  const handleFormFinish = async (values: ExpenseRecordFormData) => {
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

    const submitData = {
      ...Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== undefined && v !== '' && v !== null)
      ),
      attachments,
    } as ExpenseRecordFormData;

    try {
      if (editingRecord) {
        await ExpenseRecordAPI.update(editingRecord.id, submitData);
        message.success('更新成功');
      } else {
        await ExpenseRecordAPI.create(submitData);
        message.success('创建成功');
      }
      setFormVisible(false);
      fetchData();
    } catch (error) {
      const err = error as Error;
      message.error(err.message || (editingRecord ? '更新失败' : '创建失败'));
    }
  };

  const columns = [
    {
      title: '编号',
      dataIndex: 'no',
      key: 'no',
      width: 160,
    },
    {
      title: '支出类型',
      dataIndex: 'expense_type',
      key: 'expense_type',
      width: 120,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 160,
      ellipsis: true,
    },
    {
      title: '付款金额',
      dataIndex: 'payment_amount',
      key: 'payment_amount',
      width: 120,
      render: (amount: number) => amount ? `¥${amount.toLocaleString()}` : '-',
    },
    {
      title: '付款日期',
      dataIndex: 'pay_date',
      key: 'pay_date',
      width: 120,
      render: (date: string) => date ? date.split(' ')[0] : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: ExpenseRecord) => (
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
            title="确定删除此记录？"
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
              placeholder="搜索编号、支出类型或描述"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 240 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增记录
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
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p: number, ps: number) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        scroll={{ x: 800 }}
        locale={{ emptyText: '暂无数据' }}
      />

      <Modal
        title={editingRecord ? '编辑支出记录' : '新增支出记录'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={700}
      >
        <ExpenseForm
          form={form}
          onFinish={handleFormFinish}
          onCancel={() => setFormVisible(false)}
          initialValues={editingRecord}
        />
      </Modal>
    </div>
  );
};

export default ExpenseList;
