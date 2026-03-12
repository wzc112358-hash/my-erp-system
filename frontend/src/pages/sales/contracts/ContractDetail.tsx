import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Progress, Spin, Row, Col, App, Flex, Button, Modal } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { SalesContractAPI } from '@/api/sales-contract';
import { PurchaseContractAPI } from '@/api/purchase-contract';
import type { SalesContract, SalesShipment, SaleInvoice, SaleReceipt } from '@/types/sales-contract';
import type { PurchaseContract } from '@/types/purchase-contract';

const statusMap: Record<string, { text: string; color: string }> = {
  executing: { text: '执行中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  cancelled: { text: '已取消', color: 'red' },
};

export const ContractDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [contract, setContract] = useState<SalesContract | null>(null);
  const [shipments, setShipments] = useState<SalesShipment[]>([]);
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [receipts, setReceipts] = useState<SaleReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPurchaseContract, setShowPurchaseContract] = useState(false);
  const [purchaseContract, setPurchaseContract] = useState<PurchaseContract | null>(null);
  const [purchaseContractLoading, setPurchaseContractLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [contractData, shipmentsData, invoicesData, receiptsData] = await Promise.all([
          SalesContractAPI.getById(id),
          SalesContractAPI.getShipments(id),
          SalesContractAPI.getInvoices(id),
          SalesContractAPI.getReceipts(id),
        ]);
        setContract(contractData);
        setShipments(shipmentsData.items);
        setInvoices(invoicesData.items);
        setReceipts(receiptsData.items);
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
    if (showPurchaseContract && contract?.expand?.purchase_contract?.id) {
      setPurchaseContractLoading(true);
      PurchaseContractAPI.getById(contract.expand.purchase_contract.id)
        .then((data) => {
          setPurchaseContract(data);
        })
        .catch((error) => {
          console.error('Fetch purchase contract error:', error);
          message.error('加载采购合同详情失败');
        })
        .finally(() => {
          setPurchaseContractLoading(false);
        });
    }
  }, [showPurchaseContract, contract, message]);

  const handleClosePurchaseContract = () => {
    setShowPurchaseContract(false);
    setPurchaseContract(null);
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

  const shipmentColumns = [
    { title: '运输合同号', dataIndex: 'tracking_contract_no', key: 'tracking_contract_no' },
    { title: '发货日期', dataIndex: 'date', key: 'date', render: (d: string) => d?.split(' ')[0] },
    { title: '数量', dataIndex: 'quantity', key: 'quantity' },
    { title: '物流公司', dataIndex: 'logistics_company', key: 'logistics_company' },
    { title: '运费', dataIndex: 'freight', key: 'freight', render: (f: number) => f ? `¥${f.toLocaleString()}` : '-' },
    { title: '运费状态', dataIndex: 'freight_status', key: 'freight_status', render: (s: string) => s === 'paid' ? '已付' : '未付' },
    { title: '发票状态', dataIndex: 'invoice_status', key: 'invoice_status', render: (s: string) => s === 'issued' ? '已开' : '未开' },
  ];

  const invoiceColumns = [
    { title: '发票号码', dataIndex: 'no', key: 'no' },
    { title: '发票类型', dataIndex: 'invoice_type', key: 'invoice_type' },
    { title: '产品数量', dataIndex: 'product_amount', key: 'product_amount' },
    { title: '发票金额', dataIndex: 'amount', key: 'amount', render: (a: number) => a ? `¥${a.toLocaleString()}` : '-' },
    { title: '开票日期', dataIndex: 'issue_date', key: 'issue_date', render: (d: string) => d?.split(' ')[0] },
  ];

  const receiptColumns = [
    { title: '收款日期', dataIndex: 'receipt_date', key: 'receipt_date', render: (d: string) => d?.split(' ')[0] },
    { title: '收款金额', dataIndex: 'amount', key: 'amount', render: (a: number) => a ? `¥${a.toLocaleString()}` : '-' },
    { title: '产品数量', dataIndex: 'product_amount', key: 'product_amount' },
    { title: '收款方式', dataIndex: 'method', key: 'method', render: (m: string) => m || '-' },
    { title: '收款账户', dataIndex: 'account', key: 'account', render: (a: string) => a || '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/sales/contracts')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>
      <Card title="合同基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="合同编号">{contract.no}</Descriptions.Item>
          <Descriptions.Item label="合同状态">
            <span style={{ color: statusInfo.color }}>{statusInfo.text}</span>
          </Descriptions.Item>
          <Descriptions.Item label="产品名称">{contract.product_name}</Descriptions.Item>
          <Descriptions.Item label="客户">{contract.expand?.customer?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="关联采购合同">
            {contract.expand?.purchase_contract ? (
              <Button
                type="link"
                onClick={() => setShowPurchaseContract(true)}
              >
                {contract.expand?.purchase_contract?.no}
              </Button>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="签订日期">{contract.sign_date?.split(' ')[0]}</Descriptions.Item>
          <Descriptions.Item label="合同金额">¥{contract.total_amount?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="产品单价">¥{contract.unit_price?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="产品数量">{contract.total_quantity} 吨</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{contract.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="合同附件" span={2}>
            {contract.attachments ? (
              <Flex vertical gap="small">
                {Array.isArray(contract.attachments)
                  ? contract.attachments.map((file: string) => (
                      <a
                        key={file}
                        href={`https://api.henghuacheng.cn/api/files/sales_contracts/${contract.id}/${file}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                      >
                        <DownloadOutlined /> {file}
                      </a>
                    ))
                  : (contract.attachments as unknown as string) && (
                      <a
                        href={`https://api.henghuacheng.cn/api/files/sales_contracts/${contract.id}/${contract.attachments}`}
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
            title="到货进度" 
            hoverable 
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/sales/shipments?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
          >
            <Progress percent={contract.execution_percent || 0} status="active" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              {contract.executed_quantity || 0} / {contract.total_quantity} 吨
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            title="收款进度" 
            hoverable 
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/sales/receipts?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
          >
            <Progress percent={contract.receipt_percent || 0} status="normal" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              ¥{(contract.receipted_amount || 0).toLocaleString()} / ¥{contract.total_amount?.toLocaleString()}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            title="开票进度" 
            hoverable 
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/sales/invoices?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
          >
            <Progress percent={contract.invoice_percent || 0} status="normal" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              ¥{(contract.invoiced_amount || 0).toLocaleString()} / ¥{contract.total_amount?.toLocaleString()}
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="欠款信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="欠款金额">¥{(contract.debt_amount || 0).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="欠款比例">{contract.debt_percent || 0}%</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="发货批次" style={{ marginBottom: 16 }}>
        {shipments.length > 0 ? (
          <Table
            columns={shipmentColumns}
            dataSource={shipments}
            rowKey="id"
            pagination={false}
            size="small"
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无发货记录</div>
        )}
      </Card>

      <Card title="发票记录" style={{ marginBottom: 16 }}>
        {invoices.length > 0 ? (
          <Table
            columns={invoiceColumns}
            dataSource={invoices}
            rowKey="id"
            pagination={false}
            size="small"
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无发票记录</div>
        )}
      </Card>

      <Card title="收款记录">
        {receipts.length > 0 ? (
          <Table
            columns={receiptColumns}
            dataSource={receipts}
            rowKey="id"
            pagination={false}
            size="small"
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无收款记录</div>
        )}
      </Card>

      <Modal
        title={`采购合同详情 - ${purchaseContract?.no || ''}`}
        open={showPurchaseContract}
        onCancel={handleClosePurchaseContract}
        footer={[
          <Button key="close" onClick={handleClosePurchaseContract}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {purchaseContractLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : purchaseContract ? (
          <Descriptions column={2}>
            <Descriptions.Item label="合同编号">{purchaseContract.no}</Descriptions.Item>
            <Descriptions.Item label="合同状态">
              {statusMap[purchaseContract.status]?.text || purchaseContract.status}
            </Descriptions.Item>
            <Descriptions.Item label="产品名称">{purchaseContract.product_name}</Descriptions.Item>
            <Descriptions.Item label="供应商">{purchaseContract.expand?.supplier?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="签订日期">{purchaseContract.sign_date?.split(' ')[0]}</Descriptions.Item>
            <Descriptions.Item label="合同金额">¥{purchaseContract.total_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="产品单价">¥{purchaseContract.unit_price?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="产品数量">{purchaseContract.total_quantity} 吨</Descriptions.Item>
          </Descriptions>
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无数据</div>
        )}
      </Modal>
    </div>
  );
};

export default ContractDetail;
