import { Button, Descriptions, Divider, Empty, Flex, Space, Tag, Typography } from 'antd';
import { CopyOutlined, LinkOutlined } from '@ant-design/icons';

import type { BidNotice } from '@/types/opportunity';

const { Paragraph, Text, Title } = Typography;

const dateOnly = (value: string) => value ? value.slice(0, 10) : '待确认';

const noticeSummaryText = (notice: BidNotice) => [
  notice.title,
  `来源：${notice.sourceName}`,
  notice.buyerName ? `采购方：${notice.buyerName}` : '',
  `产品：${notice.matchedProducts.join('、') || '待确认'}`,
  `发布时间：${dateOnly(notice.publishedAt)}`,
  `截止时间：${dateOnly(notice.deadlineAt)}`,
  `判断：${notice.judgment || '建议查看原公告'}`,
  notice.requirements.length ? `要求/风险：${notice.requirements.join('；')}` : '',
  notice.missingInfo.length ? `需确认：${notice.missingInfo.join('；')}` : '',
  `链接：${notice.url}`,
].filter(Boolean).join('\n');

interface BidNoticeDetailProps {
  notice: BidNotice | null;
  onCopy: (text: string) => void;
}

const InfoTags: React.FC<{ items: string[]; color?: string }> = ({ items, color }) => (
  <Flex wrap gap={8}>
    {items.length ? items.map((item) => <Tag key={item} color={color}>{item}</Tag>) : <Text type="secondary">暂无</Text>}
  </Flex>
);

export const BidNoticeDetail: React.FC<BidNoticeDetailProps> = ({ notice, onCopy }) => {
  if (!notice) return <Empty description="从左侧选择一条信息查看详情" />;

  return (
    <article className="bid-notice-detail">
      <Flex justify="space-between" align="flex-start" gap={16} wrap>
        <div className="bid-detail-heading">
          <Space size={8} wrap>
            <Tag color={notice.kind === 'current' ? 'green' : 'gold'}>
              {notice.kind === 'current' ? '当前商机' : '可关注商机'}
            </Tag>
            <Text type="secondary">{notice.sourceName}</Text>
          </Space>
          <Title level={3}>{notice.title}</Title>
        </div>
        <Space>
          <Button icon={<CopyOutlined />} onClick={() => onCopy(noticeSummaryText(notice))}>复制摘要</Button>
          <Button type="primary" icon={<LinkOutlined />} href={notice.url} target="_blank" rel="noreferrer">查看原公告</Button>
        </Space>
      </Flex>

      <Descriptions className="bid-detail-descriptions" column={{ xs: 1, sm: 2 }} size="small">
        <Descriptions.Item label="采购方">{notice.buyerName || '待确认'}</Descriptions.Item>
        <Descriptions.Item label="详情来源">{notice.detailReadMethod || '公开接口'}</Descriptions.Item>
        <Descriptions.Item label="发布时间">{dateOnly(notice.publishedAt)}</Descriptions.Item>
        <Descriptions.Item label="截止时间">{dateOnly(notice.deadlineAt)}</Descriptions.Item>
      </Descriptions>

      <Divider />
      <section className="bid-detail-section">
        <Text strong>匹配产品</Text>
        <InfoTags items={notice.matchedProducts} color="blue" />
      </section>
      <section className="bid-detail-section">
        <Text strong>Agent 判断</Text>
        <Paragraph>{notice.judgment || '建议查看原公告确认'}</Paragraph>
      </section>
      <section className="bid-detail-section">
        <Text strong>要求与风险</Text>
        <InfoTags items={notice.requirements} color="orange" />
      </section>
      <section className="bid-detail-section">
        <Text strong>仍需确认</Text>
        <InfoTags items={notice.missingInfo} />
      </section>
      {notice.evidence && (
        <section className="bid-detail-section">
          <Text strong>原文依据</Text>
          <Paragraph className="bid-evidence" ellipsis={{ rows: 8, expandable: true, symbol: '展开全文' }}>
            {notice.evidence}
          </Paragraph>
        </section>
      )}
    </article>
  );
};
