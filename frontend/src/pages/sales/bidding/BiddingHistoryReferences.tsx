import { useEffect, useState } from 'react';
import { Empty, Flex, Spin, Tag, Typography } from 'antd';

import { OpportunityAPI } from '@/api/opportunity';
import type { HistoricalBidMatch } from '@/types/bidding-record';

import './BiddingHistoryReferences.css';

const { Text } = Typography;

const resultMeta = {
  pending: { label: '结果待更新', color: 'warning' },
  won: { label: '历史中标', color: 'success' },
  lost: { label: '历史未中标', color: 'error' },
} as const;

const money = (value?: number, currency = 'CNY') => value
  ? `${currency || 'CNY'} ${value.toLocaleString()}`
  : '';

interface BiddingHistoryReferencesProps {
  noticeId?: string;
  items?: HistoricalBidMatch[];
}

export const BiddingHistoryReferences: React.FC<BiddingHistoryReferencesProps> = ({ noticeId, items }) => {
  const [loaded, setLoaded] = useState<{ noticeId: string; records: HistoricalBidMatch[] } | null>(null);
  const controlled = items !== undefined;
  const records = items ?? (loaded && loaded.noticeId === noticeId ? loaded.records : []);
  const loading = !controlled && Boolean(noticeId) && loaded?.noticeId !== noticeId;

  useEffect(() => {
    if (controlled) return;
    if (!noticeId) return;
    let active = true;
    void OpportunityAPI.listHistory(noticeId)
      .then((result) => { if (active) setLoaded({ noticeId, records: result }); })
      .catch(() => { if (active) setLoaded({ noticeId, records: [] }); });
    return () => { active = false; };
  }, [controlled, noticeId]);

  if (loading) return <div className="bid-history-loading"><Spin size="small" /> 正在查询北京、兰州历史投标</div>;
  if (!records.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="双库暂无可关联的历史投标" />;

  return (
    <div className="bid-history-list">
      {records.map((record) => {
        const result = resultMeta[record.bidResult];
        const commercial = [
          record.quantity ? `数量 ${record.quantity}${record.quantityUnit ? ` ${record.quantityUnit}` : '（单位未记录）'}` : '',
          record.quotedUnitPrice ? `我方单价 ${money(record.quotedUnitPrice, record.currency)}` : '',
          record.quotedTotalAmount ? `我方总额 ${money(record.quotedTotalAmount, record.currency)}` : '',
          record.winningUnitPrice ? `中标单价 ${money(record.winningUnitPrice, record.currency)}` : '',
          record.winningTotalAmount ? `中标总额 ${money(record.winningTotalAmount, record.currency)}` : '',
          record.tenderFee ? `标书费 ${money(record.tenderFee)}` : '',
          record.bidBond ? `保证金 ${money(record.bidBond)}` : '',
        ].filter(Boolean);
        return (
          <article className="bid-history-item" key={`${record.region}-${record.id}`}>
            <Flex align="center" gap={6} wrap>
              <Tag color={record.matchType === 'exact_product' ? 'blue' : record.matchType === 'product_family' ? 'cyan' : 'default'}>
                {record.matchLabel}
              </Tag>
              <Tag>{record.region === 'beijing' ? '北京库' : '兰州库'}</Tag>
              <Tag color={result.color}>{result.label}</Tag>
            </Flex>
            <Text strong>{record.productName || '产品未记录'}</Text>
            <Text type="secondary">{record.biddingCompany || '招标公司未记录'} · {record.biddingNo || '编号未记录'}</Text>
            {commercial.length > 0 && <Text>{commercial.join('；')}</Text>}
            {(record.specification || record.purity || record.packaging) && (
              <Text>规格：{[record.specification, record.purity, record.packaging].filter(Boolean).join('；')}</Text>
            )}
            {(record.winningSupplier || record.brand) && (
              <Text>中标厂家/品牌：{[record.winningSupplier, record.brand].filter(Boolean).join('；')}</Text>
            )}
            {record.lossReason && <Text type="danger">复盘：{record.lossReason}</Text>}
            {record.qualificationSnapshot.length > 0 && (
              <Text>已确认资质：{record.qualificationSnapshot.join('；')}</Text>
            )}
          </article>
        );
      })}
      <Text type="secondary" className="bid-history-note">
        历史记录只证明曾经参与或中标；牌号、技术指标和当前资格仍需逐项核对。
      </Text>
    </div>
  );
};
