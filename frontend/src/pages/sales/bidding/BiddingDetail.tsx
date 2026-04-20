import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Spin, App, Flex, Button, Tag } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { BiddingRecordAPI } from '@/api/bidding-record';
import type { BiddingRecord } from '@/types/bidding-record';

const bidResultMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待开标', color: 'orange' },
  won: { label: '中标', color: 'green' },
  lost: { label: '未中标', color: 'red' },
};

export const BiddingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [record, setRecord] = useState<BiddingRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const data = await BiddingRecordAPI.getById(id);
        setRecord(data);
      } catch (error) {
        const err = error as { name?: string; message?: string; cause?: { name?: string } };
        const isAborted =
          err.name === 'AbortError' ||
          err.name === 'CanceledError' ||
          err.message?.includes('aborted') ||
          err.message?.includes('autocancelled') ||
          err.cause?.name === 'AbortError';
        if (!isAborted) {
          console.error('Fetch bidding record detail error:', error);
          message.error('加载投标详情失败');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, message]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!record) {
    return null;
  }

  const renderFileLinks = (files: string[] | undefined) => {
    if (!files || files.length === 0) return '-';
    return (
      <Flex vertical gap="small">
        {files.map((file: string) => (
          <a
            key={file}
            href={`${pb.baseUrl}/api/files/bidding_records/${record.id}/${file}`}
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            <DownloadOutlined /> {file}
          </a>
        ))}
      </Flex>
    );
  };

  const resultInfo = bidResultMap[record.bid_result];

  return (
    <div style={{ padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/sales/bidding')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card title="投标基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="招标公司">{record.bidding_company}</Descriptions.Item>
          <Descriptions.Item label="招标编号">{record.bidding_no}</Descriptions.Item>
          <Descriptions.Item label="产品名称">{record.product_name}</Descriptions.Item>
          <Descriptions.Item label="数量">{record.quantity}</Descriptions.Item>

          <Descriptions.Item label="标书费">
            {record.tender_fee ? `¥${record.tender_fee.toFixed(6)}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="付标书费时间">
            {record.tender_fee_date?.split(' ')[0] || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="标书费发票附件" span={2}>
            {renderFileLinks(record.tender_fee_invoice)}
          </Descriptions.Item>

          <Descriptions.Item label="投标保证金">
            {record.bid_bond ? `¥${record.bid_bond.toFixed(6)}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="付保证金时间">
            {record.bid_bond_date?.split(' ')[0] || '-'}
          </Descriptions.Item>

          <Descriptions.Item label="开标时间">
            {record.open_date?.split(' ')[0] || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="中标结果">
            {resultInfo ? <Tag color={resultInfo.color}>{resultInfo.label}</Tag> : '-'}
          </Descriptions.Item>

          <Descriptions.Item label="保证金退还时间">
            {record.bond_return_date?.split(' ')[0] || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="退还金额">
            {record.bond_return_amount ? `¥${record.bond_return_amount.toFixed(6)}` : '-'}
          </Descriptions.Item>

          <Descriptions.Item label="招标代理费">
            {record.agency_fee ? `¥${record.agency_fee.toFixed(6)}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="关联销售合同">
            {record.expand?.sales_contract ? (
              <a onClick={() => navigate(`/sales/contracts/${record.expand!.sales_contract!.id}`)}>
                {record.expand.sales_contract.no} - {record.expand.sales_contract.product_name}
              </a>
            ) : '-'}
          </Descriptions.Item>

          <Descriptions.Item label="备注" span={2}>{record.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="附件" span={2}>
            {renderFileLinks(record.attachments)}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default BiddingDetail;
