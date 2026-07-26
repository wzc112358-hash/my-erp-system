import { Collapse, Empty, Skeleton, Typography } from 'antd';
import { useMemo } from 'react';

import type { BidNotice, BidSourceOption } from '@/types/opportunity';
import { BidNoticeList } from './BidNoticeList';

const { Text } = Typography;

interface BidNoticeGroup {
  sourceKey: string;
  sourceName: string;
  items: BidNotice[];
}

interface BidNoticeGroupsProps {
  items: BidNotice[];
  loading: boolean;
  selectedId?: string;
  sources: BidSourceOption[];
  selectedSourceKey?: string;
  showEmptyLocalSources?: boolean;
  onSelect: (notice: BidNotice) => void;
}

const groupNotices = (
  items: BidNotice[],
  sources: BidSourceOption[],
  selectedSourceKey?: string,
  showEmptyLocalSources = false,
): BidNoticeGroup[] => {
  const sourceOrder = new Map(sources.map((source, index) => [source.sourceKey, index]));
  const groups = new Map<string, BidNoticeGroup>();

  if (showEmptyLocalSources) {
    sources
      .filter((source) => source.collectionMode === 'local_helper')
      .filter((source) => !selectedSourceKey || source.sourceKey === selectedSourceKey)
      .forEach((source) => groups.set(source.sourceKey, {
        sourceKey: source.sourceKey,
        sourceName: source.sourceName,
        items: [],
      }));
  }

  items.forEach((item) => {
    const group = groups.get(item.sourceKey);
    if (group) {
      group.items.push(item);
      return;
    }
    groups.set(item.sourceKey, {
      sourceKey: item.sourceKey,
      sourceName: item.sourceName,
      items: [item],
    });
  });

  return [...groups.values()].sort((left, right) => (
    (sourceOrder.get(left.sourceKey) ?? Number.MAX_SAFE_INTEGER)
    - (sourceOrder.get(right.sourceKey) ?? Number.MAX_SAFE_INTEGER)
  ));
};

export const BidNoticeGroups: React.FC<BidNoticeGroupsProps> = ({
  items,
  loading,
  selectedId,
  sources,
  selectedSourceKey,
  showEmptyLocalSources = false,
  onSelect,
}) => {
  const groups = useMemo(
    () => groupNotices(items, sources, selectedSourceKey, showEmptyLocalSources),
    [items, selectedSourceKey, showEmptyLocalSources, sources],
  );

  if (loading && !items.length) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!groups.length) return <Empty description="当前筛选条件下没有招投标信息" />;

  return (
    <Collapse
      className="bid-site-groups"
      defaultActiveKey={groups[0]?.sourceKey ? [groups[0].sourceKey] : []}
      items={groups.map((group) => ({
        key: group.sourceKey,
        label: (
          <div className="bid-site-group-heading">
            <Text strong>{group.sourceName}</Text>
            <Text type="secondary">{group.items.length} 条</Text>
          </div>
        ),
        children: (
          <div className="bid-group-list">
            {group.items.length ? (
              <BidNoticeList
                grouped
                items={group.items}
                loading={false}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="等待本地助手完成采集并上传"
              />
            )}
          </div>
        ),
      }))}
    />
  );
};
