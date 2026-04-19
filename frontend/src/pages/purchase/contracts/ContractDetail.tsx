import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Progress, Spin, Row, Col, App, Flex, Button, Modal, Tag } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { PurchaseContractAPI } from '@/api/purchase-contract';
import { SalesContractAPI } from '@/api/sales-contract';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import type {
  PurchaseContract,
  PurchaseArrival,
  PurchaseInvoice,
  PurchasePayment,
} from '@/types/purchase-contract';
import type { SalesContract } from '@/types/sales-contract';

const statusMap: Record<string, { text: string; color: string }> = {
  executing: { text: '执行中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  cancelled: { text: '已取消', color: 'red' },
};

export const ContractDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [contract, setContract] = useState<PurchaseContract | null>(null);
  const [arrivals, setArrivals] = useState<PurchaseArrival[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [payments, setPayments] = useState<PurchasePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSalesContract, setShowSalesContract] = useState(false);
  const [salesContract, setSalesContract] = useState<SalesContract | null>(null);
  const [salesContractLoading, setSalesContractLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);

  const loadRate = useCallback(() => {
    getUsdToCnyRate().then(setExchangeRate);
  }, []);

  useEffect(() => { loadRate(); }, [loadRate]);

  const isCB = contract?.is_cross_border;
  const fmtAmt = useCallback((v: number) => {
    if (!isCB) return `¥${(v ?? 0).toFixed(4)}`;
    return `$${(v ?? 0).toFixed(4)}（≈ ¥${(v * exchangeRate).toFixed(4)}）`;
  }, [isCB, exchangeRate]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [contractData, arrivalsData, invoicesData, paymentsData] = await Promise.all([
          PurchaseContractAPI.getById(id),
          PurchaseContractAPI.getArrivals(id),
          PurchaseContractAPI.getInvoices(id),
          PurchaseContractAPI.getPayments(id),
        ]);
        setContract(contractData);
        setArrivals(arrivalsData.items);
        setInvoices(invoicesData.items);
        setPayments(paymentsData.items);
      } catch (error) {
        const err = error as { name?: string; message?: string; cause?: { name?: string } };
        const isAborted =
          err.name === 'AbortError' ||
          err.name === 'CanceledError' ||
          err.message?.includes('aborted') ||
          err.message?.includes('autocancelled') ||
          err.cause?.name === 'AbortError';
        if (!isAborted) {
          console.error('Fetch contract detail error:', error);
          message.error('加载合同详情失败');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, message]);

  useEffect(() => {
    if (showSalesContract && contract?.expand?.sales_contract?.id) {
      setSalesContractLoading(true);
      SalesContractAPI.getById(contract.expand.sales_contract.id)
        .then((data) => {
          setSalesContract(data);
        })
        .catch((error) => {
          console.error('Fetch sales contract error:', error);
          message.error('加载销售合同详情失败');
        })
        .finally(() => {
          setSalesContractLoading(false);
        });
    }
  }, [showSalesContract, contract, message]);

  const handleCloseSalesContract = () => {
    setShowSalesContract(false);
    setSalesContract(null);
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

  const statusInfo = statusMap[contract.status] || { text: contract.status, color: 'default' };

  const arrivalColumns = [
    { title: '运单号', dataIndex: 'tracking_contract_no', key: 'tracking_contract_no' },
    { title: '发货日期', dataIndex: 'shipment_date', key: 'shipment_date', render: (d: string) => d?.split(' ')[0] || '-' },
    { title: '数量(吨)', dataIndex: 'quantity', key: 'quantity' },
    { title: '物流公司', dataIndex: 'logistics_company', key: 'logistics_company' },
    { title: '发货地址', dataIndex: 'shipment_address', key: 'shipment_address', render: (v: string) => v || '-' },
    { title: '是否中转', dataIndex: 'wether_transit', key: 'wether_transit', render: (v: string) => v === 'yes' ? '是' : '否' },
    { title: '中转仓库', dataIndex: 'transit_warehouse', key: 'transit_warehouse', render: (v: string) => v || '-' },
    { title: '送货地址', dataIndex: 'delivery_address', key: 'delivery_address', render: (v: string) => v || '-' },
    { title: '运费1', dataIndex: 'freight_1', key: 'freight_1', render: (v: number) => v ? `¥${v.toFixed(4)}` : '-' },
    { title: '运费2', dataIndex: 'freight_2', key: 'freight_2', render: (v: number) => v ? `¥${v.toFixed(4)}` : '-' },
    { title: '杂费', dataIndex: 'miscellaneous_expenses', key: 'miscellaneous_expenses', render: (v: number) => v ? `¥${v.toFixed(4)}` : '-' },
    { title: '运费1状态', dataIndex: 'freight_1_status', key: 'freight_1_status', render: (v: string) => v === 'paid' ? <Tag color="green">已付</Tag> : <Tag color="orange">未付</Tag> },
    { title: '运费2状态', dataIndex: 'freight_2_status', key: 'freight_2_status', render: (v: string) => v === 'paid' ? <Tag color="green">已付</Tag> : <Tag color="orange">未付</Tag> },
    { title: '运费1日期', dataIndex: 'freight_1_date', key: 'freight_1_date', render: (v: string) => v?.split(' ')[0] || '-' },
    { title: '运费2日期', dataIndex: 'freight_2_date', key: 'freight_2_date', render: (v: string) => v?.split(' ')[0] || '-' },
    { title: '运费1开票状态', dataIndex: 'invoice_1_status', key: 'invoice_1_status', render: (v: string) => v === 'issued' ? <Tag color="green">已开</Tag> : <Tag color="orange">未开</Tag> },
    { title: '运费2开票状态', dataIndex: 'invoice_2_status', key: 'invoice_2_status', render: (v: string) => v === 'issued' ? <Tag color="green">已开</Tag> : <Tag color="orange">未开</Tag> },
    { title: '确认状态', dataIndex: 'manager_confirmed', key: 'manager_confirmed', render: (v: string) => {
      const map: Record<string, { text: string; color: string }> = { pending: { text: '待确认', color: 'orange' }, approved: { text: '已确认', color: 'green' }, rejected: { text: '已驳回', color: 'red' } };
      const info = map[v] || { text: '-', color: 'default' };
      return <Tag color={info.color}>{info.text}</Tag>;
    }},
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    { title: '操作', key: 'action', render: (_: unknown, record: PurchaseArrival) => (
      <Button size="small" onClick={() => navigate(`/purchase/arrivals/${record.id}`)}>查看</Button>
    )},
  ];

  const invoiceColumns = [
    { title: '发票号码', dataIndex: 'no', key: 'no' },
    { title: '品名', dataIndex: 'product_name', key: 'product_name' },
    { title: '发票类型', dataIndex: 'invoice_type', key: 'invoice_type' },
    { title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v || '-' },
    { title: '发票金额', dataIndex: 'amount', key: 'amount', render: (a: number) => a ? `¥${a.toFixed(4)}` : '-' },
    { title: '收票日期', dataIndex: 'receive_date', key: 'receive_date', render: (d: string) => d?.split(' ')[0] || '-' },
    { title: '是否验票', dataIndex: 'is_verified', key: 'is_verified', render: (v: string) => v === 'yes' ? <Tag color="green">已验票</Tag> : <Tag color="orange">未验票</Tag> },
    { title: '确认状态', dataIndex: 'manager_confirmed', key: 'manager_confirmed', render: (v: string) => {
      const map: Record<string, { text: string; color: string }> = { pending: { text: '待确认', color: 'orange' }, approved: { text: '已确认', color: 'green' }, rejected: { text: '已驳回', color: 'red' } };
      const info = map[v] || { text: '-', color: 'default' };
      return <Tag color={info.color}>{info.text}</Tag>;
    }},
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    { title: '操作', key: 'action', render: (_: unknown, record: PurchaseInvoice) => (
      <Button size="small" onClick={() => navigate(`/purchase/invoices/${record.id}`)}>查看</Button>
    )},
  ];

  const paymentColumns = [
    { title: '付款编号', dataIndex: 'no', key: 'no' },
    { title: '品名', dataIndex: 'product_name', key: 'product_name' },
    { title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v || '-' },
    { title: '付款金额', dataIndex: 'amount', key: 'amount', render: (a: number) => a ? `¥${a.toFixed(4)}` : '-' },
    { title: '付款日期', dataIndex: 'pay_date', key: 'pay_date', render: (d: string) => d?.split(' ')[0] || '-' },
    { title: '付款方式', dataIndex: 'method', key: 'method', render: (m: string) => m || '-' },
    { title: '确认状态', dataIndex: 'manager_confirmed', key: 'manager_confirmed', render: (v: string) => {
      const map: Record<string, { text: string; color: string }> = { pending: { text: '待确认', color: 'orange' }, approved: { text: '已确认', color: 'green' }, rejected: { text: '已驳回', color: 'red' } };
      const info = map[v] || { text: '-', color: 'default' };
      return <Tag color={info.color}>{info.text}</Tag>;
    }},
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    { title: '操作', key: 'action', render: (_: unknown, record: PurchasePayment) => (
      <Button size="small" onClick={() => navigate(`/purchase/payments/${record.id}`)}>查看</Button>
    )},
  ];

  return (
    <div style={{ padding: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchase/contracts')} style={{ marginBottom: 16 }}>
        返回列表
      </Button>
      <Card title="合同基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="合同编号">{contract.no}</Descriptions.Item>
          <Descriptions.Item label="合同状态">
            <span style={{ color: statusInfo.color }}>{statusInfo.text}</span>
          </Descriptions.Item>
          <Descriptions.Item label="产品名称">{contract.product_name}</Descriptions.Item>
          <Descriptions.Item label="供应商">
            {contract.expand?.supplier?.name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="关联销售合同">
            {contract.expand?.sales_contract ? (
              <Button
                type="link"
                onClick={() => setShowSalesContract(true)}
              >
                {contract.expand?.sales_contract?.no}
              </Button>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="签订日期">{contract.sign_date?.split(' ')[0]}</Descriptions.Item>
          <Descriptions.Item label={isCB ? '合同金额（USD）' : '合同金额'}>{fmtAmt(contract.total_amount)}</Descriptions.Item>
          <Descriptions.Item label={isCB ? '产品单价（USD）' : '产品单价'}>{fmtAmt(contract.unit_price)}</Descriptions.Item>
          <Descriptions.Item label="产品数量">{contract.total_quantity} 吨</Descriptions.Item>
          <Descriptions.Item label="采购负责人">{contract.purchasing_manager || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {contract.remark || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="合同附件" span={2}>
            {contract.attachments && contract.attachments.length > 0 ? (
              <Flex vertical gap="small">
                {contract.attachments.map((file: string) => (
                    <a
                      key={file}
                      href={`${pb.baseUrl}/api/files/purchase_contracts/${contract.id}/${file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      <DownloadOutlined /> {file}
                    </a>
                  ))}
              </Flex>
            ) : (
              '-'
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card 
            title="发货进度" 
            hoverable 
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/purchase/arrivals?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
          >
            <Progress percent={contract.execution_percent || 0} status="active" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              {contract.executed_quantity || 0} / {contract.total_quantity} 吨
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card 
            title="收票进度" 
            hoverable 
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/purchase/invoices?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
          >
            <Progress percent={contract.invoiced_percent || 0} status="normal" />
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                {fmtAmt(contract.invoiced_amount || 0)} / {fmtAmt(contract.total_amount)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card 
              title="付款进度" 
              hoverable 
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/purchase/payments?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
            >
              <Progress percent={contract.paid_percent || 0} status="normal" />
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                {fmtAmt(contract.paid_amount || 0)} / {fmtAmt(contract.total_amount)}
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="到货批次" style={{ marginBottom: 16 }}>
        {arrivals.length > 0 ? (
          <Table columns={arrivalColumns} dataSource={arrivals} rowKey="id" pagination={false} size="small" scroll={{ x: 2400 }} />
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无到货记录</div>
        )}
      </Card>

      <Card title="收票记录" style={{ marginBottom: 16 }}>
        {invoices.length > 0 ? (
          <Table columns={invoiceColumns} dataSource={invoices} rowKey="id" pagination={false} size="small" />
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无收票记录</div>
        )}
      </Card>

      <Card title="付款记录">
        {payments.length > 0 ? (
          <Table columns={paymentColumns} dataSource={payments} rowKey="id" pagination={false} size="small" />
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无付款记录</div>
        )}
      </Card>

      <Modal
        title={`销售合同详情 - ${salesContract?.no || ''}`}
        open={showSalesContract}
        onCancel={handleCloseSalesContract}
        footer={[
          <Button key="close" onClick={handleCloseSalesContract}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {salesContractLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : salesContract ? (
          <Descriptions column={2}>
            <Descriptions.Item label="合同编号">{salesContract.no}</Descriptions.Item>
            <Descriptions.Item label="合同状态">
              {statusMap[salesContract.status]?.text || salesContract.status}
            </Descriptions.Item>
            <Descriptions.Item label="产品名称">{salesContract.product_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{salesContract.expand?.customer?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="签订日期">{salesContract.sign_date?.split(' ')[0]}</Descriptions.Item>
            <Descriptions.Item label="产品数量">{salesContract.total_quantity} 吨</Descriptions.Item>
          </Descriptions>
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无数据</div>
        )}
      </Modal>
    </div>
  );
};

export default ContractDetail;
