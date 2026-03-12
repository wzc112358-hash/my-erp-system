import React, { useState, useEffect } from 'react';
import { Card, Table, Tabs, Input, Select, Tag, Modal, Descriptions, Spin, App, Progress } from 'antd';
import { ProgressAPI } from '@/api/progress';
import type { SalesContract } from '@/types/sales-contract';
import type { PurchaseContract } from '@/types/purchase-contract';
import type { ContractListParams } from '@/types/progress';
import type { SalesShipment, SaleInvoice, SaleReceipt } from '@/types/sales-contract';
import type { PurchaseArrival, PurchaseInvoice, PurchasePayment } from '@/types/purchase-contract';

const { Search } = Input;
const { TabPane } = Tabs;

interface SalesDetailData {
  contract: SalesContract;
  shipments: SalesShipment[];
  invoices: SaleInvoice[];
  receipts: SaleReceipt[];
}

interface PurchaseDetailData {
  contract: PurchaseContract;
  arrivals: PurchaseArrival[];
  invoices: PurchaseInvoice[];
  payments: PurchasePayment[];
}

export const ProgressPage: React.FC = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState('sales');
  const [salesData, setSalesData] = useState<SalesContract[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<ContractListParams>({
    page: 1,
    per_page: 20,
  });
  const [total, setTotal] = useState(0);
  const [detailVisible, setDetailVisible] = useState(false);
  const [contractType, setContractType] = useState<'sales' | 'purchase'>('sales');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<SalesDetailData | PurchaseDetailData | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    
    const fetchData = async () => {
      try {
        if (activeTab === 'sales') {
          const result = await ProgressAPI.getSalesContracts(params);
          if (!cancelled) {
            setSalesData(result.items);
            setTotal(result.totalItems);
          }
        } else {
          const result = await ProgressAPI.getPurchaseContracts(params);
          if (!cancelled) {
            setPurchaseData(result.items);
            setTotal(result.totalItems);
          }
        }
      } catch (error) {
        const err = error as { response?: { status?: number }; message?: string };
        if (err.response?.status === 0 || err.message?.includes('aborted')) {
          return;
        }
        console.error('Fetch error:', error);
        message.error('加载失败');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      cancelled = true;
    };
  }, [activeTab, fetchKey]);

  const handleSearch = (value: string) => {
    setParams((prev) => ({ ...prev, keyword: value, page: 1 }));
    setFetchKey((k) => k + 1);
  };

  const handleStatusChange = (value: string | undefined) => {
    setParams((prev) => ({ ...prev, status: value, page: 1 }));
    setFetchKey((k) => k + 1);
  };

  const handlePageChange = (page: number, pageSize: number) => {
    setParams((prev) => ({ ...prev, page, per_page: pageSize }));
    setFetchKey((k) => k + 1);
  };

  const handleRowClick = async (record: SalesContract | PurchaseContract, type: 'sales' | 'purchase') => {
    setContractType(type);
    setDetailVisible(true);
    setDetailLoading(true);
    setDetailData(null);

    try {
      if (type === 'sales') {
        const data = await ProgressAPI.getSalesContractDetail(record.id);
        setDetailData(data as SalesDetailData);
      } else {
        const data = await ProgressAPI.getPurchaseContractDetail(record.id);
        setDetailData(data as PurchaseDetailData);
      }
    } catch (error) {
      const err = error as { response?: { status?: number }; message?: string };
      if (err.response?.status === 0 || err.message?.includes('aborted')) {
        return;
      }
      console.error('Fetch detail error:', error);
      message.error('加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const salesColumns = [
    { title: '合同编号', dataIndex: 'no', key: 'no', width: 150 },
    { title: '产品名称', dataIndex: 'product_name', key: 'product_name' },
    { 
      title: '客户', 
      key: 'customer',
      render: (_: unknown, record: SalesContract) => record.expand?.customer?.name || '-',
    },
    { title: '签订日期', dataIndex: 'sign_date', key: 'sign_date', width: 120 },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 120,
      render: (val: number) => val ? `¥${val.toLocaleString()}` : '-',
    },
    { 
      title: '到货进度', 
      key: 'execution',
      width: 120,
      render: (_: unknown, record: SalesContract) => (
        <Progress 
          percent={record.execution_percent || 0} 
          size="small"
          format={(percent) => `${percent || 0}%`}
        />
      ),
    },
    { 
      title: '收款进度', 
      key: 'receipt',
      width: 120,
      render: (_: unknown, record: SalesContract) => (
        <Progress 
          percent={record.receipt_percent || 0} 
          size="small"
          format={(percent) => `${percent || 0}%`}
        />
      ),
    },
    { 
      title: '开票进度', 
      key: 'invoice',
      width: 120,
      render: (_: unknown, record: SalesContract) => (
        <Progress 
          percent={record.invoice_percent || 0} 
          size="small"
          format={(percent) => `${percent || 0}%`}
        />
      ),
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'executing' ? 'blue' : status === 'completed' ? 'green' : 'red'}>
          {status === 'executing' ? '执行中' : status === 'completed' ? '已完成' : '已取消'}
        </Tag>
      ),
    },
  ];

  const purchaseColumns = [
    { title: '合同编号', dataIndex: 'no', key: 'no', width: 150 },
    { title: '产品名称', dataIndex: 'product_name', key: 'product_name' },
    { 
      title: '供应商', 
      key: 'supplier',
      render: (_: unknown, record: PurchaseContract) => record.expand?.supplier?.name || '-',
    },
    { 
      title: '关联销售合同', 
      key: 'sales_contract',
      render: (_: unknown, record: PurchaseContract) => record.expand?.sales_contract?.no || '-',
    },
    { title: '签订日期', dataIndex: 'sign_date', key: 'sign_date', width: 120 },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 120,
      render: (val: number) => val ? `¥${val.toLocaleString()}` : '-',
    },
    { 
      title: '到货进度', 
      key: 'execution',
      width: 120,
      render: (_: unknown, record: PurchaseContract) => (
        <Progress 
          percent={record.execution_percent || 0} 
          size="small"
          format={(percent) => `${percent || 0}%`}
        />
      ),
    },
    { 
      title: '收票进度', 
      key: 'invoiced',
      width: 120,
      render: (_: unknown, record: PurchaseContract) => (
        <Progress 
          percent={record.invoiced_percent || 0} 
          size="small"
          format={(percent) => `${percent || 0}%`}
        />
      ),
    },
    { 
      title: '付款进度', 
      key: 'paid',
      width: 120,
      render: (_: unknown, record: PurchaseContract) => (
        <Progress 
          percent={record.paid_percent || 0} 
          size="small"
          format={(percent) => `${percent || 0}%`}
        />
      ),
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'executing' ? 'blue' : status === 'completed' ? 'green' : 'red'}>
          {status === 'executing' ? '执行中' : status === 'completed' ? '已完成' : '已取消'}
        </Tag>
      ),
    },
  ];

  const renderDetailContent = () => {
    if (detailLoading) {
      return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
    }

    if (!detailData) return null;

    if (contractType === 'sales' && 'contract' in detailData) {
      const data = detailData as SalesDetailData;
      return (
        <>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="合同编号">{data.contract.no}</Descriptions.Item>
            <Descriptions.Item label="产品名称">{data.contract.product_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{data.contract.expand?.customer?.name}</Descriptions.Item>
            <Descriptions.Item label="签订日期">{data.contract.sign_date}</Descriptions.Item>
            <Descriptions.Item label="总金额">¥{data.contract.total_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="总数量">{data.contract.total_quantity} 吨</Descriptions.Item>
            <Descriptions.Item label="已执行数量">{data.contract.executed_quantity} 吨</Descriptions.Item>
            <Descriptions.Item label="已收款金额">¥{data.contract.receipted_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="已开票金额">¥{data.contract.invoiced_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="欠款金额">¥{data.contract.debt_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={data.contract.status === 'executing' ? 'blue' : data.contract.status === 'completed' ? 'green' : 'red'}>
                {data.contract.status === 'executing' ? '执行中' : data.contract.status === 'completed' ? '已完成' : '已取消'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
          
          <h4 style={{ marginTop: 16 }}>客户到货批次 ({data.shipments.length})</h4>
          <Table
            dataSource={data.shipments}
            columns={[
              { title: '运输合同号', dataIndex: 'tracking_contract_no' },
              { title: '到货日期', dataIndex: 'date' },
              { title: '客户到货数量', dataIndex: 'quantity', render: (qty: number) => qty ? `${qty} 吨` : '-' },
              { title: '物流公司', dataIndex: 'logistics_company' },
              { title: '收货地址', dataIndex: 'delivery_address' },
            ]}
            rowKey="id"
            size="small"
            pagination={false}
          />

          <h4 style={{ marginTop: 16 }}>发票 ({data.invoices.length})</h4>
          <Table
            dataSource={data.invoices}
            columns={[
              { title: '发票号码', dataIndex: 'no' },
              { title: '开票日期', dataIndex: 'issue_date' },
              { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${v?.toLocaleString()}` },
            ]}
            rowKey="id"
            size="small"
            pagination={false}
          />

          <h4 style={{ marginTop: 16 }}>收款记录 ({data.receipts.length})</h4>
          <Table
            dataSource={data.receipts}
            columns={[
              { title: '收款日期', dataIndex: 'receipt_date' },
              { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${v?.toLocaleString()}` },
              { title: '收款方式', dataIndex: 'method' },
            ]}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </>
      );
    }

    if (contractType === 'purchase' && 'contract' in detailData) {
      const data = detailData as PurchaseDetailData;
      return (
        <>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="合同编号">{data.contract.no}</Descriptions.Item>
            <Descriptions.Item label="产品名称">{data.contract.product_name}</Descriptions.Item>
            <Descriptions.Item label="供应商">{data.contract.expand?.supplier?.name}</Descriptions.Item>
            <Descriptions.Item label="关联销售合同">{data.contract.expand?.sales_contract?.no}</Descriptions.Item>
            <Descriptions.Item label="签订日期">{data.contract.sign_date}</Descriptions.Item>
            <Descriptions.Item label="总金额">¥{data.contract.total_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="总数量">{data.contract.total_quantity} 吨</Descriptions.Item>
            <Descriptions.Item label="已执行数量">{data.contract.executed_quantity} 吨</Descriptions.Item>
            <Descriptions.Item label="已收票金额">¥{data.contract.invoiced_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="已付款金额">¥{data.contract.paid_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={data.contract.status === 'executing' ? 'blue' : data.contract.status === 'completed' ? 'green' : 'red'}>
                {data.contract.status === 'executing' ? '执行中' : data.contract.status === 'completed' ? '已完成' : '已取消'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
          
          <h4 style={{ marginTop: 16 }}>运输批次 ({data.arrivals.length})</h4>
          <Table
            dataSource={data.arrivals}
            columns={[
              { title: '运输合同号', dataIndex: 'tracking_contract_no' },
              { title: '发货日期', dataIndex: 'shipment_date' },
              { title: '到货数量', dataIndex: 'quantity', render: (qty: number) => qty ? `${qty} 吨` : '-' },
              { title: '物流公司', dataIndex: 'logistics_company' },
              { title: '发货地址', dataIndex: 'shipment_address' },
              { title: '收货地址', dataIndex: 'delivery_address' },
              { title: '中专站', dataIndex: 'wether_transit', render: (v: string) => v === 'yes' ? '是' : '否' },
              { title: '中专仓库', dataIndex: 'transit_warehouse' },
              { title: '杂费', dataIndex: 'miscellaneous_expenses', render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
              { title: '运费1', dataIndex: 'freight_1', render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
              { title: '运费1状态', dataIndex: 'freight_1_status', render: (v: string) => v === 'paid' ? '已付' : '未付' },
              { title: '运费2', dataIndex: 'freight_2', render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
              { title: '运费2状态', dataIndex: 'freight_2_status', render: (v: string) => v === 'paid' ? '已付' : (v === 'unpaid' ? '未付' : '-') },
              { title: '发票1状态', dataIndex: 'invoice_1_status', render: (v: string) => v === 'issued' ? '已开' : '未开' },
              { title: '发票2状态', dataIndex: 'invoice_2_status', render: (v: string) => v === 'issued' ? '已开' : (v === 'unissued' ? '未开' : '-') },
            ]}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 1800 }}
          />

          <h4 style={{ marginTop: 16 }}>收票 ({data.invoices.length})</h4>
          <Table
            dataSource={data.invoices}
            columns={[
              { title: '发票号码', dataIndex: 'no' },
              { title: '收票日期', dataIndex: 'receive_date' },
              { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${v?.toLocaleString()}` },
            ]}
            rowKey="id"
            size="small"
            pagination={false}
          />

          <h4 style={{ marginTop: 16 }}>付款记录 ({data.payments.length})</h4>
          <Table
            dataSource={data.payments}
            columns={[
              { title: '付款日期', dataIndex: 'pay_date' },
              { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${v?.toLocaleString()}` },
              { title: '付款方式', dataIndex: 'method' },
            ]}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </>
      );
    }

    return null;
  };

  return (
    <div style={{ padding: 0 }}>
      <Card 
        style={{ 
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
        bodyStyle={{ padding: 24 }}
      >
        <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Search 
            placeholder="搜索合同编号或产品名称" 
            onSearch={handleSearch} 
            style={{ width: 300 }} 
            allowClear
          />
          <Select 
            placeholder="筛选状态" 
            allowClear 
            onChange={handleStatusChange} 
            style={{ width: 150 }}
            value={params.status}
          >
            <Select.Option value="executing">执行中</Select.Option>
            <Select.Option value="completed">已完成</Select.Option>
            <Select.Option value="cancelled">已取消</Select.Option>
          </Select>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab={`销售合同 (${activeTab === 'sales' ? total : '-'})`} key="sales">
            <Table 
              columns={salesColumns} 
              dataSource={salesData} 
              loading={loading}
              rowKey="id"
              onRow={(record) => ({
                onClick: () => handleRowClick(record, 'sales'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: params.page,
                pageSize: params.per_page,
                total: total,
                onChange: handlePageChange,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
              }}
              scroll={{ x: 1200 }}
            />
          </TabPane>
          <TabPane tab={`采购合同 (${activeTab === 'purchase' ? total : '-'})`} key="purchase">
            <Table 
              columns={purchaseColumns} 
              dataSource={purchaseData} 
              loading={loading}
              rowKey="id"
              onRow={(record) => ({
                onClick: () => handleRowClick(record, 'purchase'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: params.page,
                pageSize: params.per_page,
                total: total,
                onChange: handlePageChange,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
              }}
              scroll={{ x: 1400 }}
            />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title={`${contractType === 'sales' ? '销售' : '采购'}合同详情`}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={900}
      >
        {renderDetailContent()}
      </Modal>
    </div>
  );
};

export default ProgressPage;
