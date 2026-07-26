import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Card, Descriptions, Flex, Form, Result, Space, Spin, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { BiddingRecordAPI } from '@/api/bidding-record';
import { OpportunityAPI } from '@/api/opportunity';
import type { BidPreparation, BiddingRecordFormData } from '@/types/bidding-record';

import { BiddingForm } from './BiddingForm';
import { BiddingHistoryReferences } from './BiddingHistoryReferences';
import { biddingSubmissionData } from './bidding-form-data';
import './BiddingCreatePage.css';

const { Text, Title } = Typography;

const suggestedValues = (preparation: BidPreparation): Partial<BiddingRecordFormData> => {
  const draft = preparation.draft;
  return {
    bidding_company: draft.biddingCompany,
    bidding_no: draft.biddingNo,
    product_name: draft.productName,
    quantity: draft.quantity,
    quantity_unit: draft.quantityUnit,
    specification: draft.specification,
    purity: draft.purity,
    packaging: draft.packaging,
    quoted_unit_price: draft.quotedUnitPrice,
    quoted_total_amount: draft.quotedTotalAmount,
    currency: draft.currency as BiddingRecordFormData['currency'],
    tender_fee: draft.tenderFee,
    bid_bond: draft.bidBond,
    open_date: draft.openDate ? dayjs(draft.openDate) : undefined,
    bid_result: 'pending',
    qualification_snapshot: draft.qualificationSnapshot,
    remark: draft.remark,
    source_notice_id: draft.sourceNoticeId,
    source_notice_fingerprint: draft.sourceNoticeFingerprint,
    source_notice_title: draft.sourceNoticeTitle,
    source_notice_url: draft.sourceNoticeUrl,
    source_name: draft.sourceName,
  };
};

export const BiddingCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const noticeId = params.get('noticeId') || '';
  const { message } = App.useApp();
  const [form] = Form.useForm<BiddingRecordFormData>();
  const [preparation, setPreparation] = useState<BidPreparation | null>(null);
  const [loading, setLoading] = useState(Boolean(noticeId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sourceValues = useMemo(() => preparation ? {
    bid_result: 'pending',
    source_notice_id: preparation.draft.sourceNoticeId,
    source_notice_fingerprint: preparation.draft.sourceNoticeFingerprint,
    source_notice_title: preparation.draft.sourceNoticeTitle,
    source_notice_url: preparation.draft.sourceNoticeUrl,
    source_name: preparation.draft.sourceName,
  } : null, [preparation]);

  useEffect(() => {
    if (!noticeId) {
      setError('缺少来源公告，无法创建投标草稿。');
      setLoading(false);
      return;
    }
    let active = true;
    void OpportunityAPI.prepareBid(noticeId)
      .then((result) => { if (active) setPreparation(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '投标草稿准备失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [noticeId]);

  useEffect(() => {
    if (sourceValues) form.setFieldsValue(sourceValues);
  }, [form, sourceValues]);

  const applyAgentDraft = () => {
    if (!preparation) return;
    form.setFieldsValue(suggestedValues(preparation));
    message.success('已填入公告中有明确依据的信息，请核对后提交');
  };

  const handleSubmit = async (values: BiddingRecordFormData) => {
    setSaving(true);
    try {
      const created = await BiddingRecordAPI.create(biddingSubmissionData(values));
      message.success('投标记录已创建');
      navigate(`/sales/bidding/${created.id}`);
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : '创建投标记录失败';
      message.error(/source_notice_fingerprint|unique/i.test(text) ? '该公告已经创建过投标记录' : text);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="bid-create-loading"><Spin size="large" tip="Agent 正在读取公告并查询双库历史" /></div>;
  if (error || !preparation) {
    return (
      <Result
        status="warning"
        title="无法创建投标草稿"
        subTitle={error || '没有取得公告信息'}
        extra={<Button onClick={() => navigate(-1)}>返回招投标信息</Button>}
      />
    );
  }
  if (preparation.existingRecord) {
    return (
      <Result
        status="info"
        title="该公告已经创建投标记录"
        subTitle={`${preparation.existingRecord.biddingNo || '编号待补充'} · ${preparation.existingRecord.productName}`}
        extra={[
          <Button key="back" onClick={() => navigate(-1)}>返回</Button>,
          <Button key="view" type="primary" onClick={() => navigate(`/sales/bidding/${preparation.existingRecord?.id}`)}>查看投标记录</Button>,
        ]}
      />
    );
  }

  return (
    <div className="bid-create-page">
      <Flex justify="space-between" align="flex-start" gap={16} wrap>
        <div>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回招投标信息</Button>
          <Title level={2}>新增投标记录</Title>
          <Text type="secondary">Agent 只预填公告中可追溯的信息，提交前必须由员工确认。</Text>
        </div>
        <Button type="primary" size="large" icon={<RobotOutlined />} onClick={applyAgentDraft}>
          Agent 一键填入
        </Button>
      </Flex>

      <Card className="bid-source-card" title="来源公告">
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="站点"><Tag>{preparation.notice.sourceName}</Tag></Descriptions.Item>
          <Descriptions.Item label="采购方">{preparation.notice.buyerName || '待确认'}</Descriptions.Item>
          <Descriptions.Item label="公告标题" span={2}>{preparation.notice.title}</Descriptions.Item>
          <Descriptions.Item label="截止时间">{preparation.notice.deadlineAt?.slice(0, 16) || '待确认'}</Descriptions.Item>
          <Descriptions.Item label="原公告"><a href={preparation.notice.url} target="_blank" rel="noreferrer">打开公告</a></Descriptions.Item>
        </Descriptions>
        {preparation.warnings.length > 0 && (
          <Alert className="bid-create-warning" type="warning" showIcon message={preparation.warnings.join('；')} />
        )}
      </Card>

      <Card title={`ERP 双库历史参考 · ${preparation.historicalMatches.length} 条`}>
        <BiddingHistoryReferences items={preparation.historicalMatches} />
      </Card>

      <Card title="投标信息" extra={<Space><Text type="secondary">带依据字段可一键填入</Text>{saving && <Spin size="small" />}</Space>}>
        <BiddingForm form={form} onFinish={handleSubmit} onCancel={() => navigate(-1)} />
      </Card>
    </div>
  );
};

export default BiddingCreatePage;
