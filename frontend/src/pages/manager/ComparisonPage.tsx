import React, { useState, useEffect, useCallback } from 'react';
import { Card, Select, Table, Descriptions, Progress, Tag, Spin, App, Empty, Alert } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ComparisonAPI } from '@/api/comparison';
import type { 
  ComparisonSalesContract, 
  ComparisonPurchaseContract, 
  ProgressComparison, 
  ProfitAnalysis,
  ProgressDetailType,
  ProgressShipmentPerContract,
  ProgressPaymentPerContract,
  ProgressInvoicePerContract
} from '@/types/comparison';

export const ComparisonPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [salesContracts, setSalesContracts] = useState<ComparisonSalesContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [selectedContract, setSelectedContract] = useState<ComparisonSalesContract | null>(null);
  const [purchaseContracts, setPurchaseContracts] = useState<ComparisonPurchaseContract[]>([]);
  const [progress, setProgress] = useState<ProgressComparison | null>(null);
  const [profit, setProfit] = useState<ProfitAnalysis>({ 
    unit_profit: 0, 
    total_profit: 0,
    sales_amount: 0,
    purchase_amount: 0,
    sales_quantity: 0,
    purchase_quantity: 0,
    total_freight: 0,
    total_miscellaneous: 0,
    is_quantity_matched: true,
  });
  const [loading, setLoading] = useState(false);
  const [contractsLoading, setContractsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setContractsLoading(true);
    
    const fetchSalesContracts = async () => {
      try {
        const result = await ComparisonAPI.getSalesContracts();
        if (!cancelled) {
          console.log('Sales contracts:', result.items);
          setSalesContracts(result.items as unknown as ComparisonSalesContract[]);
        }
      } catch (error) {
        const err = error as { status?: number; message?: string; response?: { status?: number } };
        // Ignore aborted requests (component unmounted during request)
        if (err.status === 0 || err.message?.includes('aborted') || err.response?.status === 0) {
          return;
        }
        console.error('Fetch sales contracts error:', error);
        message.error('加载销售合同失败');
      } finally {
        if (!cancelled) {
          setContractsLoading(false);
        }
      }
    };
    
    fetchSalesContracts();
    
    const urlContractId = searchParams.get('contractId');
    if (urlContractId) {
      setSelectedContractId(urlContractId);
    }
    
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleContractChange = (contractId: string) => {
    setSelectedContractId(contractId);
    if (contractId) {
      setSearchParams({ contractId });
    } else {
      setSearchParams({});
    }
  };

  const loadComparisonData = useCallback(async (contractId: string) => {
    if (!contractId) {
      setPurchaseContracts([]);
      setProgress(null);
      setProfit({ 
        unit_profit: 0, 
        total_profit: 0,
        sales_amount: 0,
        purchase_amount: 0,
        sales_quantity: 0,
        purchase_quantity: 0,
        total_freight: 0,
        total_miscellaneous: 0,
        is_quantity_matched: true,
      });
      return;
    }

    setLoading(true);
    try {
      const data = await ComparisonAPI.getComparisonData(contractId);
      setPurchaseContracts(data.purchase_contracts);
      setProgress(data.progress);
      setProfit(data.profit);
      setSelectedContract(data.sales_contract);
    } catch (error) {
      const err = error as { status?: number; message?: string; response?: { status?: number } };
      if (err.status === 0 || err.message?.includes('aborted') || err.response?.status === 0) {
        return;
      }
      console.error('Fetch comparison data error:', error);
      message.error('加载对比数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedContractId) {
      loadComparisonData(selectedContractId);
    }
  }, [selectedContractId, loadComparisonData]);

  const handleProgressClick = (type: ProgressDetailType) => {
    if (selectedContractId) {
      navigate(`/manager/comparison/${type}?contractId=${selectedContractId}`);
    }
  };

  const purchaseColumns = [
    { title: '合同编号', dataIndex: 'no', key: 'no', width: 150 },
    { title: '产品名称', dataIndex: 'product_name', key: 'product_name' },
    { 
      title: '供应商', 
      key: 'supplier',
      render: (_: unknown, record: ComparisonPurchaseContract) => record.expand?.supplier?.name || '-',
    },
    { title: '签订日期', dataIndex: 'sign_date', key: 'sign_date', width: 120 },
    { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 100,
      render: (val: number) => val ? `¥${val.toLocaleString()}` : '-',
    },
    { title: '总数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 100,
      render: (val: number) => val ? `${val} 吨` : '-',
    },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 120,
      render: (val: number) => val ? `¥${val.toLocaleString()}` : '-',
    },
    { title: '已执行数量', dataIndex: 'executed_quantity', key: 'executed_quantity', width: 110,
      render: (val: number) => val ? `${val} 吨` : '-',
    },
    { title: '已付款金额', dataIndex: 'paid_amount', key: 'paid_amount', width: 110,
      render: (val: number) => val ? `¥${val.toLocaleString()}` : '-',
    },
    { title: '已收票金额', dataIndex: 'invoiced_amount', key: 'invoiced_amount', width: 110,
      render: (val: number) => val ? `¥${val.toLocaleString()}` : '-',
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

  const formatCurrency = (value: number) => `¥${value?.toLocaleString() || 0}`;

  return (
    <div style={{ padding: 0 }}>
      <Card 
        style={{ 
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          marginBottom: 16,
        }}
        bodyStyle={{ padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 14, color: '#333' }}>选择销售合同：</span>
          <Select
            placeholder="请选择销售合同"
            style={{ width: 400 }}
            loading={contractsLoading}
            value={selectedContractId || undefined}
            onChange={handleContractChange}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {salesContracts.map((contract) => (
              <Select.Option key={contract.id} value={contract.id}>
                {contract.no} - {contract.product_name}
              </Select.Option>
            ))}
          </Select>
        </div>
      </Card>

      {selectedContractId && (
        <Spin spinning={loading}>
          {purchaseContracts.length === 0 ? (
            <Card 
              style={{ 
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
              bodyStyle={{ padding: 48, textAlign: 'center' }}
            >
              <Empty description="暂无关联的采购合同" />
            </Card>
          ) : (
            <>
              {selectedContract && (
                <Card 
                  title="销售合同信息"
                  style={{ 
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    marginBottom: 16,
                  }}
                  bodyStyle={{ padding: 16 }}
                >
                  <Descriptions column={3} bordered size="small">
                    <Descriptions.Item label="合同编号">{selectedContract.no}</Descriptions.Item>
                    <Descriptions.Item label="产品名称">{selectedContract.product_name}</Descriptions.Item>
                    <Descriptions.Item label="客户">{selectedContract.expand?.customer?.name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="签订日期">{selectedContract.sign_date}</Descriptions.Item>
                    <Descriptions.Item label="产品单价">{formatCurrency(selectedContract.unit_price)}</Descriptions.Item>
                    <Descriptions.Item label="总数量">{selectedContract.total_quantity} 吨</Descriptions.Item>
                    <Descriptions.Item label="总金额">{formatCurrency(selectedContract.total_amount)}</Descriptions.Item>
                    <Descriptions.Item label="已发货数量">{selectedContract.executed_quantity} 吨</Descriptions.Item>
                    <Descriptions.Item label="已收款金额">{formatCurrency(selectedContract.receipted_amount)}</Descriptions.Item>
                    <Descriptions.Item label="已开票金额">{formatCurrency(selectedContract.invoiced_amount)}</Descriptions.Item>
                    <Descriptions.Item label="欠款金额">
                      <span style={{ color: selectedContract.debt_amount > 0 ? '#ff4d4f' : '#52c41a' }}>
                        {formatCurrency(selectedContract.debt_amount)}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color={selectedContract.status === 'executing' ? 'blue' : selectedContract.status === 'completed' ? 'green' : 'red'}>
                        {selectedContract.status === 'executing' ? '执行中' : selectedContract.status === 'completed' ? '已完成' : '已取消'}
                      </Tag>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              )}

              <Card 
                title="关联的采购合同"
                style={{ 
                  borderRadius: 12,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  marginBottom: 16,
                }}
                bodyStyle={{ padding: 16 }}
              >
                <Table 
                  columns={purchaseColumns} 
                  dataSource={purchaseContracts} 
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </Card>

              <Card 
                title="进度对比"
                style={{ 
                  borderRadius: 12,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  marginBottom: 16,
                }}
                bodyStyle={{ padding: 24 }}
              >
                {(() => {
                  const salesQty = selectedContract?.total_quantity || 0;
                  const salesAmt = selectedContract?.total_amount || 0;
                  const shipmentPerContract = progress?.shipment_per_contract || [];
                  const paymentPerContract = progress?.payment_per_contract || [];
                  const invoicePerContract = progress?.invoice_per_contract || [];
                  return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                  <div 
                    style={{ 
                      padding: 16, 
                      borderRadius: 8, 
                      background: '#f5f5f5',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                    }}
                    onClick={() => handleProgressClick('shipment')}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#e8e8e8'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#f5f5f5'}
                  >
                    <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>客户到货 vs 采购发货</div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>客户到货 ({progress?.shipment.sales_quantity || 0}/{salesQty} 吨)</div>
                      <Progress 
                        percent={salesQty > 0 ? Math.round((progress?.shipment.sales_quantity || 0) / salesQty * 100) : 0}
                        strokeColor="#1890ff"
                        size="small"
                      />
                    </div>
                    {shipmentPerContract.map((item: ProgressShipmentPerContract) => (
                      <div key={item.purchase_contract_id} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>
                          采购发货 - {item.purchase_contract_no} ({item.purchase_executed_quantity}/{item.purchase_total_quantity} 吨)
                        </div>
                        <Progress 
                          percent={Math.round(item.purchase_percentage)}
                          strokeColor="#52c41a"
                          size="small"
                        />
                      </div>
                    ))}
                  </div>

                  <div 
                    style={{ 
                      padding: 16, 
                      borderRadius: 8, 
                      background: '#f5f5f5',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                    }}
                    onClick={() => handleProgressClick('payment')}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#e8e8e8'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#f5f5f5'}
                  >
                    <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>收款 vs 付款</div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>销售收款 ({formatCurrency(progress?.payment.sales_amount || 0)}/{formatCurrency(salesAmt)})</div>
                      <Progress 
                        percent={salesAmt > 0 ? Math.round((progress?.payment.sales_amount || 0) / salesAmt * 100) : 0}
                        strokeColor="#1890ff"
                        size="small"
                      />
                    </div>
                    {paymentPerContract.map((item: ProgressPaymentPerContract) => (
                      <div key={item.purchase_contract_id} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>
                          采购付款 - {item.purchase_contract_no} ({formatCurrency(item.purchase_paid_amount)}/{formatCurrency(item.purchase_total_amount)})
                        </div>
                        <Progress 
                          percent={Math.round(item.purchase_percentage)}
                          strokeColor="#52c41a"
                          size="small"
                        />
                      </div>
                    ))}
                  </div>

                  <div 
                    style={{ 
                      padding: 16, 
                      borderRadius: 8, 
                      background: '#f5f5f5',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                    }}
                    onClick={() => handleProgressClick('invoice')}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#e8e8e8'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#f5f5f5'}
                  >
                    <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>开票 vs 收票</div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>销售开票 ({formatCurrency(progress?.invoice.sales_amount || 0)}/{formatCurrency(salesAmt)})</div>
                      <Progress 
                        percent={salesAmt > 0 ? Math.round((progress?.invoice.sales_amount || 0) / salesAmt * 100) : 0}
                        strokeColor="#1890ff"
                        size="small"
                      />
                    </div>
                    {invoicePerContract.map((item: ProgressInvoicePerContract) => (
                      <div key={item.purchase_contract_id} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>
                          采购收票 - {item.purchase_contract_no} ({formatCurrency(item.purchase_invoiced_amount)}/{formatCurrency(item.purchase_total_amount)})
                        </div>
                        <Progress 
                          percent={Math.round(item.purchase_percentage)}
                          strokeColor="#52c41a"
                          size="small"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                  );
                })()}
                <div style={{ marginTop: 12, fontSize: 12, color: '#999', textAlign: 'center' }}>
                  点击查看详情
                </div>
              </Card>

              <Card 
                title="利润分析"
                style={{ 
                  borderRadius: 12,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
                bodyStyle={{ padding: 24 }}
              >
                {!profit.is_quantity_matched && (
                  <Alert
                    message="数量不匹配"
                    description={`销售合同总数量 (${profit.sales_quantity} 吨) 与采购合同总数量之和 (${profit.purchase_quantity} 吨) 不相等，无法准确计算利润。`}
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                )}
                <Descriptions column={4} bordered size="small">
                  <Descriptions.Item label="销售总数量">
                    {profit.sales_quantity} 吨
                  </Descriptions.Item>
                  <Descriptions.Item label="采购总数量">
                    {profit.purchase_quantity} 吨
                  </Descriptions.Item>
                  <Descriptions.Item label="销售总金额（含税）">
                    {formatCurrency(profit.sales_amount)}
                  </Descriptions.Item>
                  <Descriptions.Item label="采购总金额（含税）">
                    {formatCurrency(profit.purchase_amount)}
                  </Descriptions.Item>
                  <Descriptions.Item label="销售总金额（不含税）">
                    {formatCurrency(profit.sales_amount / 1.13)}
                  </Descriptions.Item>
                  <Descriptions.Item label="采购总金额（不含税）">
                    {formatCurrency(profit.purchase_amount / 1.13)}
                  </Descriptions.Item>
                  <Descriptions.Item label="运费合计">
                    {formatCurrency(profit.total_freight)}
                  </Descriptions.Item>
                  <Descriptions.Item label="杂费合计">
                    {formatCurrency(profit.total_miscellaneous)}
                  </Descriptions.Item>
                  <Descriptions.Item label="单价利润">
                    <span style={{ color: profit.unit_profit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>
                      {formatCurrency(profit.unit_profit)}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="营业利润">
                    <span style={{ color: profit.total_profit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>
                      {formatCurrency(profit.total_profit)}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="税额">
                    {(() => {
                      const tax = (profit.sales_amount - profit.purchase_amount) * 0.1881;
                      return <span style={{ fontWeight: 'bold' }}>{formatCurrency(tax)}</span>;
                    })()}
                  </Descriptions.Item>
                  <Descriptions.Item label="净利润">
                    {(() => {
                      const tax = (profit.sales_amount - profit.purchase_amount) * 0.1881;
                      const netProfit = profit.sales_amount / 1.13 - profit.purchase_amount / 1.13 - tax - profit.total_freight - profit.total_miscellaneous;
                      return (
                        <span style={{ color: netProfit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>
                          {formatCurrency(netProfit)}
                        </span>
                      );
                    })()}
                  </Descriptions.Item>
                </Descriptions>
                <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
                  营业利润 = 销售含税总价 ÷ 1.13 - 采购含税总价 ÷ 1.13 - 运费合计 - 杂费合计
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  税额 = (销售含税总价 - 采购含税总价) × 0.1881，净利润 = 销售含税总价 ÷ 1.13 - 采购含税总价 ÷ 1.13 - 税额 - 运费 - 杂费
                </div>
              </Card>
            </>
          )}
        </Spin>
      )}
    </div>
  );
};

export default ComparisonPage;
