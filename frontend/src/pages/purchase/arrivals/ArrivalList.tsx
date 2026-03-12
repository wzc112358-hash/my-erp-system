import { useState, useEffect } from 'react';
import { Table, Button, Space, Form, Input, Select, App, Popconfirm, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PurchaseArrivalAPI, PurchaseContractAPI } from '@/api/purchase-arrival';
import type { PurchaseArrival } from '@/types/purchase-arrival';
import { ArrivalForm } from './ArrivalForm';

export const ArrivalList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const [data, setData] = useState<PurchaseArrival[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [contractId, setContractId] = useState<string | undefined>();
  const [contractOptions, setContractOptions] = useState<{ label: string; value: string }[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingArrival, setEditingArrival] = useState<PurchaseArrival | null>(null);
  const [initialFormValues, setInitialFormValues] = useState<{ purchase_contract?: string; product_name?: string } | undefined>();

  const prefilledContractId = searchParams.get('contractId');
  const prefilledProductName = searchParams.get('productName');

  useEffect(() => {
    if (prefilledContractId) {
      setContractId(prefilledContractId);
    }
  }, [prefilledContractId]);

  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const result = await PurchaseContractAPI.getOptions();
        const options = result.items.map((item) => ({
          label: `${(item as unknown as { no: string }).no} - ${(item as unknown as { product_name: string }).product_name}`,
          value: item.id,
        }));
        setContractOptions(options);
      } catch (error) {
        console.error('Fetch contracts error:', error);
      }
    };
    fetchContracts();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await PurchaseArrivalAPI.list({
        page,
        per_page: pageSize,
        search: search || undefined,
        purchase_contract: contractId,
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
      console.error('Fetch arrivals error:', err);
      message.error('加载到货列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, contractId]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleAdd = () => {
    setEditingArrival(null);
    if (prefilledContractId && prefilledProductName) {
      setInitialFormValues({
        purchase_contract: prefilledContractId,
        product_name: prefilledProductName,
      });
    } else {
      setInitialFormValues(undefined);
    }
    setFormVisible(true);
  };

  const handleEdit = (record: PurchaseArrival) => {
    setEditingArrival(record);
    setFormVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await PurchaseArrivalAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const handleView = (record: PurchaseArrival) => {
    navigate(`/purchase/arrivals/${record.id}`);
  };

  const handleFormFinish = async (values: Record<string, unknown>) => {
    const data = Object.fromEntries(
      Object.entries(values).filter(
        ([, v]) => v !== undefined && v !== '' && v !== null
      )
    );
    try {
      if (editingArrival) {
        await PurchaseArrivalAPI.update(editingArrival.id, data as Parameters<typeof PurchaseArrivalAPI.update>[1]);
        message.success('更新成功');
      } else {
        await PurchaseArrivalAPI.create(data as unknown as Parameters<typeof PurchaseArrivalAPI.create>[0]);
        message.success('创建成功');
      }
      setFormVisible(false);
      fetchData();
    } catch (error) {
      const err = error as Error;
      message.error(err.message || (editingArrival ? '更新失败' : '创建失败'));
    }
  };

  const columns = [
    {
      title: '运输合同号',
      dataIndex: 'tracking_contract_no',
      key: 'tracking_contract_no',
    },
    {
      title: '品名',
      dataIndex: 'product_name',
      key: 'product_name',
    },
    {
      title: '采购合同号',
      dataIndex: ['expand', 'purchase_contract', 'no'],
      key: 'contract_no',
    },
    {
      title: '物流公司',
      dataIndex: 'logistics_company',
      key: 'logistics_company',
    },
    {
      title: '发货日期',
      dataIndex: 'shipment_date',
      key: 'shipment_date',
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (qty: number) => qty ? `${qty} 吨` : '-',
    },
    {
      title: '运费1状态',
      dataIndex: 'freight_1_status',
      key: 'freight_1_status',
      render: (status: string) => (status === 'paid' ? '已付' : '未付'),
    },
    {
      title: '运费1付款日期',
      dataIndex: 'freight_1_date',
      key: 'freight_1_date',
    },
    {
      title: '发票1状态',
      dataIndex: 'invoice_1_status',
      key: 'invoice_1_status',
      render: (status: string) => (status === 'issued' ? '已开' : '未开'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PurchaseArrival) => (
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
            title="确定删除此到货记录？"
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
              placeholder="搜索运输合同号/品名/物流公司"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 250 }}
            />
          </Form.Item>
          <Form.Item>
            <Select
              placeholder="关联合同"
              value={contractId}
              onChange={(value) => {
                setContractId(value);
                setPage(1);
              }}
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: 220 }}
              options={contractOptions}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增到货
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
        title={editingArrival ? '编辑到货' : '新增到货'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={800}
      >
        <ArrivalForm
          initialValues={editingArrival ? {
            ...editingArrival,
            attachments: undefined,
          } : initialFormValues}
          onFinish={handleFormFinish}
          onCancel={() => setFormVisible(false)}
        />
      </Modal>
    </div>
  );
};

export default ArrivalList;
