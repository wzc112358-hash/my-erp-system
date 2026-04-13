import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Spin, App, Flex, Button, Modal, Popconfirm, Form } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { pb } from '@/lib/pocketbase';
import { ServiceContractAPI } from '@/api/service-contract';
import type { ServiceContract, ServiceOrder, ServiceOrderFormData } from '@/types/service-contract';
import { ServiceOrderForm } from './ServiceOrderForm';

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
    } as ServiceOrderFormData;

    submitData.receipt_date = values.receipt_date
      ? dayjs(values.receipt_date).format('YYYY-MM-DD')
      : '';
    if (values.receipt_rmb_date) {
      submitData.receipt_rmb_date = dayjs(values.receipt_rmb_date).format('YYYY-MM-DD');
    }
    if (values.invoice_date) {
      submitData.invoice_date = dayjs(values.invoice_date).format('YYYY-MM-DD');
    }
    if (values.tax_date) {
      submitData.tax_date = dayjs(values.tax_date).format('YYYY-MM-DD');
    }

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

  const orderColumns = [
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
      title: '收款金额RMB（兑换人民币金额）',
      dataIndex: 'receipt_amount_rmb',
      key: 'receipt_amount_rmb',
      width: 110,
      render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
    },
    {
      title: '收款日期RMB（兑换日期）',
      dataIndex: 'receipt_rmb_date',
      key: 'receipt_rmb_date',
      width: 110,
      render: (d: string) => d?.split(' ')[0] || '-',
    },
    {
      title: '开票金额（RMB）',
      dataIndex: 'invoice_amount',
      key: 'invoice_amount',
      width: 100,
      render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
    },
    {
      title: '开票时间',
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      width: 100,
      render: (d: string) => d?.split(' ')[0] || '-',
    },
    {
      title: '报税金额（RMB）',
      dataIndex: 'tax_amount',
      key: 'tax_amount',
      width: 90,
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
      title: '负责人',
      dataIndex: 'manager',
      key: 'manager',
      width: 80,
      render: (v: string) => v || '-',
    },
    {
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
    },
  ];

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
          <Descriptions.Item label="销售负责人">{contract.sales_manager || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注">{contract.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="合同附件" span={2}>
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
            scroll={{ x: 1400 }}
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
        />
      </Modal>
    </div>
  );
};

export default ServiceDetail;
