import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Progress, Spin, Row, Col, App, Flex, Button, Modal } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { PurchaseContractAPI } from '@/api/purchase-contract';
import { SalesContractAPI } from '@/api/sales-contract';
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
    { title: '运输合同号', dataIndex: 'tracking_contract_no', key: 'tracking_contract_no' },
    { title: '计划日期', dataIndex: 'plan_date', key: 'plan_date', render: (d: string) => d?.split(' ')[0] },
    { title: '实际日期', dataIndex: 'actual_date', key: 'actual_date', render: (d: string) => d?.split(' ')[0] || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity' },
    { title: '物流公司', dataIndex: 'logistics_company', key: 'logistics_company' },
    { title: '运费', dataIndex: 'freight', key: 'freight', render: (f: number) => (f ? `¥${f.toLocaleString()}` : '-') },
    { title: '运费状态', dataIndex: 'freight_status', key: 'freight_status', render: (s: string) => (s === 'paid' ? '已付' : '未付') },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => {
      const map: Record<string, string> = { pending: '待到货', arrived: '已到货', stocked: '已入库' };
      return map[s] || s;
    }},
  ];

  const invoiceColumns = [
    { title: '发票号码', dataIndex: 'no', key: 'no' },
    { title: '发票代码', dataIndex: 'code', key: 'code', render: (c: string) => c || '-' },
    { title: '发票类型', dataIndex: 'invoice_type', key: 'invoice_type' },
    { title: '产品数量', dataIndex: 'product_amount', key: 'product_amount' },
    { title: '发票金额', dataIndex: 'amount', key: 'amount', render: (a: number) => (a ? `¥${a.toLocaleString()}` : '-') },
    { title: '收票日期', dataIndex: 'receive_date', key: 'receive_date', render: (d: string) => d?.split(' ')[0] },
  ];

  const paymentColumns = [
    { title: '付款日期', dataIndex: 'pay_date', key: 'pay_date', render: (d: string) => d?.split(' ')[0] },
    { title: '付款金额', dataIndex: 'amount', key: 'amount', render: (a: number) => (a ? `¥${a.toLocaleString()}` : '-') },
    { title: '产品数量', dataIndex: 'product_amount', key: 'product_amount' },
    { title: '付款方式', dataIndex: 'method', key: 'method', render: (m: string) => m || '-' },
    { title: '收款单位', dataIndex: 'recipient', key: 'recipient', render: (r: string) => r || '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchase/contracts')} style={{ marginBottom: 16 }}>
        返回列表
      </Button>
      <Card title="合同基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
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
          <Descriptions.Item label="合同金额">¥{contract.total_amount?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="产品单价">¥{contract.unit_price?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="产品数量">{contract.total_quantity} 吨</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {contract.remark || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="合同附件" span={2}>
            {contract.attachments ? (
              <Flex vertical gap="small">
                {Array.isArray(contract.attachments)
                  ? contract.attachments.map((file: string) => (
                      <a
                        key={file}
                        href={`https://api.henghuacheng.cn/api/files/purchase_contracts/${contract.id}/${file}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                      >
                        <DownloadOutlined /> {file}
                      </a>
                    ))
                  : (contract.attachments as unknown as string) && (
                      <a
                        href={`https://api.henghuacheng.cn/api/files/purchase_contracts/${contract.id}/${contract.attachments}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                      >
                        <DownloadOutlined /> {contract.attachments as unknown as string}
                      </a>
                    )}
              </Flex>
            ) : (
              '-'
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
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
        <Col span={8}>
          <Card 
            title="收票进度" 
            hoverable 
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/purchase/invoices?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
          >
            <Progress percent={contract.invoiced_percent || 0} status="normal" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              ¥{(contract.invoiced_amount || 0).toLocaleString()} / ¥{contract.total_amount?.toLocaleString()}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            title="付款进度" 
            hoverable 
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/purchase/payments?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
          >
            <Progress percent={contract.paid_percent || 0} status="normal" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              ¥{(contract.paid_amount || 0).toLocaleString()} / ¥{contract.total_amount?.toLocaleString()}
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="到货批次" style={{ marginBottom: 16 }}>
        {arrivals.length > 0 ? (
          <Table columns={arrivalColumns} dataSource={arrivals} rowKey="id" pagination={false} size="small" />
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
            <Descriptions.Item label="合同金额">¥{salesContract.total_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="产品单价">¥{salesContract.unit_price?.toLocaleString()}</Descriptions.Item>
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
