import { Alert, App, Button, DatePicker, Empty, Skeleton, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { MonthlyProfitAPI } from '@/api/monthly-profit';
import { formatCny } from '@/lib/monthly-profit';
import type { MonthlyProfitOverview, MonthlyProfitRow } from '@/types/monthly-profit';
import { MonthlyProfitTable } from './MonthlyProfitTable';
import './MonthlyProfitPage.css';

const { Paragraph, Text, Title } = Typography;
const currentYear = new Date().getFullYear();

export const MonthlyProfitPage: React.FC = () => {
  const { message } = App.useApp();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MonthlyProfitOverview | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await MonthlyProfitAPI.getYearOverview(year));
    } catch (error) {
      console.error('Load monthly profit error:', error);
      message.error(error instanceof Error ? error.message : '加载月度利润失败');
    } finally {
      setLoading(false);
    }
  }, [message, year]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const months = useMemo(() => overview?.months || [], [overview]);
  const profitableMonths = months.filter((month) => month.contractCount > 0 && month.netProfit >= 0).length;
  const activeMonths = months.filter((month) => month.contractCount > 0).length;
  const bestMonth = months.reduce<MonthlyProfitRow | null>((best, month) => (
    month.contractCount > 0 && (!best || month.netProfit > best.netProfit) ? month : best
  ), null);

  return (
    <div className="monthly-profit-page manager-page">
      <header className="monthly-profit-page__header">
        <div>
          <Title level={2}>月度利润</Title>
          <Paragraph>
            按销售合同签约月份汇总关联合同详情中的净利润，可展开核对每份合同。
          </Paragraph>
        </div>
        <div className="monthly-profit-page__controls">
          <DatePicker
            picker="year"
            allowClear={false}
            value={dayjs(`${year}-01-01`)}
            onChange={(value) => value && setYear(value.year())}
            aria-label="选择利润统计年份"
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()} loading={loading}>
            刷新
          </Button>
        </div>
      </header>

      {loading && !overview ? (
        <div className="monthly-profit-skeleton"><Skeleton active paragraph={{ rows: 10 }} /></div>
      ) : overview ? (
        <>
          <section className="monthly-profit-summary" aria-label={`${year}年利润摘要`}>
            <div className="monthly-profit-summary__primary">
              <span>{year}年合同净利润</span>
              <strong className={overview.totals.netProfit < 0 ? 'is-negative' : ''}>
                {formatCny(overview.totals.netProfit)}
              </strong>
              <small>{overview.totals.contractCount} 组关联合同</small>
            </div>
            <dl>
              <div>
                <dt>有业务月份</dt>
                <dd>{activeMonths} 个月</dd>
              </div>
              <div>
                <dt>盈利月份</dt>
                <dd>{profitableMonths} 个月</dd>
              </div>
              <div>
                <dt>利润最高月份</dt>
                <dd>{bestMonth ? `${bestMonth.label} · ${formatCny(bestMonth.netProfit)}` : '-'}</dd>
              </div>
              <div>
                <dt>当前折算汇率</dt>
                <dd>1 USD = {overview.exchangeRate} CNY</dd>
              </div>
            </dl>
          </section>

          {overview.unlinkedSalesCount > 0 && (
            <Alert
              type="info"
              showIcon
              message={`${year}年另有 ${overview.unlinkedSalesCount} 份销售合同尚未关联采购合同，未计入利润。`}
              className="monthly-profit-page__alert"
            />
          )}

          <section className="monthly-profit-table" aria-labelledby="monthly-profit-table-title">
            <div className="monthly-profit-table__heading">
              <div>
                <Title level={3} id="monthly-profit-table-title">十二个月利润明细</Title>
                <Text type="secondary">利润按当前系统汇率动态折算，不等同于会计确认利润。</Text>
              </div>
            </div>
            <MonthlyProfitTable overview={overview} months={months} loading={loading} />
          </section>
        </>
      ) : (
        <Empty description="月度利润加载失败，请刷新重试" />
      )}
    </div>
  );
};

export default MonthlyProfitPage;
