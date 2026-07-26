import { Button, Descriptions, Divider, Empty, Flex, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  FileAddOutlined,
  LinkOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import type {
  BidBusinessAssessment,
  BidNotice,
  BidQualificationCheck,
  BidQualificationStatus,
} from '@/types/opportunity';
import { BiddingHistoryReferences } from '@/pages/sales/bidding/BiddingHistoryReferences';

const { Paragraph, Text, Title } = Typography;

const dateOnly = (value: string) => value ? value.slice(0, 10) : '待确认';

const assessmentFor = (notice: BidNotice): BidBusinessAssessment => notice.assessment || ({
  decision: notice.kind === 'attention' ? 'likely_cannot_do' : 'needs_manual_check',
  decisionSummary: notice.judgment || '产品具有业务相关性，但缺少足够信息判断能否参与。',
  productSummary: notice.matchedProducts.join('、') || '采购产品待确认',
  quantity: '',
  specifications: [],
  deliveryTerms: [],
  commercialTerms: [],
  qualificationChecks: notice.requirements.map((requirement) => ({
    requirement,
    status: 'unconfirmed',
    basis: '历史记录未拆分资格结论',
  })),
  historicalReferences: [],
  nextActions: notice.missingInfo,
});

const decisionMeta = {
  likely_can_do: { label: '初步可做', color: 'success' },
  needs_manual_check: { label: '需要确认', color: 'warning' },
  likely_cannot_do: { label: '初步不可做', color: 'error' },
} as const;

const qualificationMeta: Record<BidQualificationStatus, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  met: { label: '有依据满足', color: 'success', icon: <CheckCircleOutlined /> },
  unconfirmed: { label: '待确认', color: 'warning', icon: <QuestionCircleOutlined /> },
  not_met: { label: '有依据不满足', color: 'error', icon: <CloseCircleOutlined /> },
  not_applicable: { label: '不适用', color: 'default', icon: <CheckCircleOutlined /> },
};

const compactLines = (items: string[]) => items.filter(Boolean).join('；');

const noticeSummaryText = (notice: BidNotice) => {
  const assessment = assessmentFor(notice);
  const decision = decisionMeta[assessment.decision];
  return [
    notice.title,
    `来源：${notice.sourceName}`,
    notice.buyerName ? `采购方：${notice.buyerName}` : '',
    `产品：${assessment.productSummary || notice.matchedProducts.join('、') || '待确认'}`,
    assessment.quantity ? `数量：${assessment.quantity}` : '',
    assessment.specifications.length ? `规格/包装：${compactLines(assessment.specifications)}` : '',
    assessment.deliveryTerms.length ? `交付：${compactLines(assessment.deliveryTerms)}` : '',
    assessment.commercialTerms.length ? `商务：${compactLines(assessment.commercialTerms)}` : '',
    `发布时间：${dateOnly(notice.publishedAt)}`,
    `截止时间：${dateOnly(notice.deadlineAt)}`,
    `可行性：${decision.label}。${assessment.decisionSummary}`,
    ...assessment.qualificationChecks.map((item) => (
      `资格核对：${item.requirement}，${qualificationMeta[item.status].label}${item.basis ? `，依据：${item.basis}` : ''}`
    )),
    assessment.historicalReferences.length ? `历史参考：${compactLines(assessment.historicalReferences)}` : '',
    assessment.nextActions.length ? `下一步：${compactLines(assessment.nextActions)}` : '',
    `链接：${notice.url}`,
  ].filter(Boolean).join('\n');
};

interface BidNoticeDetailProps {
  notice: BidNotice | null;
  onCopy: (text: string) => void;
}

const FactList: React.FC<{ items: string[]; empty?: string }> = ({ items, empty = '公告未提供' }) => (
  items.length ? (
    <ul className="bid-fact-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  ) : <Text type="secondary">{empty}</Text>
);

const QualificationChecks: React.FC<{ items: BidQualificationCheck[] }> = ({ items }) => (
  items.length ? (
    <div className="bid-qualification-list">
      {items.map((item) => {
        const meta = qualificationMeta[item.status];
        return (
          <div className="bid-qualification-row" key={`${item.requirement}-${item.status}`}>
            <div className="bid-qualification-main">
              <Text strong>{item.requirement}</Text>
              {item.basis && <Text type="secondary">{item.basis}</Text>}
            </div>
            <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
          </div>
        );
      })}
    </div>
  ) : <Text type="secondary">公告未发现明确资格条款，仍需在招标文件中确认。</Text>
);

export const BidNoticeDetail: React.FC<BidNoticeDetailProps> = ({ notice, onCopy }) => {
  const navigate = useNavigate();
  if (!notice) return <Empty description="从左侧选择一条信息查看详情" />;
  const assessment = assessmentFor(notice);
  const decision = decisionMeta[assessment.decision];

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
          <Button icon={<CopyOutlined />} onClick={() => onCopy(noticeSummaryText(notice))}>复制研判</Button>
          {notice.kind === 'current' && (
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              disabled={assessment.decision === 'likely_cannot_do'}
              title={assessment.decision === 'likely_cannot_do' ? assessment.decisionSummary : ''}
              onClick={() => navigate(`/sales/bidding/new?noticeId=${encodeURIComponent(notice.id)}`)}
            >
              创建投标草稿
            </Button>
          )}
          <Button icon={<LinkOutlined />} href={notice.url} target="_blank" rel="noreferrer">查看原公告</Button>
        </Space>
      </Flex>

      <section className={`bid-decision-panel is-${assessment.decision}`}>
        <Flex align="center" gap={10} wrap>
          <Tag color={decision.color}>{decision.label}</Tag>
          <Text strong>Agent 研判</Text>
        </Flex>
        <Paragraph>{assessment.decisionSummary}</Paragraph>
      </section>

      <Descriptions className="bid-detail-descriptions" column={{ xs: 1, sm: 2 }} size="small">
        <Descriptions.Item label="采购方">{notice.buyerName || '待确认'}</Descriptions.Item>
        <Descriptions.Item label="详情来源">{notice.detailReadMethod || '公开接口'}</Descriptions.Item>
        <Descriptions.Item label="发布时间">{dateOnly(notice.publishedAt)}</Descriptions.Item>
        <Descriptions.Item label="截止时间">{dateOnly(notice.deadlineAt)}</Descriptions.Item>
      </Descriptions>

      <div className="bid-procurement-grid">
        <section className="bid-fact-panel">
          <Text type="secondary">采购产品</Text>
          <Title level={5}>{assessment.productSummary || notice.matchedProducts.join('、') || '待确认'}</Title>
        </section>
        <section className="bid-fact-panel">
          <Text type="secondary">采购数量</Text>
          <Title level={5}>{assessment.quantity || '公告未提供'}</Title>
        </section>
      </div>

      <Divider />
      <div className="bid-analysis-grid">
        <section className="bid-detail-section">
          <Text strong>规格、技术与包装</Text>
          <FactList items={assessment.specifications} />
        </section>
        <section className="bid-detail-section">
          <Text strong>交付要求</Text>
          <FactList items={assessment.deliveryTerms} />
        </section>
        <section className="bid-detail-section">
          <Text strong>商务条件</Text>
          <FactList items={assessment.commercialTerms} />
        </section>
      </div>

      <section className="bid-detail-section">
        <Text strong>ERP 双库历史投标参考</Text>
        <BiddingHistoryReferences noticeId={notice.id} />
      </section>
      {assessment.historicalReferences.length > 0 && (
        <section className="bid-detail-section">
          <Text strong>公告内历史信息</Text>
          <FactList items={assessment.historicalReferences} />
        </section>
      )}

      <Divider />
      <section className="bid-detail-section">
        <Text strong>投标资格核对</Text>
        <QualificationChecks items={assessment.qualificationChecks} />
      </section>
      <section className="bid-detail-section">
        <Text strong>下一步</Text>
        <FactList items={assessment.nextActions} empty="当前没有额外动作" />
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
