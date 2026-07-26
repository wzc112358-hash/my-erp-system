import { Empty, Skeleton, Tag, Typography } from 'antd';
import { ClockCircleOutlined, RightOutlined } from '@ant-design/icons';

import type { BidNotice } from '@/types/opportunity';

const { Text, Title } = Typography;

const dateOnly = (value: string) => value ? value.slice(0, 10) : '待确认';

const decisionMeta = {
  likely_can_do: { label: '初步可做', color: 'success' },
  needs_manual_check: { label: '需确认', color: 'warning' },
  likely_cannot_do: { label: '初步不可做', color: 'error' },
} as const;

interface BidNoticeListProps {
  items: BidNotice[];
  loading: boolean;
  grouped?: boolean;
  selectedId?: string;
  onSelect: (notice: BidNotice) => void;
}

export const BidNoticeList: React.FC<BidNoticeListProps> = ({
  items,
  loading,
  grouped = false,
  selectedId,
  onSelect,
}) => {
  if (loading && !items.length) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!items.length) return <Empty description="当前筛选条件下没有招投标信息" />;

  return (
    <div className="bid-notice-list">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={item.id === selectedId ? 'bid-notice-row is-selected' : 'bid-notice-row'}
          onClick={() => onSelect(item)}
        >
          <div className="bid-notice-row-content">
            <div className="bid-notice-row-meta">
              {grouped ? (
                <>
                  <Text ellipsis>{item.buyerName || '采购方待确认'}</Text>
                  <Text type="secondary">发布 {dateOnly(item.publishedAt)}</Text>
                </>
              ) : (
                <>
                  <Tag color={item.kind === 'current' ? 'green' : 'gold'}>
                    {item.kind === 'current' ? '当前商机' : '可关注商机'}
                  </Tag>
                  <Text type="secondary">{item.sourceName}</Text>
                </>
              )}
            </div>
            <Title level={5} ellipsis={{ rows: 2 }} className="bid-notice-title">
              {item.title}
            </Title>
            <div className="bid-product-tags">
              {item.matchedProducts.slice(0, 4).map((product) => <Tag key={product}>{product}</Tag>)}
              {!item.matchedProducts.length && <Text type="secondary">新化工产品，待确认</Text>}
            </div>
            {item.assessment?.quantity && (
              <Text type="secondary" ellipsis className="bid-notice-quantity">
                数量 {item.assessment.quantity}
              </Text>
            )}
            <div className="bid-notice-row-footer">
              <Text type="secondary"><ClockCircleOutlined /> 截止 {dateOnly(item.deadlineAt)}</Text>
              <span className="bid-notice-row-action">
                {item.assessment && (
                  <Tag color={decisionMeta[item.assessment.decision].color}>
                    {decisionMeta[item.assessment.decision].label}
                  </Tag>
                )}
                <RightOutlined aria-hidden="true" />
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};
