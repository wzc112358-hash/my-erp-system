import React, { useState, useEffect } from 'react';
import { Card, Table, Empty, Spin, App, Button } from 'antd';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { LeftOutlined } from '@ant-design/icons';
import { ComparisonAPI } from '@/api/comparison';
import type { ProgressDetailType } from '@/types/comparison';

interface DetailRecord {
  id: string;
  [key: string]: unknown;
}

const getColumnsByType = (type: ProgressDetailType) => {
  switch (type) {
    case 'shipment':
      return [
        { title: '运输合同号', dataIndex: 'tracking_contract_no', key: 'tracking_contract_no' },
        { title: '日期', dataIndex: 'date', key: 'date' },
        { title: '数量(吨)', dataIndex: 'quantity', key: 'quantity', render: (v: number) => v?.toFixed(2) },
        { title: '物流公司', dataIndex: 'logistics_company', key: 'logistics_company' },
      ];
    case 'payment':
      return [
        { title: '日期', dataIndex: 'receipt_date', key: 'receipt_date' },
        { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `¥${v?.toLocaleString()}` },
        { title: '数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v?.toFixed(2) },
        { title: '收款方式', dataIndex: 'method', key: 'method' },
      ];
    case 'invoice':
      return [
        { title: '发票号码', dataIndex: 'no', key: 'no' },
        { title: '日期', dataIndex: 'issue_date', key: 'issue_date' },
        { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `¥${v?.toLocaleString()}` },
        { title: '数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v?.toFixed(2) },
      ];
    default:
      return [];
  }
};

const getPurchaseColumnsByType = (type: ProgressDetailType) => {
  switch (type) {
    case 'shipment':
      return [
        { title: '运输合同号', dataIndex: 'tracking_contract_no', key: 'tracking_contract_no' },
        { title: '发货日期', dataIndex: 'shipment_date', key: 'shipment_date' },
        { title: '数量(吨)', dataIndex: 'quantity', key: 'quantity', render: (v: number) => v?.toFixed(2) },
        { title: '物流公司', dataIndex: 'logistics_company', key: 'logistics_company' },
      ];
    case 'payment':
      return [
        { title: '付款日期', dataIndex: 'pay_date', key: 'pay_date' },
        { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `¥${v?.toLocaleString()}` },
        { title: '数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v?.toFixed(2) },
        { title: '付款方式', dataIndex: 'method', key: 'method' },
      ];
    case 'invoice':
      return [
        { title: '发票号码', dataIndex: 'no', key: 'no' },
        { title: '收票日期', dataIndex: 'receive_date', key: 'receive_date' },
        { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `¥${v?.toLocaleString()}` },
        { title: '数量(吨)', dataIndex: 'product_amount', key: 'product_amount', render: (v: number) => v?.toFixed(2) },
      ];
    default:
      return [];
  }
};

const getTitleByType = (type: ProgressDetailType) => {
  switch (type) {
    case 'shipment':
      return '发货 vs 到货详情';
    case 'payment':
      return '收款 vs 付款详情';
    case 'invoice':
      return '开票 vs 收票详情';
    default:
      return '详情';
  }
};

const getSalesLabel = (type: ProgressDetailType) => {
  switch (type) {
    case 'shipment':
      return '销售发货';
    case 'payment':
      return '销售收款';
    case 'invoice':
      return '销售开票';
    default:
      return '销售';
  }
};

const getPurchaseLabel = (type: ProgressDetailType) => {
  switch (type) {
    case 'shipment':
      return '采购到货';
    case 'payment':
      return '采购付款';
    case 'invoice':
      return '采购收票';
    default:
      return '采购';
  }
};

export const ProgressDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { type } = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const contractId = searchParams.get('contractId');

  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState<DetailRecord[]>([]);
  const [purchaseData, setPurchaseData] = useState<DetailRecord[]>([]);

  const detailType = (type as ProgressDetailType) || 'shipment';

  useEffect(() => {
    if (!contractId || !type) {
      navigate('/manager/comparison');
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchData = async () => {
      try {
        const data = await ComparisonAPI.getProgressDetail(contractId, detailType);
        if (!cancelled) {
          setSalesData(data.sales as DetailRecord[]);
          setPurchaseData(data.purchase as DetailRecord[]);
        }
      } catch (error) {
        const err = error as { status?: number; message?: string; response?: { status?: number } };
        if (err.status === 0 || err.message?.includes('aborted') || err.response?.status === 0) {
          return;
        }
        console.error('Fetch detail error:', error);
        if (err.response?.status === 400) {
          message.error('请求参数错误，请重试');
        } else {
          message.error('加载详情失败');
        }
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
  }, [contractId, detailType, message, navigate, type]);

  return (
    <div style={{ padding: 0 }}>
      <Card 
        title={getTitleByType(detailType)}
        extra={
          <Button 
            type="primary" 
            icon={<LeftOutlined />} 
            onClick={() => {
              const contractId = searchParams.get('contractId');
              if (contractId) {
                navigate(`/manager/comparison?contractId=${contractId}`);
              } else {
                navigate('/manager/comparison');
              }
            }}
          >
            返回
          </Button>
        }
        style={{ 
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
        bodyStyle={{ padding: 24 }}
      >
        <Spin spinning={loading}>
          <div style={{ marginBottom: 24 }}>
            <h3>{getSalesLabel(detailType)}记录 ({salesData.length})</h3>
            {salesData.length === 0 ? (
              <Empty description={`暂无${getSalesLabel(detailType)}记录`} />
            ) : (
              <Table 
                columns={getColumnsByType(detailType)} 
                dataSource={salesData} 
                rowKey="id"
                pagination={false}
                size="small"
              />
            )}
          </div>

          <div>
            <h3>{getPurchaseLabel(detailType)}记录 ({purchaseData.length})</h3>
            {purchaseData.length === 0 ? (
              <Empty description={`暂无${getPurchaseLabel(detailType)}记录`} />
            ) : (
              <Table 
                columns={getPurchaseColumnsByType(detailType)} 
                dataSource={purchaseData} 
                rowKey="id"
                pagination={false}
                size="small"
              />
            )}
          </div>
        </Spin>
      </Card>
    </div>
  );
};

export default ProgressDetailPage;
