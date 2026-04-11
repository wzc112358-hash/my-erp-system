import { useState, useEffect } from 'react';
import { Table, Button, Space, Form, Input, App, Popconfirm, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ServiceContractAPI } from '@/api/service-contract';
import type { ServiceContract, ServiceContractFormData } from '@/types/service-contract';
import { ServiceForm } from './ServiceForm';

export const ServiceList: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<ServiceContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingContract, setEditingContract] = useState<ServiceContract | null>(null);
  const [form] = Form.useForm<ServiceContractFormData>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await ServiceContractAPI.list({
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
      console.error('Fetch service contracts error:', err);
      message.error('加载服务合同列表失败');
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
    setEditingContract(null);
    form.resetFields();
    setFormVisible(true);
  };

  const handleEdit = (record: ServiceContract) => {
    setEditingContract(record);
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
      sign_date: record.sign_date ? dayjs(record.sign_date.split(' ')[0]) : undefined,
      attachments,
    } as unknown as Partial<ServiceContractFormData>);
    setFormVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await ServiceContractAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      console.error('Delete service contract error:', error);
      message.error('删除失败，可能存在关联数据');
    }
  };

  const handleView = (record: ServiceContract) => {
    navigate(`/sales/services/${record.id}`);
  };

  const handleFormFinish = async (values: ServiceContractFormData) => {
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
    } as ServiceContractFormData;

    try {
      if (editingContract) {
        await ServiceContractAPI.update(editingContract.id, submitData);
        message.success('更新成功');
      } else {
        await ServiceContractAPI.create(submitData);
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
      width: 180,
    },
    {
      title: '服务名称',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 140,
    },
    {
      title: '客户',
      key: 'customer',
      width: 120,
      render: (_: unknown, record: ServiceContract) =>
        record.expand?.customer?.name || record.customer || '-',
    },
    {
      title: '签约日期',
      dataIndex: 'sign_date',
      key: 'sign_date',
      width: 120,
      render: (date: string) => date ? date.split(' ')[0] : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: ServiceContract) => (
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
              placeholder="搜索合同编号或服务名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 220 }}
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
        title={editingContract ? '编辑服务合同' : '新增服务合同'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={700}
      >
        <ServiceForm
          form={form}
          onFinish={handleFormFinish}
          onCancel={() => setFormVisible(false)}
          initialValues={editingContract}
        />
      </Modal>
    </div>
  );
};

export default ServiceList;
