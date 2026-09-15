import {
  ArrowRightOutlined,
  AuditOutlined,
  DollarCircleOutlined,
} from '@ant-design/icons';
import { Collapse, Empty, Tag, Typography } from 'antd';
import { useMemo } from 'react';

import type { OverviewContract } from '@/types/comparison';
import { buildDashboardContractReminders } from './dashboard-reminders';
import './DashboardReminders.css';

const { Text, Title } = Typography;

interface DashboardRemindersProps {
  salesContracts: OverviewContract[];
  purchaseContracts: OverviewContract[];
  onOpenContract: (contract: OverviewContract) => void;
}

const formatMoney = (amount: number | undefined, isCrossBorder: boolean | undefined) => new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: isCrossBorder ? 'USD' : 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(amount) || 0);

const displayPercent = (value: number | undefined) => Math.round(Math.min(100, Math.max(0, Number(value) || 0)));

const ReminderList: React.FC<{
  contracts: OverviewContract[];
  kind: 'outstanding' | 'unverified';
  onOpenContract: (contract: OverviewContract) => void;
}> = ({ contracts, kind, onOpenContract }) => {
  if (!contracts.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={kind === 'outstanding' ? '当前没有未收款销售合同' : '当前没有未验票采购合同'}
      />
    );
  }

  return (
    <div className="dashboard-reminder-list" role="list">
      {contracts.map((contract) => {
        const isOutstanding = kind === 'outstanding';
        return (
          <button
            type="button"
            className="dashboard-reminder-row"
            key={contract.id}
            role="listitem"
            onClick={() => onOpenContract(contract)}
            aria-label={`查看${isOutstanding ? '未收款销售' : '未验票采购'}合同 ${contract.no}`}
          >
            <span className="dashboard-reminder-row__identity">
              <span className="dashboard-reminder-row__title">
                <Tag color={isOutstanding ? 'orange' : 'gold'}>{isOutstanding ? '销售' : '采购'}</Tag>
                <strong>{contract.no || '未填写合同号'}</strong>
              </span>
              <small>
                {contract.productName || '未填写产品'} · {isOutstanding
                  ? contract.customerName || '未填写客户'
                  : contract.supplierName || '未填写供应商'}
              </small>
            </span>
            <span className="dashboard-reminder-row__status">
              <strong>{isOutstanding
                ? `待收 ${formatMoney(contract.outstandingAmount, contract.isCrossBorder)}`
                : `${contract.unverifiedInvoiceCount || 0} 张发票待验票`}</strong>
              <small>{isOutstanding
                ? `收款进度 ${displayPercent(contract.settlementProgress)}%`
                : `待验票金额 ${formatMoney(contract.unverifiedInvoiceAmount, contract.isCrossBorder)}`}</small>
            </span>
            <ArrowRightOutlined aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
};

export const DashboardReminders: React.FC<DashboardRemindersProps> = ({
  salesContracts,
  purchaseContracts,
  onOpenContract,
}) => {
  const reminders = useMemo(
    () => buildDashboardContractReminders(salesContracts, purchaseContracts),
    [purchaseContracts, salesContracts],
  );
  const defaultActiveKeys = [
    ...(reminders.outstandingSales.length ? ['outstanding'] : []),
    ...(reminders.unverifiedPurchases.length ? ['unverified'] : []),
  ];

  const items = [
    {
      key: 'outstanding',
      label: (
        <span className="dashboard-reminder-panel-title">
          <DollarCircleOutlined />
          <strong>未收款销售合同</strong>
          <Tag color={reminders.outstandingSales.length ? 'orange' : 'success'}>
            {reminders.outstandingSales.length} 份
          </Tag>
        </span>
      ),
      children: (
        <ReminderList
          contracts={reminders.outstandingSales}
          kind="outstanding"
          onOpenContract={onOpenContract}
        />
      ),
    },
    {
      key: 'unverified',
      label: (
        <span className="dashboard-reminder-panel-title">
          <AuditOutlined />
          <strong>未验票采购合同</strong>
          <Tag color={reminders.unverifiedPurchases.length ? 'gold' : 'success'}>
            {reminders.unverifiedPurchases.length} 份 / {reminders.unverifiedInvoiceCount} 张
          </Tag>
        </span>
      ),
      children: (
        <ReminderList
          contracts={reminders.unverifiedPurchases}
          kind="unverified"
          onOpenContract={onOpenContract}
        />
      ),
    },
  ];

  return (
    <section className="dashboard-reminders" aria-labelledby="dashboard-reminders-title">
      <div className="dashboard-reminders__heading">
        <div>
          <Title level={2} id="dashboard-reminders-title">待办提醒</Title>
          <Text type="secondary">覆盖全部未取消合同，不受下方近三个月窗口限制；点击合同可直接处理</Text>
        </div>
        <div className="dashboard-reminders__summary" aria-live="polite">
          <span><strong>{reminders.outstandingSales.length}</strong> 份销售待收款</span>
          <span><strong>{reminders.unverifiedPurchases.length}</strong> 份采购待验票</span>
        </div>
      </div>

      <Collapse
        className="dashboard-reminders__collapse"
        items={items}
        defaultActiveKey={defaultActiveKeys}
      />
    </section>
  );
};
