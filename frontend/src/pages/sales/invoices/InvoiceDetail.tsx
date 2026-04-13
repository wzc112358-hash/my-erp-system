import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Descriptions, Button, Space, App, Card, Table } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { SaleInvoiceAPI } from '@/api/sales-invoice';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import type { SaleInvoice } from '@/types/sales-contract';

export const InvoiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<SaleInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState(7.25);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const result = await SaleInvoiceAPI.getById(id);
        setData(result);
      } catch (error) {
        const err = error as { response?: { status?: number }; message?: string };
        if (err.response?.status === 0 || err.message?.includes('aborted')) {
          return;
        }
        console.error('Fetch invoice error:', error);
        message.error('加载发票详情失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, message]);

  useEffect(() => {
    getUsdToCnyRate().then(setExchangeRate);
  }, []);

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div style={{ padding: 24 }}>加载中...</div>;
  }

  if (!data) {
    return <div style={{ padding: 24 }}>发票不存在</div>;
  }

  const attachmentColumns = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: { url: string; filename: string }) => (
        <Button
          type="link"
          icon={<DownloadOutlined />}
          onClick={() => handleDownload(record.url, record.filename)}
        >
          下载
        </Button>
      ),
    },
  ];

  const getAttachmentData = () => {
    const files = data.attachments;
    if (!files || files.length === 0) return [];
    return files
      .filter(Boolean)
      .map((filename, index) => ({
        key: index,
        url: `${pb.baseUrl}/api/files/sale_invoices/${data.id}/${filename}`,
        filename,
      }));
  };
  const attachmentData = getAttachmentData();

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/invoices')}>
            返回
          </Button>
        </Space>
      </div>

      <Card title="发票基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label="发票号码">{data.no}</Descriptions.Item>
          <Descriptions.Item label="发票类型">{data.invoice_type}</Descriptions.Item>
          <Descriptions.Item label="产品名称">{data.product_name}</Descriptions.Item>
          <Descriptions.Item label="产品数量">{data.product_amount} 吨</Descriptions.Item>
          <Descriptions.Item label="发票金额">
            {data.expand?.sales_contract?.is_cross_border
              ? `$${data.amount?.toFixed(4)}（≈ ¥${(data.amount * exchangeRate)?.toFixed(4)}）`
              : `¥${data.amount?.toFixed(4)}`}
          </Descriptions.Item>
          <Descriptions.Item label="开票日期">{data.issue_date}</Descriptions.Item>
          <Descriptions.Item label="关联合同编号" span={1}>
            {data.expand?.sales_contract?.no || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="关联合同产品" span={1}>
            {data.expand?.sales_contract?.product_name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {data.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="附件">
        {attachmentData.length > 0 ? (
          <Table
            columns={attachmentColumns}
            dataSource={attachmentData}
            pagination={false}
            locale={{ emptyText: '暂无附件' }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#999' }}>暂无附件</div>
        )}
      </Card>
    </div>
  );
};

export default InvoiceDetail;
