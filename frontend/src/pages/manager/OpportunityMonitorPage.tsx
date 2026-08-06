import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Flex,
  Input,
  Modal,
  Row,
  Segmented,
  Select,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { CopyOutlined, KeyOutlined, ReloadOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';

import { OpportunityAPI } from '@/api/opportunity';
import { useAuthStore } from '@/stores/auth';
import type {
  BidCollectionRun,
  BidNotice,
  BidNoticeKind,
  BidSourceOption,
  LocalHelperPairingInvitation,
} from '@/types/opportunity';
import { BidNoticeDetail } from './opportunity/BidNoticeDetail';
import { BidNoticeGroups } from './opportunity/BidNoticeGroups';
import { BidRunStatus } from './opportunity/BidRunStatus';
import { SearchScopeCenter } from './opportunity/SearchScopeCenter';
import './opportunity/OpportunityMonitorPage.css';

const { Text, Title } = Typography;
const NOTICE_FETCH_LIMIT = 5000;

const OpportunityMonitorPage: React.FC = () => {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<BidNotice[]>([]);
  const [runs, setRuns] = useState<BidCollectionRun[]>([]);
  const [sources, setSources] = useState<BidSourceOption[]>([]);
  const [selected, setSelected] = useState<BidNotice | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeKind, setActiveKind] = useState<BidNoticeKind>('current');
  const [source, setSource] = useState<string>();
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingInvitation, setPairingInvitation] = useState<LocalHelperPairingInvitation | null>(null);
  const [pairingClock, setPairingClock] = useState(Date.now());
  const [searchScopeOpen, setSearchScopeOpen] = useState(false);

  useEffect(() => {
    if (!pairingOpen) return undefined;
    setPairingClock(Date.now());
    const timer = window.setInterval(() => setPairingClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pairingOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [noticeResult, runItems, sourceItems] = await Promise.all([
        OpportunityAPI.listNotices({ page: 1, perPage: NOTICE_FETCH_LIMIT, source, search }),
        OpportunityAPI.listRuns(),
        OpportunityAPI.listSources(),
      ]);
      setItems(noticeResult.items);
      setRuns(runItems);
      setSources(sourceItems);
    } catch (error) {
      console.error('Load bid notices error:', error);
      message.error(error instanceof Error ? error.message : '加载招投标信息失败');
    } finally {
      setLoading(false);
    }
  }, [message, search, source]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visibleItems = useMemo(() => {
    const sourceOrder = new Map(sources.map((item, index) => [item.sourceKey, index]));
    return items
      .filter((item) => item.kind === activeKind)
      .sort((left, right) => (
        (sourceOrder.get(left.sourceKey) ?? Number.MAX_SAFE_INTEGER)
        - (sourceOrder.get(right.sourceKey) ?? Number.MAX_SAFE_INTEGER)
      ));
  }, [activeKind, items, sources]);

  const localHelperSources = useMemo(
    () => sources.filter((item) => item.collectionMode === 'local_helper'),
    [sources],
  );

  useEffect(() => {
    setSelected((current) => (
      visibleItems.find((item) => item.id === current?.id) || visibleItems[0] || null
    ));
  }, [visibleItems]);

  const metrics = useMemo(() => {
    const current = items.filter((item) => item.kind === 'current').length;
    const attention = items.filter((item) => item.kind === 'attention').length;
    const newestRunDate = runs[0]?.runDate.slice(0, 10);
    const latestRuns = runs.filter((run) => run.runDate.slice(0, 10) === newestRunDate);
    const scheduledSourceCount = sources.filter((item) => item.collectionMode === 'scheduled').length;
    return {
      current,
      attention,
      newCount: latestRuns.reduce((sum, run) => sum + run.newCount, 0),
      successSources: new Set(latestRuns.filter((run) => run.status !== 'failed').map((run) => run.sourceKey)).size,
      scheduledSourceCount,
    };
  }, [items, runs, sources]);

  const applySearch = () => {
    setSearch(searchInput.trim());
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    message.success('摘要已复制');
  };

  const generatePairingCode = async () => {
    setPairingLoading(true);
    try {
      const invitation = await OpportunityAPI.createLocalHelperPairingCode();
      setPairingInvitation(invitation);
      setPairingClock(Date.now());
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成配对码失败');
    } finally {
      setPairingLoading(false);
    }
  };

  const openPairing = () => {
    setPairingOpen(true);
    setPairingInvitation(null);
    void generatePairingCode();
  };

  const updateSource = (updated: BidSourceOption) => {
    setSources((current) => current.map((item) => (
      item.sourceKey === updated.sourceKey ? updated : item
    )));
  };

  const pairingSecondsLeft = pairingInvitation
    ? Math.max(0, Math.ceil((new Date(pairingInvitation.expiresAt).getTime() - pairingClock) / 1_000))
    : 0;

  return (
    <div className="manager-page bid-monitor-page">
      <Flex justify="space-between" align="flex-start" gap={16} wrap className="bid-page-heading">
        <div>
          <Title level={3}>招投标信息</Title>
          <Text type="secondary">10 个公开站点每日 08:00 自动巡检；中国石油、裕龙由本地助手完成人工验证后上传，全部由云端 Agent 研判并去重。</Text>
        </div>
        <Flex gap={8} wrap>
          {user?.type === 'manager' && (
            <Button icon={<SettingOutlined />} onClick={() => setSearchScopeOpen(true)}>关键词管理</Button>
          )}
          <Button icon={<KeyOutlined />} onClick={openPairing}>连接本地助手</Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>刷新数据</Button>
        </Flex>
      </Flex>

      <Row gutter={[12, 12]} className="bid-metric-grid">
        <Col xs={12} lg={6}><Card><Statistic title="最近巡检新增" value={metrics.newCount} suffix="条" /></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="筛选内当前商机" value={metrics.current} suffix="条" /></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="筛选内可关注商机" value={metrics.attention} suffix="条" /></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="最近自动巡检站点" value={metrics.successSources} suffix={`/ ${metrics.scheduledSourceCount || 10}`} /></Card></Col>
      </Row>

      <Card className="bid-filter-card">
        <Flex gap={12} wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索公告、采购方或产品"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onPressEnter={applySearch}
            className="bid-search-input"
          />
          <Select
            allowClear
            placeholder="全部站点"
            value={source}
            onChange={setSource}
            options={sources.map((item) => ({
              label: item.collectionMode === 'local_helper' ? `${item.sourceName}（本地助手）` : item.sourceName,
              value: item.sourceKey,
            }))}
            className="bid-filter-select"
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={applySearch}>查询</Button>
        </Flex>
        {localHelperSources.length > 0 && (
          <div className="bid-local-source-strip" aria-label="本地助手上传站点">
            <Text type="secondary">本地助手上传站点</Text>
            {localHelperSources.map((item) => (
              <Tag key={item.sourceKey} bordered={false} color="processing">
                {item.sourceName} · {items.some((notice) => notice.sourceKey === item.sourceKey) ? '已有数据' : '等待首次上传'}
              </Tag>
            ))}
          </div>
        )}
      </Card>

      <div className="bid-workspace">
        <Card
          className="bid-list-card"
          title={(
            <div className="bid-list-card-title">
              <span>{activeKind === 'current' ? '当前商机' : '可关注商机'}</span>
              <Text type="secondary">按站点归类 · {visibleItems.length} 条</Text>
            </div>
          )}
        >
          <div className="bid-kind-switch">
            <Segmented
              block
              value={activeKind}
              onChange={(value) => setActiveKind(value as BidNoticeKind)}
              options={[
                { label: `当前商机 ${metrics.current}`, value: 'current' },
                { label: `可关注商机 ${metrics.attention}`, value: 'attention' },
              ]}
            />
          </div>
          <div className="bid-list-scroll" aria-label={`${activeKind === 'current' ? '当前商机' : '可关注商机'}列表`}>
            <BidNoticeGroups
              key={`${activeKind}-${source || 'all'}-${search}`}
              items={visibleItems}
              loading={loading}
              selectedId={selected?.id}
              sources={sources}
              selectedSourceKey={source}
              showEmptyLocalSources={!search}
              onSelect={setSelected}
            />
          </div>
        </Card>
        <Card className="bid-detail-card">
          <BidNoticeDetail notice={selected} onCopy={(text) => void copyText(text)} />
        </Card>
      </div>

      <BidRunStatus runs={runs} />

      <SearchScopeCenter
        open={searchScopeOpen}
        sources={sources}
        onClose={() => setSearchScopeOpen(false)}
        onChanged={updateSource}
      />

      <Modal
        open={pairingOpen}
        title="连接本地助手"
        onCancel={() => setPairingOpen(false)}
        footer={[
          <Button key="regenerate" loading={pairingLoading} onClick={() => void generatePairingCode()}>
            重新生成
          </Button>,
          <Button
            key="copy"
            type="primary"
            icon={<CopyOutlined />}
            disabled={!pairingInvitation || pairingSecondsLeft <= 0}
            onClick={() => pairingInvitation && void copyText(pairingInvitation.code)}
          >
            复制配对码
          </Button>,
        ]}
      >
        <div className="bid-pairing-panel">
          <Text type="secondary">在本地助手主窗口点击“连接 ERP 云端”，填写下面的一次性配对码。</Text>
          {pairingInvitation ? (
            <>
              <Title level={2} className="bid-pairing-code">{pairingInvitation.code}</Title>
              <Text type={pairingSecondsLeft > 0 ? 'secondary' : 'danger'}>
                {pairingSecondsLeft > 0
                  ? `剩余 ${Math.floor(pairingSecondsLeft / 60)}:${String(pairingSecondsLeft % 60).padStart(2, '0')}，使用一次后立即失效`
                  : '配对码已过期，请重新生成'}
              </Text>
              <Text type="secondary">云端地址：https://agent.henghuacheng.cn</Text>
            </>
          ) : (
            <Text type="secondary">{pairingLoading ? '正在生成安全配对码…' : '暂未生成配对码'}</Text>
          )}
          <Text type="secondary">每次重新生成都会使上一个尚未使用的配对码失效。</Text>
        </div>
      </Modal>
    </div>
  );
};

export default OpportunityMonitorPage;
