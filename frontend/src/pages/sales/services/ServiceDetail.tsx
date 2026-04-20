import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Spin, App, Flex, Button, Modal, Popconfirm, Form, Tag } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { pb } from '@/lib/pocketbase';
import { extractAttachments } from '@/utils/file';
import { ServiceContractAPI } from '@/api/service-contract';
import type { ServiceContract, ServiceOrder, ServiceOrderFormData } from '@/types/service-contract';
import { ServiceOrderForm } from './ServiceOrderForm';
import type { ColumnsType } from 'antd/es/table';

const getCrossBorderOrderColumns = (): ColumnsType<ServiceOrder> => [
  { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 130 },
  {
    title: '单价',
    dataIndex: 'unit_price',
    key: 'unit_price',
    width: 90,
    render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
  },
  {
    title: '数量',
    dataIndex: 'quantity',
    key: 'quantity',
    width: 70,
    render: (v: number) => v ?? '-',
  },
  {
    title: '服务费比例',
    dataIndex: 'service_fee_rate',
    key: 'service_fee_rate',
    width: 90,
    render: (v: number) => v != null ? `${v}%` : '-',
  },
  {
    title: '收款(USD)',
    dataIndex: 'receipt_amount',
    key: 'receipt_amount',
    width: 110,
    render: (v: number) => v ? `$${v.toFixed(4)}` : '-',
  },
  {
    title: '收款时间',
    dataIndex: 'receipt_date',
    key: 'receipt_date',
    width: 100,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '出港时间',
    dataIndex: 'departure_date',
    key: 'departure_date',
    width: 100,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '客户付款时间',
    dataIndex: 'customer_payment_date',
    key: 'customer_payment_date',
    width: 110,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '银行收汇时间',
    dataIndex: 'bank_settlement_date',
    key: 'bank_settlement_date',
    width: 110,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '实际收款(USD)',
    dataIndex: 'actual_receipt_amount_usd',
    key: 'actual_receipt_amount_usd',
    width: 120,
    render: (v: number) => v != null ? `$${v.toFixed(4)}` : '-',
  },
  {
    title: '兑换人民币金额',
    dataIndex: 'receipt_amount_rmb',
    key: 'receipt_amount_rmb',
    width: 120,
    render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
  },
  {
    title: '兑换日期',
    dataIndex: 'receipt_rmb_date',
    key: 'receipt_rmb_date',
    width: 100,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '开票金额(RMB)',
    dataIndex: 'invoice_amount',
    key: 'invoice_amount',
    width: 110,
    render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
  },
  {
    title: '佣金发票提供时间',
    dataIndex: 'invoice_date',
    key: 'invoice_date',
    width: 130,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '报税金额(RMB)',
    dataIndex: 'tax_amount',
    key: 'tax_amount',
    width: 110,
    render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
  },
  {
    title: '报税时间',
    dataIndex: 'tax_date',
    key: 'tax_date',
    width: 100,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '附件',
    key: 'attachments',
    width: 150,
    render: (_: unknown, record: ServiceOrder) => {
      if (!record.attachments || record.attachments.length === 0) return '-';
      return (
        <Flex vertical gap="small">
          {record.attachments.map((file: string) => (
            <a
              key={file}
              href={`${pb.baseUrl}/api/files/service_orders/${record.id}/${file}`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <DownloadOutlined /> {file}
            </a>
          ))}
        </Flex>
      );
    },
  },
  {
    title: '负责人',
    dataIndex: 'manager',
    key: 'manager',
    width: 80,
    render: (v: string) => v || '-',
  },
];

const getDomesticOrderColumns = (onEdit: (r: ServiceOrder) => void, onDelete: (id: string) => void): ColumnsType<ServiceOrder> => [
  { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 130 },
  {
    title: '负责人',
    dataIndex: 'manager',
    key: 'manager',
    width: 80,
    render: (v: string) => v || '-',
  },
  {
    title: '数量',
    dataIndex: 'quantity',
    key: 'quantity',
    width: 70,
    render: (v: number) => v ?? '-',
  },
  {
    title: '单价',
    dataIndex: 'unit_price',
    key: 'unit_price',
    width: 90,
    render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
  },
  {
    title: '总金额',
    dataIndex: 'total_amount',
    key: 'total_amount',
    width: 100,
    render: (v: number) => v != null ? `¥${v.toFixed(4)}` : '-',
  },
  {
    title: '服务费比例',
    dataIndex: 'service_fee_rate',
    key: 'service_fee_rate',
    width: 100,
    render: (v: number) => v != null ? `${v}%` : '-',
  },
  {
    title: '开票时间',
    dataIndex: 'invoice_time',
    key: 'invoice_time',
    width: 100,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '收款时间',
    dataIndex: 'payment_date',
    key: 'payment_date',
    width: 100,
    render: (d: string) => d?.split(' ')[0] || '-',
  },
  {
    title: '收款金额',
    dataIndex: 'payment_amount',
    key: 'payment_amount',
    width: 100,
    render: (v: number) => v != null ? `¥${v.toFixed(4)}` : '-',
  },
  {
    title: '附件',
    key: 'attachments',
    width: 150,
    render: (_: unknown, record: ServiceOrder) => {
      if (!record.attachments || record.attachments.length === 0) return '-';
      return (
        <Flex vertical gap="small">
          {record.attachments.map((file: string) => (
            <a
              key={file}
              href={`${pb.baseUrl}/api/files/service_orders/${record.id}/${file}`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <DownloadOutlined /> {file}
            </a>
          ))}
        </Flex>
      );
    },
  },
  {
    title: '操作',
    key: 'action',
    width: 90,
    fixed: 'right' as const,
    render: (_: unknown, record: ServiceOrder) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <Button type="text" icon={<EditOutlined />} onClick={() => onEdit(record)} />
        <Popconfirm
          title="确定删除此订单？"
          onConfirm={() => onDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>
    ),
  },
];

export const ServiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [contract, setContract] = useState<ServiceContract | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [orderForm] = Form.useForm<ServiceOrderFormData>();

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [contractData, ordersData] = await Promise.all([
        ServiceContractAPI.getById(id),
        ServiceContractAPI.getOrders(id),
      ]);
      setContract(contractData);
      setOrders(ordersData.items);
    } catch (error) {
      const err = error as { name?: string; message?: string; cause?: { name?: string } };
      const isAborted =
        err.name === 'AbortError' ||
        err.name === 'CanceledError' ||
        err.message?.includes('aborted') ||
        err.message?.includes('autocancelled') ||
        err.cause?.name === 'AbortError';
      if (!isAborted) {
        console.error('Fetch service contract detail error:', error);
        message.error('加载合同详情失败');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isCrossBorder = contract?.is_cross_border ?? true;

  const handleAddOrder = () => {
    setEditingOrder(null);
    orderForm.resetFields();
    setOrderModalVisible(true);
  };

  const handleEditOrder = (record: ServiceOrder) => {
    setEditingOrder(record);
    orderForm.setFieldsValue(({
      ...record,
      receipt_date: record.receipt_date ? dayjs(record.receipt_date.split(' ')[0]) : undefined,
      receipt_rmb_date: record.receipt_rmb_date ? dayjs(record.receipt_rmb_date.split(' ')[0]) : undefined,
      invoice_date: record.invoice_date ? dayjs(record.invoice_date.split(' ')[0]) : undefined,
      tax_date: record.tax_date ? dayjs(record.tax_date.split(' ')[0]) : undefined,
      departure_date: record.departure_date ? dayjs(record.departure_date.split(' ')[0]) : undefined,
      customer_payment_date: record.customer_payment_date ? dayjs(record.customer_payment_date.split(' ')[0]) : undefined,
      bank_settlement_date: record.bank_settlement_date ? dayjs(record.bank_settlement_date.split(' ')[0]) : undefined,
      invoice_time: record.invoice_time ? dayjs(record.invoice_time.split(' ')[0]) : undefined,
      payment_date: record.payment_date ? dayjs(record.payment_date.split(' ')[0]) : undefined,
      attachments: Array.isArray(record.attachments)
        ? record.attachments.map((file, index) => ({
            uid: `${index}`,
            name: file,
            status: 'done' as const,
            url: file,
          }))
        : [],
    }) as unknown as Partial<ServiceOrderFormData>);
    setOrderModalVisible(true);
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      await ServiceContractAPI.deleteOrder(orderId);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      console.error('Delete order error:', error);
      message.error('删除失败');
    }
  };

  const handleOrderFormFinish = async (values: ServiceOrderFormData) => {
    let attachments: (File | string)[] | undefined;

    if (values.attachments) {
      attachments = extractAttachments(values.attachments);
    }

    const submitData = {
      ...Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== undefined && v !== '' && v !== null)
      ),
      attachments,
    } as ServiceOrderFormData;

    const fmt = (v: unknown) => v ? dayjs(v as Parameters<typeof dayjs>[0]).format('YYYY-MM-DD') : '';
    submitData.receipt_date = fmt(values.receipt_date);
    if (values.receipt_rmb_date) submitData.receipt_rmb_date = fmt(values.receipt_rmb_date);
    if (values.invoice_date) submitData.invoice_date = fmt(values.invoice_date);
    if (values.tax_date) submitData.tax_date = fmt(values.tax_date);
    if (values.departure_date) submitData.departure_date = fmt(values.departure_date);
    if (values.customer_payment_date) submitData.customer_payment_date = fmt(values.customer_payment_date);
    if (values.bank_settlement_date) submitData.bank_settlement_date = fmt(values.bank_settlement_date);
    if (values.invoice_time) submitData.invoice_time = fmt(values.invoice_time);
    if (values.payment_date) submitData.payment_date = fmt(values.payment_date);

    try {
      if (editingOrder) {
        await ServiceContractAPI.updateOrder(editingOrder.id, submitData);
        message.success('更新成功');
      } else {
        submitData.service_contract = id!;
        await ServiceContractAPI.createOrder(submitData);
        message.success('创建成功');
      }
      setOrderModalVisible(false);
      fetchData();
    } catch (error) {
      const err = error as Error;
      message.error(err.message || (editingOrder ? '更新失败' : '创建失败'));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!contract) {
    return null;
  }

  const actionColumn: ColumnsType<ServiceOrder>[number] = {
    title: '操作',
    key: 'action',
    width: 90,
    fixed: 'right' as const,
    render: (_: unknown, record: ServiceOrder) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <Button type="text" icon={<EditOutlined />} onClick={() => handleEditOrder(record)} />
        <Popconfirm
          title="确定删除此订单？"
          onConfirm={() => handleDeleteOrder(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>
    ),
  };

  const orderColumns: ColumnsType<ServiceOrder> = isCrossBorder
    ? [...getCrossBorderOrderColumns(), actionColumn]
    : getDomesticOrderColumns(handleEditOrder, handleDeleteOrder);

  return (
    <div style={{ padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/sales/services')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card title="合同基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="合同编号">{contract.no}</Descriptions.Item>
          <Descriptions.Item label="服务名称">{contract.product_name}</Descriptions.Item>
          <Descriptions.Item label="客户">{contract.expand?.customer?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="签约日期">{contract.sign_date?.split(' ')[0]}</Descriptions.Item>
          <Descriptions.Item label="跨境交易">
            {contract.is_cross_border ? <Tag color="blue">跨境</Tag> : <Tag>国内</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="销售负责人">{contract.sales_manager || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注">{contract.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="合同附件">
            {contract.attachments && contract.attachments.length > 0 ? (
              <Flex vertical gap="small">
                {contract.attachments.map((file: string) => (
                    <a
                      key={file}
                      href={`${pb.baseUrl}/api/files/service_contracts/${contract.id}/${file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      <DownloadOutlined /> {file}
                    </a>
                  ))}
              </Flex>
            ) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="佣金订单"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddOrder}>
            新增订单
          </Button>
        }
      >
        {orders.length > 0 ? (
          <Table
            columns={orderColumns}
            dataSource={orders}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: isCrossBorder ? 2000 : 1000 }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无订单记录</div>
        )}
      </Card>

      <Modal
        title={editingOrder ? '编辑订单' : '新增订单'}
        open={orderModalVisible}
        onCancel={() => setOrderModalVisible(false)}
        footer={null}
        width={750}
      >
        <ServiceOrderForm
          form={orderForm}
          onFinish={handleOrderFormFinish}
          onCancel={() => setOrderModalVisible(false)}
          contractId={id!}
          initialValues={editingOrder}
          isCrossBorder={isCrossBorder}
        />
      </Modal>
    </div>
  );
};

export default ServiceDetail;
