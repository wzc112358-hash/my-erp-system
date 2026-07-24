import { Collapse, Flex, Tag, Typography } from 'antd';

import type { BidCollectionRun } from '@/types/opportunity';

const { Text } = Typography;

const statusMeta: Record<string, { color: string; label: string }> = {
  success: { color: 'green', label: '有新增' },
  no_new: { color: 'default', label: '无新增' },
  partial: { color: 'orange', label: '部分成功' },
  failed: { color: 'red', label: '失败' },
};

export const BidRunStatus: React.FC<{ runs: BidCollectionRun[] }> = ({ runs }) => (
  <Collapse
    ghost
    className="bid-run-status"
    items={[{
      key: 'status',
      label: `数据更新状态 · 最近 ${Math.min(10, runs.length)} 个站点`,
      children: (
        <div className="bid-run-grid">
          {runs.slice(0, 10).map((run) => {
            const meta = statusMeta[run.status] || statusMeta.no_new;
            return (
              <div className="bid-run-item" key={run.id}>
                <Flex justify="space-between" align="center" gap={8}>
                  <Text strong>{run.sourceName}</Text>
                  <Tag color={meta.color}>{meta.label}</Tag>
                </Flex>
                <Text type="secondary">
                  读取 {run.rawCount} · 有效 {run.eligibleCount} · 新增 {run.newCount}
                </Text>
                {run.errorMessage && <Text type="danger" ellipsis title={run.errorMessage}>{run.errorMessage}</Text>}
              </div>
            );
          })}
        </div>
      ),
    }]}
  />
);
