import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Drawer,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';

import { OpportunityAPI } from '@/api/opportunity';
import type { BidSourceOption, SiteSearchScope } from '@/types/opportunity';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

interface SearchScopeCenterProps {
  open: boolean;
  sources: BidSourceOption[];
  onClose: () => void;
  onChanged: (source: BidSourceOption) => void;
}

const termsText = (terms: string[]) => terms.join('\n');
const parseTerms = (value: string) => [...new Set(value
  .split(/[\n,，、;；]+/)
  .map((term) => term.normalize('NFKC').trim())
  .filter(Boolean))];

export const SearchScopeCenter: React.FC<SearchScopeCenterProps> = ({
  open,
  sources,
  onClose,
  onChanged,
}) => {
  const { message } = App.useApp();
  const editableSources = useMemo(
    () => sources.filter((source) => source.searchScopeEditable && source.searchScope),
    [sources],
  );
  const [sourceKey, setSourceKey] = useState('');
  const [productText, setProductText] = useState('');
  const [familyText, setFamilyText] = useState('');
  const [exploratoryText, setExploratoryText] = useState('');
  const [exploratoryTermsPerRun, setExploratoryTermsPerRun] = useState(2);
  const [saving, setSaving] = useState(false);

  const selected = editableSources.find((source) => source.sourceKey === sourceKey)
    || editableSources[0];

  useEffect(() => {
    if (open && !editableSources.some((source) => source.sourceKey === sourceKey)) {
      setSourceKey(editableSources[0]?.sourceKey || '');
    }
  }, [editableSources, open, sourceKey]);

  useEffect(() => {
    const scope = selected?.searchScope;
    if (!scope) return;
    setProductText(termsText(scope.productTerms));
    setFamilyText(termsText(scope.familyTerms));
    setExploratoryText(termsText(scope.exploratoryTerms));
    setExploratoryTermsPerRun(scope.exploratoryTermsPerRun);
  }, [selected]);

  const draft: SiteSearchScope = {
    productTerms: parseTerms(productText),
    familyTerms: parseTerms(familyText),
    exploratoryTerms: parseTerms(exploratoryText),
    exploratoryTermsPerRun,
  };

  const save = async () => {
    if (!selected) return;
    if (!draft.productTerms.some((term) => term.length >= 2)) {
      message.warning('产品库至少保留 1 个不少于 2 个字符的关键词');
      return;
    }
    setSaving(true);
    try {
      const updated = await OpportunityAPI.updateSourceSearchScope(selected.sourceKey, draft);
      onChanged(updated);
      message.success(`${selected.sourceName}的搜索范围已保存，下次巡检生效`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await OpportunityAPI.resetSourceSearchScope(selected.sourceKey);
      onChanged(updated);
      message.success(`${selected.sourceName}已恢复系统默认关键词`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '恢复失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      width="min(760px, 100vw)"
      title="巡检关键词管理"
      onClose={onClose}
      className="bid-search-scope-drawer"
      extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>保存配置</Button>}
    >
      <div className="bid-search-scope-intro">
        <Title level={5}>统一管理每日巡检范围</Title>
        <Paragraph type="secondary">这里的配置保存在 ERP，Agent 每次开始站点巡检时重新读取。精确产品每次都搜，品类词用于补充召回，宽泛探索词按天轮换，避免一次请求过多。</Paragraph>
      </div>

      <div className="bid-search-scope-field">
        <Text strong>选择站点</Text>
        <Select
          value={selected?.sourceKey}
          onChange={setSourceKey}
          options={editableSources.map((source) => ({
            value: source.sourceKey,
            label: source.searchScopeCustomized ? `${source.sourceName}（已自定义）` : source.sourceName,
          }))}
          className="bid-search-scope-select"
        />
        {selected && (
          <Flex gap={8} wrap align="center">
            <Tag color={selected.searchScopeCustomized ? 'green' : 'default'}>
              {selected.searchScopeCustomized ? '管理员自定义' : '系统默认'}
            </Tag>
            {selected.searchScopeUpdatedAt && (
              <Text type="secondary">最近修改：{selected.searchScopeUpdatedBy || '管理员'} · {new Date(selected.searchScopeUpdatedAt).toLocaleString('zh-CN')}</Text>
            )}
          </Flex>
        )}
      </div>

      <div className="bid-search-scope-grid">
        <label className="bid-search-scope-field">
          <Flex justify="space-between"><Text strong>产品库</Text><Text type="secondary">{draft.productTerms.length} 个</Text></Flex>
          <Text type="secondary">高意图精确词，每天全部搜索。每行一个，最多 64 个。</Text>
          <TextArea rows={9} value={productText} onChange={(event) => setProductText(event.target.value)} placeholder="阻聚剂\n磷酸三钙\n白油" />
        </label>
        <label className="bid-search-scope-field">
          <Flex justify="space-between"><Text strong>品类词</Text><Text type="secondary">{draft.familyTerms.length} 个</Text></Flex>
          <Text type="secondary">扩大召回的化工品类，每天全部搜索。最多 24 个。</Text>
          <TextArea rows={9} value={familyText} onChange={(event) => setFamilyText(event.target.value)} placeholder="化工原料\n油品\n水处理剂" />
        </label>
      </div>

      <div className="bid-search-scope-field bid-search-scope-exploration">
        <Flex justify="space-between" align="center" gap={16} wrap>
          <div>
            <Text strong>探索词</Text>
            <br />
            <Text type="secondary">用于发现产品库外的新化工品，每日只轮换部分词。</Text>
          </div>
          <Space>
            <Text>每站每日</Text>
            <InputNumber min={0} max={4} value={exploratoryTermsPerRun} onChange={(value) => setExploratoryTermsPerRun(value ?? 0)} />
            <Text>个</Text>
          </Space>
        </Flex>
        <TextArea rows={5} value={exploratoryText} onChange={(event) => setExploratoryText(event.target.value)} placeholder="油\n酸\n酯\n胺\n剂" />
        <Flex justify="space-between" align="center" gap={12} wrap>
          <Text type="secondary">当前 {draft.exploratoryTerms.length} 个探索词，最多 20 个。实际可关注信息仍会由 LLM 根据公告正文判断。</Text>
          <Popconfirm title="恢复系统默认关键词？" description="当前自定义内容将被清除。" onConfirm={() => void reset()}>
            <Button icon={<ReloadOutlined />} disabled={!selected?.searchScopeCustomized || saving}>恢复默认</Button>
          </Popconfirm>
        </Flex>
      </div>
    </Drawer>
  );
};
