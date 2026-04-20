import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, App, Spin, Divider, Flex } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { PurchaseArrivalAPI } from '@/api/purchase-arrival';
import type { PurchaseArrival } from '@/types/purchase-arrival';

export const ArrivalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [arrival, setArrival] = useState<PurchaseArrival | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);

  useEffect(() => { getUsdToCnyRate().then(setExchangeRate); }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const data = await PurchaseArrivalAPI.getById(id);
        setArrival(data);
      } catch (error) {
        const err = error as { name?: string; message?: string; cause?: { name?: string } };
        const isAborted =
          err.name === 'AbortError' ||
          err.name === 'CanceledError' ||
          err.message?.includes('aborted') ||
          err.message?.includes('autocancelled') ||
          err.cause?.name === 'AbortError';
        if (!isAborted) {
          console.error('Fetch arrival error:', error);
          message.error('加载到货详情失败');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, message]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!arrival) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchase/arrivals')}>
          返回列表
        </Button>
        <p>未找到到货记录</p>
      </div>
    );
  }

  const isCB = arrival.expand?.purchase_contract?.is_cross_border === true;
  const fmtAmt = (v: number) => isCB
    ? `$${v.toFixed(4)}（≈ ¥${(v * exchangeRate).toFixed(4)}）`
    : `¥${v.toFixed(4)}`;

  // Helper to display freight/misc with currency conversion
  const fmtFreight = (amount: number, currency: 'USD' | 'CNY' | undefined) => {
    const c = currency || 'CNY';
    if (c === 'USD') {
      return `$${amount.toFixed(4)}（≈ ¥${(amount * exchangeRate).toFixed(4)}）`;
    }
    return `¥${amount.toFixed(4)}（≈ $${(amount / exchangeRate).toFixed(4)}）`;
  };

  return (
    <div style={{ padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/purchase/arrivals')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card title="到货详情">
        <Descriptions bordered column={2}>
          <Descriptions.Item label="运输合同号" span={1}>
            {arrival.tracking_contract_no}
          </Descriptions.Item>
          <Descriptions.Item label="产品名称" span={1}>
            {arrival.product_name}
          </Descriptions.Item>
          <Descriptions.Item label="关联采购合同编号" span={1}>
            {arrival.expand?.purchase_contract?.no || '-'}
          </Descriptions.Item>
          {arrival.expand?.sales_contract && (
            <Descriptions.Item label="关联销售合同编号" span={1}>
              {arrival.expand.sales_contract.no}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="发货日期" span={1}>
            {arrival.shipment_date}
          </Descriptions.Item>
          <Descriptions.Item label="到货数量" span={1}>
            {arrival.quantity} 吨
          </Descriptions.Item>
          <Descriptions.Item label="物流公司" span={1}>
            {arrival.logistics_company}
          </Descriptions.Item>
          <Descriptions.Item label="是否有中转站" span={1}>
            {arrival.wether_transit === 'yes' ? '是' : '否'}
          </Descriptions.Item>
          {arrival.wether_transit === 'yes' && arrival.transit_warehouse && (
            <Descriptions.Item label="中转仓库" span={2}>
              {arrival.transit_warehouse}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="发货地址" span={2}>
            {arrival.shipment_address}
          </Descriptions.Item>
          <Descriptions.Item label="收货地址" span={2}>
            {arrival.delivery_address}
          </Descriptions.Item>
          <Descriptions.Item label="运费金额1" span={1}>
            {fmtFreight(arrival.freight_1 || 0, arrival.freight_1_currency)}
          </Descriptions.Item>
          <Descriptions.Item label="运费1状态" span={1}>
            {arrival.freight_1_status === 'paid' ? '已付' : '未付'}
          </Descriptions.Item>
          <Descriptions.Item label="运费1付款日期" span={1}>
            {arrival.freight_1_date || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="杂费" span={1}>
            {fmtFreight(arrival.miscellaneous_expenses || 0, arrival.miscellaneous_expenses_currency)}
          </Descriptions.Item>
          {arrival.wether_transit === 'yes' && (
            <>
              <Descriptions.Item label="运费金额2" span={1}>
                {fmtFreight(arrival.freight_2 || 0, arrival.freight_2_currency)}
              </Descriptions.Item>
              <Descriptions.Item label="运费2状态" span={1}>
                {arrival.freight_2_status === 'paid' ? '已付' : '未付'}
              </Descriptions.Item>
              <Descriptions.Item label="运费2付款日期" span={1}>
                {arrival.freight_2_date || '-'}
              </Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="发票1状态" span={1}>
            {arrival.invoice_1_status === 'issued' ? '已开' : '未开'}
          </Descriptions.Item>
          {arrival.wether_transit === 'yes' && (
            <Descriptions.Item label="发票2状态" span={1}>
              {arrival.invoice_2_status === 'issued' ? '已开' : '未开'}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="备注" span={2}>
            {arrival.remark || '-'}
          </Descriptions.Item>
        </Descriptions>

        {arrival.expand?.purchase_contract && (
          <>
            <Divider>关联采购合同信息</Divider>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="合同编号" span={1}>
                {arrival.expand.purchase_contract.no}
              </Descriptions.Item>
              <Descriptions.Item label="合同总数量" span={1}>
                {arrival.expand.purchase_contract.total_quantity} 吨
              </Descriptions.Item>
              <Descriptions.Item label="已执行数量" span={1}>
                {arrival.expand.purchase_contract.executed_quantity} 吨
              </Descriptions.Item>
              <Descriptions.Item label="执行进度" span={1}>
                {arrival.expand.purchase_contract.execution_percent?.toFixed(1) || '0'}%
              </Descriptions.Item>
              <Descriptions.Item label={isCB ? '合同总金额（USD）' : '合同总金额'} span={1}>
                {fmtAmt(arrival.expand.purchase_contract.total_amount || 0)}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}

        <Divider>附件</Divider>
        {arrival.attachments && arrival.attachments.length > 0 ? (
          <Flex vertical gap="small">
            {arrival.attachments.map((file: string) => (
                <a
                  key={file}
                  href={`${pb.baseUrl}/api/files/purchase_arrivals/${arrival.id}/${file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <DownloadOutlined /> {file}
                </a>
              ))}
          </Flex>
        ) : (
          <p style={{ color: '#999' }}>暂无附件</p>
        )}
      </Card>
    </div>
  );
};

export default ArrivalDetail;
