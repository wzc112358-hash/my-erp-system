import React from 'react';
import { Badge, Button, Checkbox, Dropdown, Progress, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  DisconnectOutlined,
  EyeOutlined,
  LinkOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import type { OverviewContract } from '@/types/comparison';

interface OverviewContractCardProps {
  contract: OverviewContract;
  selected: boolean;
  compact?: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onView: () => void;
  onViewFlow?: () => void;
  onLink: () => void;
  onUnlink?: () => void;
  onDelete: () => void;
}

const percent = (value?: number) => Math.max(0, Math.min(100, Math.round((value || 0) * 10) / 10));

const formatMoney = (contract: OverviewContract) => new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: contract.isCrossBorder ? 'USD' : 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(contract.totalAmount || 0);

const statusText = (status?: string) => {
  if (status === 'completed') return '已完成';
  if (status === 'cancelled') return '已取消';
  return '执行中';
};

const statusColor = (status?: string) => {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'default';
  return 'processing';
};

const ProgressItem: React.FC<{ label: string; value?: number }> = ({ label, value }) => {
  const current = percent(value);
  return (
    <div className="overview-progress-item">
      <div className="overview-progress-label">
        <span>{label}</span>
        <strong className={current >= 100 ? 'is-complete' : ''}>{current}%</strong>
      </div>
      <Progress
        percent={current}
        showInfo={false}
        size="small"
        strokeColor={current >= 100 ? '#2f7d5b' : '#3274b8'}
        railColor="#e8edf2"
      />
    </div>
  );
};

export const OverviewContractCard: React.FC<OverviewContractCardProps> = ({
  contract,
  selected,
  compact = false,
  onSelect,
  onView,
  onViewFlow,
  onLink,
  onUnlink,
  onDelete,
}) => {
  const isSales = contract.type === 'sales';
  const counterparty = isSales ? contract.customerName : contract.supplierName;
  const menuItems: MenuProps['items'] = [
    { key: 'view', icon: <EyeOutlined />, label: '查看合同详情', onClick: onView },
    ...(onViewFlow ? [{ key: 'flow', icon: <EyeOutlined />, label: '查看执行流程', onClick: onViewFlow }] : []),
    { type: 'divider' },
    { key: 'link', icon: <LinkOutlined />, label: `新增关联${isSales ? '采购' : '销售'}合同`, onClick: onLink },
    ...(onUnlink ? [{ key: 'unlink', icon: <DisconnectOutlined />, label: '将本合同移出总体交易', onClick: onUnlink }] : []),
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, danger: true, label: '解除关联并删除', onClick: onDelete },
  ];

  return (
    <article
      className={`overview-contract ${isSales ? 'is-sales' : 'is-purchase'} ${selected ? 'is-selected' : ''} ${compact ? 'is-compact' : ''}`}
      onClick={onView}
    >
      <div className="overview-contract-topline">
        <Checkbox
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onSelect(contract.id, event.target.checked)}
          aria-label={`选择合同 ${contract.no}`}
        />
        <Tag className="overview-type-tag" color={isSales ? 'blue' : 'gold'}>
          {isSales ? '销售' : '采购'}
        </Tag>
        <Tooltip title={contract.no}>
          <strong className="overview-contract-no">{contract.no || '未填写合同号'}</strong>
        </Tooltip>
        {(contract.pendingCount || 0) > 0 && <Badge count={contract.pendingCount} />}
        <Tag color={statusColor(contract.status)} className="overview-status-tag">
          {statusText(contract.status)}
        </Tag>
        <Dropdown
          menu={{
            items: menuItems,
            onClick: ({ domEvent }) => domEvent.stopPropagation(),
          }}
          trigger={['click']}
        >
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            aria-label={`合同 ${contract.no} 操作`}
            onClick={(event) => event.stopPropagation()}
          />
        </Dropdown>
      </div>

      <div className="overview-contract-title" title={contract.productName}>
        {contract.productName || '-'}
      </div>

      <dl className="overview-contract-facts">
        <div><dt>{isSales ? '客户' : '供应商'}</dt><dd title={counterparty}>{counterparty || '-'}</dd></div>
        <div><dt>数量</dt><dd>{contract.quantity || 0} 吨</dd></div>
        <div><dt>合同金额</dt><dd>{formatMoney(contract)}</dd></div>
        <div><dt>签订日期</dt><dd>{contract.signDate ? dayjs(contract.signDate).format('YYYY-MM-DD') : '-'}</dd></div>
      </dl>

      <div className="overview-progress-grid">
        <ProgressItem label={isSales ? '发货' : '到货'} value={contract.executionProgress} />
        <ProgressItem label={isSales ? '收款' : '付款'} value={contract.settlementProgress} />
        <ProgressItem label={isSales ? '开票' : '收票'} value={contract.invoiceProgress} />
      </div>
    </article>
  );
};
