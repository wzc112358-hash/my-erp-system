import { useState, useEffect } from 'react';
import { Table, Button, Space, Form, Input, App, Popconfirm, Modal, Select, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PurchaseInvoiceAPI } from '@/api/purchase-invoice';
import type { PurchaseInvoice } from '@/types/purchase-contract';
import { InvoiceForm } from './InvoiceForm';
import { pb } from '@/lib/pocketbase';

interface ContractOption {
  label: string;
  value: string;
}

export const InvoiceList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const [data, setData] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [contractId, setContractId] = useState<string | undefined>();
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
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
        const result = await pb.collection('purchase_contracts').getList(1, 100, {
          filter: 'status = "executing"',
        });
        const options = result.items.map((item: Record<string, unknown>) => ({
          label: `${item.no} - ${item.product_name}`,
          value: item.id as string,
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
      const result = await PurchaseInvoiceAPI.list({
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
      console.error('Fetch invoices error:', err);
      message.error('加载发票列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, search, contractId]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleAdd = () => {
    setEditingInvoice(null);
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

  const handleEdit = (record: PurchaseInvoice) => {
    setEditingInvoice(record);
    setFormVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await PurchaseInvoiceAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const handleView = (record: PurchaseInvoice) => {
    navigate(`/purchase/invoices/${record.id}`);
  };

  const handleFormFinish = async (values: Record<string, unknown>) => {
    const data = Object.fromEntries(
      Object.entries(values).filter(
        ([, v]) => v !== undefined && v !== '' && v !== null
      )
    );
    try {
      if (editingInvoice) {
        await PurchaseInvoiceAPI.update(editingInvoice.id, data as Parameters<typeof PurchaseInvoiceAPI.update>[1]);
        message.success('更新成功');
      } else {
        await PurchaseInvoiceAPI.create(data as unknown as Parameters<typeof PurchaseInvoiceAPI.create>[0]);
        message.success('创建成功');
      }
      setFormVisible(false);
      fetchData();
    } catch (error) {
      const err = error as Error;
      message.error(err.message || (editingInvoice ? '更新失败' : '创建失败'));
    }
  };

  const columns = [
    {
      title: '发票号码',
      dataIndex: 'no',
      key: 'no',
    },
    {
      title: '品名',
      dataIndex: 'product_name',
      key: 'product_name',
    },
    {
      title: '合同编号',
      dataIndex: ['expand', 'purchase_contract', 'no'],
      key: 'contract_no',
    },
    {
      title: '发票类型',
      dataIndex: 'invoice_type',
      key: 'invoice_type',
    },
    {
      title: '产品数量',
      dataIndex: 'product_amount',
      key: 'product_amount',
      render: (qty: number) => qty ? `${qty} 吨` : '-',
    },
    {
      title: '发票金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => amount?.toFixed(2),
    },
    {
      title: '收票日期',
      dataIndex: 'receive_date',
      key: 'receive_date',
    },
    {
      title: '确认状态',
      dataIndex: 'manager_confirmed',
      key: 'manager_confirmed',
      render: (status: string) => {
        const map: Record<string, { text: string; color: string }> = {
          pending: { text: '待确认', color: 'orange' },
          approved: { text: '已确认', color: 'green' },
          rejected: { text: '已驳回', color: 'red' },
        };
        const { text, color } = map[status] || { text: '-', color: 'default' };
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '验票状态',
      dataIndex: 'is_verified',
      key: 'is_verified',
      render: (v: string) => v === 'yes' ? <Tag color="green">已验票</Tag> : <Tag color="orange">未验票</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PurchaseInvoice) => (
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
            title="确定删除此发票记录？"
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
              placeholder="搜索发票号码/品名"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
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
              style={{ width: 200 }}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
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
              新增收票
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
        title={editingInvoice ? '编辑发票' : '新增收票'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={700}
      >
        <InvoiceForm
          initialValues={editingInvoice ? {
            ...editingInvoice,
            attachments: undefined,
          } : initialFormValues}
          onFinish={handleFormFinish}
          onCancel={() => setFormVisible(false)}
        />
      </Modal>
    </div>
  );
};

export default InvoiceList;
