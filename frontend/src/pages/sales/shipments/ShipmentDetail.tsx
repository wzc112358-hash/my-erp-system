import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, App, Spin, Divider, Flex } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { SalesShipmentAPI } from '@/api/sales-shipment';
import type { SalesShipment } from '@/types/sales-shipment';

export const ShipmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [shipment, setShipment] = useState<SalesShipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);

  useEffect(() => { getUsdToCnyRate().then(setExchangeRate); }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const data = await SalesShipmentAPI.getById(id);
        setShipment(data);
      } catch (error) {
        const err = error as { name?: string; message?: string; cause?: { name?: string } };
        const isAborted =
          err.name === 'AbortError' ||
          err.name === 'CanceledError' ||
          err.message?.includes('aborted') ||
          err.message?.includes('autocancelled') ||
          err.cause?.name === 'AbortError';
        if (!isAborted) {
          console.error('Fetch shipment error:', error);
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

  if (!shipment) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/shipments')}>
          返回列表
        </Button>
        <p>未找到到货记录</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/sales/shipments')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card title="到货详情">
        <Descriptions bordered column={2}>
          <Descriptions.Item label="运输合同号" span={1}>
            {shipment.tracking_contract_no}
          </Descriptions.Item>
          <Descriptions.Item label="产品名称" span={1}>
            {shipment.product_name}
          </Descriptions.Item>
          <Descriptions.Item label="关联合同编号" span={1}>
            {shipment.expand?.sales_contract?.no || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="到货日期" span={1}>
            {shipment.date}
          </Descriptions.Item>
          <Descriptions.Item label="客户到货数量" span={1}>
            {shipment.quantity} 吨
          </Descriptions.Item>
          <Descriptions.Item label="物流公司" span={1}>
            {shipment.logistics_company}
          </Descriptions.Item>
          <Descriptions.Item label="到货地址" span={2}>
            {shipment.delivery_address}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {shipment.remark || '-'}
          </Descriptions.Item>
        </Descriptions>

        {shipment.expand?.sales_contract && (
          <>
            <Divider>关联销售合同信息</Divider>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="合同编号" span={1}>
                {shipment.expand.sales_contract.no}
              </Descriptions.Item>
              <Descriptions.Item label="合同总数量" span={1}>
                {shipment.expand.sales_contract.total_quantity} 吨
              </Descriptions.Item>
              <Descriptions.Item label="已执行数量" span={1}>
                {shipment.expand.sales_contract.executed_quantity} 吨
              </Descriptions.Item>
              <Descriptions.Item label="到货进度" span={1}>
                {shipment.expand.sales_contract.execution_percent?.toFixed(1) || '0'}%
              </Descriptions.Item>
              <Descriptions.Item label={(() => {
                const sc = shipment.expand!.sales_contract;
                if (sc.is_cross_border) return sc.is_price_excluding_tax ? '合同总金额（不含税，USD）' : '合同总金额（USD）';
                return sc.is_price_excluding_tax ? '合同总金额（不含税）' : '合同总金额';
              })()} span={1}>
                {(() => {
                  const sc = shipment.expand!.sales_contract;
                  const v = sc.total_amount || 0;
                  return sc.is_cross_border
                    ? `$${v.toFixed(4)}（≈ ¥${(v * exchangeRate).toFixed(4)}）`
                    : `¥${v.toFixed(4)}`;
                })()}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}

        <Divider>附件</Divider>
        {shipment.attachments && shipment.attachments.length > 0 ? (
          <Flex vertical gap="small">
            {shipment.attachments.map((file: string) => (
                <a
                  key={file}
                  href={`${pb.baseUrl}/api/files/sales_shipments/${shipment.id}/${file}`}
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

export default ShipmentDetail;
