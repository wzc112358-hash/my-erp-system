import { Empty, Progress, Tag, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useMemo } from 'react';

import type { OverviewContract } from '@/types/comparison';
import { buildRecentContractDashboard } from './recent-contract-overview';
import './RecentContractOverview.css';

const { Text, Title } = Typography;

interface RecentContractOverviewProps {
  salesContracts: OverviewContract[];
  purchaseContracts: OverviewContract[];
  onOpenContract: (id: string) => void;
}

const displayPercent = (value: number | undefined) => Math.round(Math.min(100, Math.max(0, value || 0)));

const ProgressLine: React.FC<{ label: string; value: number; kind: 'invoice' | 'settlement' }> = ({
  label,
  value,
  kind,
}) => {
  const percent = displayPercent(value);
  const complete = percent >= 100;
  return (
    <div className="recent-contract-progress">
      <div className="recent-contract-progress__label">
        <span>{label}</span>
        <strong className={complete ? 'is-complete' : ''}>{complete ? '完成' : `${percent}%`}</strong>
      </div>
      <Progress
        percent={percent}
        showInfo={false}
        size="small"
        strokeColor={complete ? '#389e0d' : kind === 'invoice' ? '#1677ff' : '#d97706'}
        railColor="#e8eaed"
      />
    </div>
  );
};

export const RecentContractOverview: React.FC<RecentContractOverviewProps> = ({
  salesContracts,
  purchaseContracts,
  onOpenContract,
}) => {
  const dashboard = useMemo(
    () => buildRecentContractDashboard(salesContracts, purchaseContracts),
    [purchaseContracts, salesContracts],
  );

  return (
    <section className="recent-contract-overview" aria-labelledby="recent-contract-overview-title">
      <div className="recent-contract-overview__heading">
        <div>
          <Title level={2} id="recent-contract-overview-title">经营履约总览</Title>
          <Text type="secondary">按销售合同签约月份查看关联采购、开票与票款进度</Text>
        </div>
        <div className="recent-contract-collection" aria-label={`${dashboard.collection.monthLabel}销售合同全额收款率`}>
          <Progress
            type="circle"
            percent={dashboard.collection.percent}
            size={108}
            strokeWidth={9}
            strokeColor="#1677ff"
            railColor="#e8eaed"
            format={(percent) => <span className="recent-contract-collection__value">{percent}%</span>}
          />
          <div className="recent-contract-collection__copy">
            <strong>本月全额收款率</strong>
            <span>{dashboard.collection.completedCount} / {dashboard.collection.contractCount} 份销售合同</span>
            <small>累计收款达到合同总额</small>
          </div>
        </div>
      </div>

      <div className="recent-contract-months">
        {dashboard.months.map((month) => (
          <article className="recent-contract-month" key={month.key}>
            <header className="recent-contract-month__header">
              <div>
                <span className="recent-contract-month__relative">{month.relativeLabel}</span>
                <h3>{month.label}</h3>
              </div>
              <div className="recent-contract-month__status">
                <strong>{month.groups.length}</strong>
                <span>组关联合同</span>
                {month.incompleteCount > 0 ? (
                  <Tag color="orange">{month.incompleteCount} 组待完成</Tag>
                ) : month.groups.length > 0 ? (
                  <Tag color="green">全部完成</Tag>
                ) : null}
              </div>
            </header>

            <div className="recent-contract-month__body">
              {month.groups.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`${month.relativeLabel}暂无关联合同`} />
              ) : month.groups.map((group) => (
                <div className="recent-contract-group" key={group.sales.id}>
                  <button
                    type="button"
                    className="recent-contract-group__contract"
                    onClick={() => onOpenContract(group.sales.id)}
                    aria-label={`查看销售合同 ${group.sales.no}`}
                  >
                    <span>
                      <strong>{group.sales.no}</strong>
                      <small>{group.sales.customerName || '未填写客户'} · {group.sales.productName}</small>
                    </span>
                    <ArrowRightOutlined />
                  </button>
                  <div className="recent-contract-group__relation">
                    <span>关联采购</span>
                    <strong title={group.purchases.map((purchase) => purchase.no).join('、')}>
                      {group.purchases.map((purchase) => purchase.no).join('、')}
                    </strong>
                  </div>
                  <div className="recent-contract-group__progress-grid">
                    <ProgressLine label="销售开票" value={group.sales.invoiceProgress || 0} kind="invoice" />
                    <ProgressLine label="销售收款" value={group.sales.settlementProgress || 0} kind="settlement" />
                    <ProgressLine label="采购收票" value={group.purchaseInvoiceProgress} kind="invoice" />
                    <ProgressLine label="采购付款" value={group.purchaseSettlementProgress} kind="settlement" />
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
