import { useState, useEffect } from 'react';
import { Table, Button, Space, Form, Input, App, Popconfirm, Modal, Select, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { BiddingRecordAPI } from '@/api/bidding-record';
import type { BiddingRecord, BiddingRecordFormData } from '@/types/bidding-record';
import { BiddingForm } from './BiddingForm';

const bidResultMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待开标', color: 'orange' },
  won: { label: '中标', color: 'green' },
  lost: { label: '未中标', color: 'red' },
};

export const BiddingList: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<BiddingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [bidResultFilter, setBidResultFilter] = useState<string | undefined>(undefined);
  const [formVisible, setFormVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BiddingRecord | null>(null);
  const [form] = Form.useForm<BiddingRecordFormData>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await BiddingRecordAPI.list({
        page,
        per_page: pageSize,
        search: search || undefined,
        bid_result: bidResultFilter,
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
      console.error('Fetch bidding records error:', err);
      message.error('加载投标记录列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, bidResultFilter]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    setFormVisible(true);
  };

  const handleEdit = (record: BiddingRecord) => {
    setEditingRecord(record);
    const tenderFeeInvoice = Array.isArray(record.tender_fee_invoice)
      ? record.tender_fee_invoice.map((file, index) => ({
          uid: `${index}`,
          name: file,
          status: 'done' as const,
          url: file,
        }))
      : [];
    const attachments = Array.isArray(record.attachments)
      ? record.attachments.map((file, index) => ({
          uid: `${index}`,
          name: file,
          status: 'done' as const,
          url: file,
        }))
      : [];
    form.setFieldsValue({
      bidding_company: record.bidding_company,
      bidding_no: record.bidding_no,
      product_name: record.product_name,
      quantity: record.quantity,
      tender_fee: record.tender_fee || undefined,
      bid_bond: record.bid_bond || undefined,
      open_date: record.open_date ? record.open_date.split(' ')[0] : undefined,
      bid_result: record.bid_result,
      bond_return_amount: record.bond_return_amount || undefined,
      agency_fee: record.agency_fee || undefined,
      sales_contract: record.sales_contract || undefined,
      remark: record.remark || undefined,
      tender_fee_date: record.tender_fee_date ? record.tender_fee_date.split(' ')[0] : undefined,
      bid_bond_date: record.bid_bond_date ? record.bid_bond_date.split(' ')[0] : undefined,
      bond_return_date: record.bond_return_date ? record.bond_return_date.split(' ')[0] : undefined,
      tender_fee_invoice: tenderFeeInvoice,
      attachments,
    });
    setFormVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await BiddingRecordAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      console.error('Delete bidding record error:', error);
      message.error('删除失败');
    }
  };

  const handleView = (record: BiddingRecord) => {
    navigate(`/sales/bidding/${record.id}`);
  };

  const handleFormFinish = async (values: BiddingRecordFormData) => {
    let tenderFeeInvoice: File[] | undefined;
    let attachments: File[] | undefined;

    if (values.tender_fee_invoice) {
      const arr = Array.isArray(values.tender_fee_invoice) ? values.tender_fee_invoice : [];
      tenderFeeInvoice = arr
        .map((file: unknown) => {
          const f = file as { originFileObj?: File; url?: string; name?: string };
          if (f.originFileObj) return f.originFileObj;
          return null;
        })
        .filter((f): f is File => f !== null);
    }

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
      tender_fee_invoice: tenderFeeInvoice,
      attachments,
    } as BiddingRecordFormData;

    try {
      if (editingRecord) {
        await BiddingRecordAPI.update(editingRecord.id, submitData);
        message.success('更新成功');
      } else {
        await BiddingRecordAPI.create(submitData);
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
      title: '招标公司',
      dataIndex: 'bidding_company',
      key: 'bidding_company',
      width: 160,
      ellipsis: true,
    },
    {
      title: '招标编号',
      dataIndex: 'bidding_no',
      key: 'bidding_no',
      width: 140,
    },
    {
      title: '产品名称',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 140,
      ellipsis: true,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
    },
    {
      title: '标书费',
      dataIndex: 'tender_fee',
      key: 'tender_fee',
      width: 100,
      render: (v: number) => v ? `¥${v.toLocaleString()}` : '-',
    },
    {
      title: '投标保证金',
      dataIndex: 'bid_bond',
      key: 'bid_bond',
      width: 110,
      render: (v: number) => v ? `¥${v.toLocaleString()}` : '-',
    },
    {
      title: '开标时间',
      dataIndex: 'open_date',
      key: 'open_date',
      width: 110,
      render: (v: string) => v ? v.split(' ')[0] : '-',
    },
    {
      title: '中标结果',
      dataIndex: 'bid_result',
      key: 'bid_result',
      width: 100,
      render: (v: string) => {
        const info = bidResultMap[v];
        return info ? <Tag color={info.color}>{info.label}</Tag> : '-';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: BiddingRecord) => (
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
              placeholder="搜索招标公司、编号或产品"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 240 }}
            />
          </Form.Item>
          <Form.Item>
            <Select
              placeholder="中标结果"
              value={bidResultFilter}
              onChange={(v) => { setBidResultFilter(v); setPage(1); }}
              allowClear
              style={{ width: 120 }}
              options={[
                { label: '待开标', value: 'pending' },
                { label: '中标', value: 'won' },
                { label: '未中标', value: 'lost' },
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
              新增投标
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
        scroll={{ x: 1100 }}
        locale={{ emptyText: '暂无数据' }}
      />

      <Modal
        title={editingRecord ? '编辑投标记录' : '新增投标记录'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={800}
      >
        <BiddingForm
          form={form}
          onFinish={handleFormFinish}
          onCancel={() => setFormVisible(false)}
          initialValues={editingRecord}
        />
      </Modal>
    </div>
  );
};

export default BiddingList;
