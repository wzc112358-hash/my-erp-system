import { useState, useEffect } from 'react';
import { Table, Button, Space, Form, Input, Select, App, Popconfirm, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { CustomerAPI } from '@/api/customer';
import type { Customer, CustomerFormData } from '@/types/customer';
import { CustomerForm } from './CustomerForm';

export const CustomerList: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<string | undefined>();
  const [formVisible, setFormVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await CustomerAPI.list({
        page,
        per_page: pageSize,
        search: search || undefined,
        region,
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
      console.error('Fetch customers error:', err);
      message.error('加载客户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, region]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleAdd = () => {
    setEditingCustomer(null);
    form.resetFields();
    setFormVisible(true);
  };

  const handleEdit = (record: Customer) => {
    setEditingCustomer(record);
    form.setFieldsValue(record);
    setFormVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await CustomerAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || '删除失败，该客户有关联合同');
    }
  };

  const handleView = (record: Customer) => {
    navigate(`/sales/customers/${record.id}`);
  };

  const handleFormFinish = async (values: CustomerFormData) => {
    const data = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    ) as CustomerFormData;
    try {
      if (editingCustomer) {
        await CustomerAPI.update(editingCustomer.id, data);
        message.success('更新成功');
      } else {
        await CustomerAPI.create(data);
        message.success('创建成功');
      }
      setFormVisible(false);
      fetchData();
    } catch (error) {
      const err = error as Error;
      message.error(err.message || (editingCustomer ? '更新失败' : '创建失败'));
    }
  };

  const columns = [
    {
      title: '客户名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '联系人',
      dataIndex: 'contact',
      key: 'contact',
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '地区',
      dataIndex: 'region',
      key: 'region',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: Customer) => (
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
            title="确定删除此客户？"
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
              placeholder="搜索客户名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item>
            <Select
              placeholder="选择地区"
              value={region}
              onChange={setRegion}
              allowClear
              style={{ width: 150 }}
              options={[
                { label: '华东', value: '华东' },
                { label: '华南', value: '华南' },
                { label: '华北', value: '华北' },
                { label: '华中', value: '华中' },
                { label: '西南', value: '西南' },
                { label: '西北', value: '西北' },
                { label: '东北', value: '东北' },
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
              新增客户
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
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        locale={{ emptyText: '暂无数据' }}
      />

      <Modal
        title={editingCustomer ? '编辑客户' : '新增客户'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={640}
      >
        <CustomerForm
          form={form}
          onFinish={handleFormFinish}
          onCancel={() => setFormVisible(false)}
        />
      </Modal>
    </div>
  );
};

export default CustomerList;
