import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, App, Spin, Divider, Flex } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { PaymentAPI } from '@/api/purchase-contract';
import type { PurchasePayment } from '@/types/purchase-contract';

export const PaymentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<PurchasePayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);

  useEffect(() => { getUsdToCnyRate().then(setExchangeRate); }, []);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await PaymentAPI.getById(id);
        setData(result);
      } catch (error: unknown) {
        const err = error as { name?: string; message?: string; cause?: { name?: string } };
        const isAborted =
          err.name === 'AbortError' ||
          err.name === 'CanceledError' ||
          err.message?.includes('aborted') ||
          err.message?.includes('autocancelled') ||
          err.cause?.name === 'AbortError';
        if (!isAborted) {
          console.error('Fetch payment error:', error);
          message.error('加载付款详情失败');
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

  if (!data) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchase/payments')}>
          返回列表
        </Button>
        <p>未找到付款记录</p>
      </div>
    );
  }

  const contract = data.expand?.purchase_contract as Record<string, unknown> | undefined;
  const isCB = contract?.is_cross_border === true;
  const amtVal = data.amount || 0;

  return (
    <div style={{ padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/purchase/payments')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card title="付款详情">
        <Descriptions bordered column={2}>
          <Descriptions.Item label="付款单号" span={1}>
            {String(data.no || '-')}
          </Descriptions.Item>
          <Descriptions.Item label="合同编号" span={1}>
            {String(contract?.no || '-')}
          </Descriptions.Item>
          <Descriptions.Item label="产品名称" span={1}>
            {data.product_name}
          </Descriptions.Item>
          <Descriptions.Item label={isCB ? '付款金额（USD）' : '付款金额'} span={1}>
            {isCB ? `$${amtVal.toFixed(6)}（≈ ¥${(amtVal * exchangeRate).toFixed(6)}）` : `¥${amtVal.toFixed(6)}`}
          </Descriptions.Item>
          <Descriptions.Item label="产品数量" span={1}>
            {data.product_amount} 吨
          </Descriptions.Item>
          <Descriptions.Item label="付款日期" span={1}>
            {data.pay_date}
          </Descriptions.Item>
          <Descriptions.Item label="付款方式" span={2}>
            {data.method || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {data.remark || '-'}
          </Descriptions.Item>
        </Descriptions>

        {contract && (
          <>
            <Divider />
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => navigate(`/purchase/contracts/${contract.id}`)}
            >
              查看关联采购合同
            </Button>
          </>
        )}

        <Divider>付款凭证</Divider>
        {data.attachments && data.attachments.length > 0 ? (
          <Flex vertical gap="small">
            {data.attachments.map((file: string) => (
                <a
                  key={file}
                  href={`${pb.baseUrl}/api/files/purchase_payments/${data.id}/${file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <DownloadOutlined /> {file}
                </a>
              ))}
          </Flex>
        ) : (
          <p style={{ color: '#999' }}>暂无凭证</p>
        )}
      </Card>
    </div>
  );
};

export default PaymentDetail;
