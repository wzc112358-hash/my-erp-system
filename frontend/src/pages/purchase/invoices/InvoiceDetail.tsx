import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, Space, App, Spin, Divider, Table, Tag } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { PurchaseInvoiceAPI } from '@/api/purchase-invoice';
import type { PurchaseInvoice } from '@/types/purchase-contract';
import { pb } from '@/lib/pocketbase';

export const InvoiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const result = await PurchaseInvoiceAPI.getById(id);
        setInvoice(result);
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

  const handleDownload = (filePath: string) => {
    const url = pb.files.getUrl(invoice as PurchaseInvoice, filePath);
    window.open(url, '_blank');
  };

  const getAttachmentColumns = () => {
    return [
      {
        title: '文件名',
        dataIndex: '',
        key: 'filename',
        render: (_: unknown, record: string) => {
          const filename = record.split('/').pop() || record;
          return filename;
        },
      },
      {
        title: '操作',
        key: 'action',
        render: (_: unknown, record: string) => (
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record)}
          >
            下载
          </Button>
        ),
      },
    ];
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <p>发票不存在</p>
          <Button type="primary" onClick={() => navigate('/purchase/invoices')}>
            返回列表
          </Button>
        </Card>
      </div>
    );
  }

  const attachments = invoice.attachments
    ? Array.isArray(invoice.attachments)
      ? invoice.attachments
      : [invoice.attachments]
    : [];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="发票详情"
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchase/invoices')}>
              返回列表
            </Button>
          </Space>
        }
      >
        <Descriptions column={2} bordered>
          <Descriptions.Item label="发票号码">{invoice.no}</Descriptions.Item>
          <Descriptions.Item label="产品名称">{invoice.product_name}</Descriptions.Item>
          <Descriptions.Item label="发票类型">{invoice.invoice_type}</Descriptions.Item>
          <Descriptions.Item label="产品数量">{invoice.product_amount} 吨</Descriptions.Item>
          <Descriptions.Item label="发票金额">{invoice.amount?.toFixed(2)}</Descriptions.Item>
          <Descriptions.Item label="收票日期">{invoice.receive_date}</Descriptions.Item>
          <Descriptions.Item label="是否验票">
            {invoice.is_verified === 'yes' ? <Tag color="green">已验票</Tag> : <Tag color="orange">未验票</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="关联采购合同">
            {invoice.expand?.purchase_contract?.no || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {invoice.remark || '-'}
          </Descriptions.Item>
        </Descriptions>

        {attachments.length > 0 && (
          <>
            <Divider>附件</Divider>
            <Table
              columns={getAttachmentColumns()}
              dataSource={attachments}
              rowKey={(record) => record}
              pagination={false}
              size="small"
            />
          </>
        )}
      </Card>
    </div>
  );
};

export default InvoiceDetail;
