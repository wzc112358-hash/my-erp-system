import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Progress, Spin, Row, Col, App, Flex, Button, Modal, Tag } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { SalesContractAPI } from '@/api/sales-contract';
import { PurchaseContractAPI } from '@/api/purchase-contract';
import { BiddingRecordAPI } from '@/api/bidding-record';
import { getUsdToCnyRate, formatCrossBorderAmount } from '@/lib/exchange-rate';
import type { SalesContract, SalesShipment, SaleInvoice, SaleReceipt } from '@/types/sales-contract';
import type { PurchaseContract } from '@/types/purchase-contract';
import type { BiddingRecord } from '@/types/bidding-record';

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
  const [biddingRecords, setBiddingRecords] = useState<BiddingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPurchaseContract, setShowPurchaseContract] = useState(false);
  const [purchaseContract, setPurchaseContract] = useState<PurchaseContract | null>(null);
  const [purchaseContractLoading, setPurchaseContractLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);

  const loadRate = useCallback(() => {
    getUsdToCnyRate().then(setExchangeRate);
  }, []);

  useEffect(() => { loadRate(); }, [loadRate]);

  const isCB = contract?.is_cross_border;
  const fmtAmt = useCallback((v: number) => {
    if (!isCB) return `¥${(v ?? 0).toFixed(6)}`;
    return `$${(v ?? 0).toFixed(6)}（≈ ¥${(v * exchangeRate).toFixed(6)}）`;
  }, [isCB, exchangeRate]);

  // 计算应收金额：合同含税时=合同金额；合同不含税且有含税收款时=合同金额×1.13
  const receivableAmount = contract
    ? contract.is_price_excluding_tax && receipts.some(r => r.is_tax_included)
      ? contract.total_amount * 1.13
      : contract.total_amount
    : 0;

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [contractData, shipmentsData, invoicesData, receiptsData, biddingData] = await Promise.all([
          SalesContractAPI.getById(id),
          SalesContractAPI.getShipments(id),
          SalesContractAPI.getInvoices(id),
          SalesContractAPI.getReceipts(id),
          BiddingRecordAPI.getBySalesContract(id),
        ]);
        setContract(contractData);
        setShipments(shipmentsData.items);
        setInvoices(invoicesData.items);
        setReceipts(receiptsData.items);
        setBiddingRecords(biddingData.items);
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
    { title: '送货地址', dataIndex: 'delivery_address', key: 'delivery_address', render: (v: string) => v || '-' },
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    { title: '操作', key: 'action', render: (_: unknown, record: SalesShipment) => (
      <Button size="small" onClick={() => navigate(`/sales/shipments/${record.id}`)}>查看</Button>
    )},
  ];

  const invoiceColumns = [
    { title: '发票号码', dataIndex: 'no', key: 'no' },
    { title: '发票类型', dataIndex: 'invoice_type', key: 'invoice_type' },
    { title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount' },
    { title: '发票金额', dataIndex: 'amount', key: 'amount', render: (a: number) => {
      if (!a) return '-';
      return formatCrossBorderAmount(a, contract?.is_cross_border || false, exchangeRate);
    } },
    { title: '开票日期', dataIndex: 'issue_date', key: 'issue_date', render: (d: string) => d?.split(' ')[0] },
    { title: '操作', key: 'action', render: (_: unknown, record: SaleInvoice) => (
      <Button size="small" onClick={() => navigate(`/sales/invoices/${record.id}`)}>查看</Button>
    )},
  ];

  const receiptColumns = [
    { title: '收款日期', dataIndex: 'receive_date', key: 'receive_date', render: (d: string) => d?.split(' ')[0] || '-' },
    { title: '收款金额', dataIndex: 'amount', key: 'amount', render: (a: number) => {
      if (!a) return '-';
      return formatCrossBorderAmount(a, contract?.is_cross_border || false, exchangeRate);
    } },
    { title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v || '-' },
    { title: '收款方式', dataIndex: 'method', key: 'method', render: (m: string) => m || '-' },
    { title: '收款账号', dataIndex: 'account', key: 'account', render: (a: string) => a || '-' },
    { title: '操作', key: 'action', render: (_: unknown, record: SaleReceipt) => (
      <Button size="small" onClick={() => navigate(`/sales/receipts/${record.id}`)}>查看</Button>
    )},
  ];

  const bidResultMap: Record<string, { label: string; color: string }> = {
    pending: { label: '待开标', color: 'orange' },
    won: { label: '中标', color: 'green' },
    lost: { label: '未中标', color: 'red' },
  };

  const biddingColumns = [
    { title: '招标公司', dataIndex: 'bidding_company', key: 'bidding_company' },
    { title: '招标编号', dataIndex: 'bidding_no', key: 'bidding_no' },
    { title: '产品名称', dataIndex: 'product_name', key: 'product_name' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity' },
    { title: '标书费', dataIndex: 'tender_fee', key: 'tender_fee', render: (v: number) => v ? `¥${v.toFixed(6)}` : '-' },
    { title: '投标保证金', dataIndex: 'bid_bond', key: 'bid_bond', render: (v: number) => v ? `¥${v.toFixed(6)}` : '-' },
    { title: '开标时间', dataIndex: 'open_date', key: 'open_date', render: (v: string) => v?.split(' ')[0] || '-' },
    { title: '中标结果', dataIndex: 'bid_result', key: 'bid_result', render: (v: string) => {
      const info = bidResultMap[v];
      return info ? <Tag color={info.color}>{info.label}</Tag> : '-';
    }},
    { title: '操作', key: 'action', render: (_: unknown, record: BiddingRecord) => (
      <Button size="small" onClick={() => navigate(`/sales/bidding/${record.id}`)}>查看</Button>
    )},
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
        <Descriptions column={2} bordered size="small">
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
          <Descriptions.Item label={contract.is_price_excluding_tax ? '合同金额（不含税）' : isCB ? '合同金额（USD）' : '合同金额'}>{fmtAmt(contract.total_amount)}</Descriptions.Item>
          <Descriptions.Item label={contract.is_price_excluding_tax ? '产品单价（不含税）' : isCB ? '产品单价（USD）' : '产品单价'}>{fmtAmt(contract.unit_price)}</Descriptions.Item>
          <Descriptions.Item label="产品数量">{contract.total_quantity} 吨</Descriptions.Item>
          <Descriptions.Item label="销售负责人">{contract.sales_manager || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{contract.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="合同附件" span={2}>
            {contract.attachments && contract.attachments.length > 0 ? (
              <Flex vertical gap="small">
                {contract.attachments.map((file: string) => (
                    <a
                      key={file}
                      href={`${pb.baseUrl}/api/files/sales_contracts/${contract.id}/${file}`}
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
        <Col xs={24} sm={12} md={8}>
          <Card 
            title="收款进度" 
            hoverable 
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/sales/receipts?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
          >
            <Progress percent={receivableAmount > 0 ? Number(((contract.receipted_amount || 0) / receivableAmount * 100).toFixed(2)) : 0} status="normal" />
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                {fmtAmt(contract.receipted_amount || 0)} / {fmtAmt(receivableAmount)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card 
              title="开票进度" 
              hoverable 
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/sales/invoices?contractId=${contract.id}&productName=${encodeURIComponent(contract.product_name)}`)}
            >
              <Progress percent={contract.invoice_percent || 0} status="normal" />
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                {fmtAmt(contract.invoiced_amount || 0)} / {fmtAmt(contract.total_amount)}
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="欠款信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="应收金额">{fmtAmt(receivableAmount)}</Descriptions.Item>
          <Descriptions.Item label="已收金额">{fmtAmt(contract.receipted_amount || 0)}</Descriptions.Item>
          <Descriptions.Item label="欠款金额">{fmtAmt(Math.max(0, receivableAmount - (contract.receipted_amount || 0)))}</Descriptions.Item>
          <Descriptions.Item label="收款比例">{receivableAmount > 0 ? ((contract.receipted_amount || 0) / receivableAmount * 100).toFixed(2) : '0.00'}%</Descriptions.Item>
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

      <Card title="收款记录" style={{ marginBottom: 16 }}>
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

      {biddingRecords.length > 0 && (
        <Card title="关联投标记录" style={{ marginBottom: 16 }}>
          <Table
            columns={biddingColumns}
            dataSource={biddingRecords}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>
      )}

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
            <Descriptions.Item label="合同金额">¥{purchaseContract.total_amount?.toFixed(6)}</Descriptions.Item>
            <Descriptions.Item label="产品单价">¥{purchaseContract.unit_price?.toFixed(6)}</Descriptions.Item>
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