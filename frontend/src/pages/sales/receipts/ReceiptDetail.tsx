import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, App, Spin, Divider, Flex } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { ReceiptAPI } from '@/api/receipt';
import type { SaleReceipt } from '@/types';

export const ReceiptDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<SaleReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);

  useEffect(() => { getUsdToCnyRate().then(setExchangeRate); }, []);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await ReceiptAPI.getById(id);
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
          console.error('Fetch receipt error:', error);
          message.error('加载收款详情失败');
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
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/receipts')}>
          返回列表
        </Button>
        <p>未找到收款记录</p>
      </div>
    );
  }

  const contract = data.expand?.sales_contract as Record<string, unknown> | undefined;
  const isCB = contract?.is_cross_border === true;
  const amtVal = data.amount || 0;

  return (
    <div style={{ padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/sales/receipts')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card title="收款详情">
        <Descriptions bordered column={2}>
          <Descriptions.Item label="合同编号" span={1}>
            {String(contract?.no || '-')}
          </Descriptions.Item>
          <Descriptions.Item label="产品名称" span={1}>
            {data.product_name}
          </Descriptions.Item>
          <Descriptions.Item label={isCB ? '收款金额（USD）' : '收款金额'} span={1}>
            {isCB ? `$${amtVal.toFixed(4)}（≈ ¥${(amtVal * exchangeRate).toFixed(4)}）` : `¥${amtVal.toFixed(4)}`}
          </Descriptions.Item>
          <Descriptions.Item label="产品数量" span={1}>
            {data.product_amount} 吨
          </Descriptions.Item>
          <Descriptions.Item label="收款日期" span={1}>
            {data.receive_date}
          </Descriptions.Item>
          <Descriptions.Item label="收款方式" span={1}>
            {data.method || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="收款账户" span={2}>
            {data.account || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {data.remark || '-'}
          </Descriptions.Item>
        </Descriptions>

        {contract && (
          <>
            <Divider>关联销售合同信息</Divider>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="合同编号" span={1}>
                {contract.no as string}
              </Descriptions.Item>
              <Descriptions.Item label="合同总数量" span={1}>
                {contract.total_quantity as number} 吨
              </Descriptions.Item>
              <Descriptions.Item label="已执行数量" span={1}>
                {contract.receipted_amount as number} 吨
              </Descriptions.Item>
              <Descriptions.Item label="执行进度" span={1}>
                {((contract.receipt_percent as number) || 0).toFixed(1)}%
              </Descriptions.Item>
              <Descriptions.Item label={(() => {
                if (isCB) return contract.is_price_excluding_tax ? '合同总金额（不含税，USD）' : '合同总金额（USD）';
                return contract.is_price_excluding_tax ? '合同总金额（不含税）' : '合同总金额';
              })()} span={1}>
                {(() => {
                  const v = (contract.total_amount as number) || 0;
                  return isCB
                    ? `$${v.toFixed(4)}（≈ ¥${(v * exchangeRate).toFixed(4)}）`
                    : `¥${v.toFixed(4)}`;
                })()}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}

        <Divider>收款凭证</Divider>
        {data.attachments && data.attachments.length > 0 ? (
          <Flex vertical gap="small">
            {data.attachments.map((file: string) => (
                <a
                  key={file}
                  href={`${pb.baseUrl}/api/files/sale_receipts/${data.id}/${file}`}
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

export default ReceiptDetail;
