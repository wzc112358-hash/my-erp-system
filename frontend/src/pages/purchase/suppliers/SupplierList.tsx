import { useState, useEffect } from 'react';
import { Table, Button, Space, Form, Input, App, Popconfirm, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { SupplierAPI } from '@/api/supplier';
import type { Supplier, SupplierFormData } from '@/types/supplier';
import { SupplierForm } from './SupplierForm';

export const SupplierList: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await SupplierAPI.list({
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
      console.error('Fetch suppliers error:', err);
      message.error('加载供应商列表失败');
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
    setEditingSupplier(null);
    form.resetFields();
    setFormVisible(true);
  };

  const handleEdit = (record: Supplier) => {
    setEditingSupplier(record);
    form.setFieldsValue(record);
    setFormVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await SupplierAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || '删除失败，该供应商有关联合同');
    }
  };

  const handleView = (record: Supplier) => {
    navigate(`/purchase/suppliers/${record.id}`);
  };

  const handleFormFinish = async (values: SupplierFormData) => {
    const data = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    ) as SupplierFormData;
    try {
      if (editingSupplier) {
        await SupplierAPI.update(editingSupplier.id, data);
        message.success('更新成功');
      } else {
        await SupplierAPI.create(data);
        message.success('创建成功');
      }
      setFormVisible(false);
      fetchData();
    } catch (error) {
      const err = error as Error;
      message.error(err.message || (editingSupplier ? '更新失败' : '创建失败'));
    }
  };

  const columns = [
    {
      title: '供应商名称',
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
      render: (_: unknown, record: Supplier) => (
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
            title="确定删除此供应商？"
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
              placeholder="搜索供应商名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增供应商
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
        title={editingSupplier ? '编辑供应商' : '新增供应商'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={640}
      >
        <SupplierForm
          form={form}
          onFinish={handleFormFinish}
          onCancel={() => setFormVisible(false)}
        />
      </Modal>
    </div>
  );
};

export default SupplierList;
