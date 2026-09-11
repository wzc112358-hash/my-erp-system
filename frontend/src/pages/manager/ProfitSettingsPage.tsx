import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Alert, Button, Card, DatePicker, InputNumber, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

import { getPbErrorMessage } from '@/api/helpers';
import { ProfitTaxRateAPI } from '@/api/profit-tax-rate';
import type { ProfitTaxRateRecord } from '@/api/profit-tax-rate';
import { DEFAULT_PROFIT_TAX_RATE } from '@/lib/contract-profit';

const { Text, Title } = Typography;

export const ProfitSettingsPage: React.FC = () => {
  const { message } = App.useApp();
  const [rates, setRates] = useState<ProfitTaxRateRecord[]>([]);
  const [percent, setPercent] = useState(DEFAULT_PROFIT_TAX_RATE * 100);
  const [effectiveFrom, setEffectiveFrom] = useState(dayjs().startOf('day'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRates(await ProfitTaxRateAPI.list());
    } catch (error) {
      message.error(getPbErrorMessage(error, '加载税率历史失败'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void load(); }, [load]);

  const currentRate = useMemo(() => rates.find((record) => (
    !dayjs(record.effective_from).isAfter(dayjs())
  ))?.rate ?? DEFAULT_PROFIT_TAX_RATE, [rates]);

  const save = async () => {
    if (!effectiveFrom || percent < 0 || percent > 100) {
      message.error('请填写 0% 到 100% 之间的税率和生效日期');
      return;
    }
    setSaving(true);
    try {
      await ProfitTaxRateAPI.create(percent / 100, effectiveFrom.format('YYYY-MM-DD'));
      message.success('新税率版本已保存');
      await load();
    } catch (error) {
      message.error(getPbErrorMessage(error, '保存税率失败'));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ProfitTaxRateRecord> = [
    { title: '生效日期', dataIndex: 'effective_from', render: (value: string) => dayjs(value).format('YYYY-MM-DD') },
    { title: '税率', dataIndex: 'rate', render: (value: number) => `${(value * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%` },
    { title: '创建时间', dataIndex: 'created', render: (value?: string) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <Title level={2}>利润参数</Title>
      <Alert
        showIcon
        type="info"
        title="总体交易创建时会保存当时适用的税率，后续修改不会重算历史交易。"
        description="税额公式保持不变：税额 =（销售含税金额 - 采购含税金额）× 税率。默认税率为 18.81%。"
        style={{ marginBottom: 16 }}
      />
      <Card title={`当前税率 ${(currentRate * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`} style={{ marginBottom: 16 }}>
        <Space wrap size="middle">
          <div>
            <Text type="secondary">新税率</Text>
            <div><InputNumber min={0} max={100} precision={4} value={percent} onChange={(value) => setPercent(value ?? 0)} suffix="%" /></div>
          </div>
          <div>
            <Text type="secondary">生效日期</Text>
            <div><DatePicker value={effectiveFrom} onChange={(value) => value && setEffectiveFrom(value.startOf('day'))} /></div>
          </div>
          <Button type="primary" loading={saving} onClick={save} style={{ alignSelf: 'end' }}>新增税率版本</Button>
        </Space>
      </Card>
      <Card title="税率版本历史">
        <Table rowKey="id" columns={columns} dataSource={rates} loading={loading} pagination={false} />
      </Card>
    </div>
  );
};

export default ProfitSettingsPage;
