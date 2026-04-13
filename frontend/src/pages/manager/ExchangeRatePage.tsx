import { useState, useEffect, useCallback } from 'react';
import { Card, InputNumber, Button, App, Descriptions, Typography, Space } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { clearRateCache } from '@/lib/exchange-rate';

const { Title } = Typography;

interface SettingsRecord {
  id: string;
  key: string;
  usd_to_cny: number;
  updated?: string;
}

export const ExchangeRatePage: React.FC = () => {
  const { message } = App.useApp();
  const [currentRate, setCurrentRate] = useState<number>(7.25);
  const [newRate, setNewRate] = useState<number>(7.25);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('-');

  const fetchRate = useCallback(async () => {
    try {
      const settings = await pb.collection('settings').getFirstListItem<SettingsRecord>(`key="default"`);
      setCurrentRate(settings.usd_to_cny);
      setNewRate(settings.usd_to_cny);
      if (settings.updated) {
        setLastUpdated(new Date(settings.updated).toLocaleString('zh-CN'));
      }
    } catch {
      setCurrentRate(7.25);
      setNewRate(7.25);
    }
  }, []);

  useEffect(() => {
    fetchRate();
  }, [fetchRate]);

  const handleSave = async () => {
    if (newRate <= 0) {
      message.error('汇率必须大于0');
      return;
    }
    setLoading(true);
    try {
      const settings = await pb.collection('settings').getFirstListItem<SettingsRecord>(`key="default"`);
      await pb.collection('settings').update(settings.id, { usd_to_cny: newRate });
      clearRateCache();
      setCurrentRate(newRate);
      message.success('汇率更新成功，已通知所有销售和采购人员');
      fetchRate();
    } catch (err) {
      console.error('Update exchange rate error:', err);
      message.error('更新汇率失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        <DollarOutlined style={{ marginRight: 8 }} />
        汇率设置
      </Title>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={1} bordered>
          <Descriptions.Item label="当前汇率（USD → CNY）">
            <span style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>
              {currentRate}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="最后更新时间">
            {lastUpdated}
          </Descriptions.Item>
          <Descriptions.Item label="说明">
            跨境合同（USD）金额将按此汇率自动折算为人民币（CNY），用于利润计算和报表统计。
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="修改汇率">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <div style={{ marginBottom: 8 }}>1 USD =</div>
            <InputNumber
              value={newRate}
              onChange={(v) => setNewRate(v || 7.25)}
              min={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonAfter="CNY"
            />
          </div>

          {newRate !== currentRate && (
            <div style={{ padding: 12, background: '#fff7e6', borderRadius: 8, border: '1px solid #ffd591' }}>
              <div style={{ marginBottom: 4 }}>汇率变更预览：</div>
              <div>原汇率：1 USD = {currentRate} CNY</div>
              <div>新汇率：1 USD = {newRate} CNY</div>
              <div style={{ marginTop: 4, color: '#d48806' }}>
                变更后所有跨境合同的折算金额将自动更新
              </div>
            </div>
          )}

          <Button
            type="primary"
            onClick={handleSave}
            loading={loading}
            disabled={newRate === currentRate}
            block
          >
            保存并通知相关人员
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default ExchangeRatePage;
