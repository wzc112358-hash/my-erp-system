import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Spin, App, Flex, Button } from 'antd';
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { ExpenseRecordAPI } from '@/api/expense-record';
import type { ExpenseRecord } from '@/types/expense-record';

export const ExpenseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [record, setRecord] = useState<ExpenseRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const data = await ExpenseRecordAPI.getById(id);
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
          console.error('Fetch expense record detail error:', error);
          message.error('加载支出详情失败');
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

  return (
    <div style={{ padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/purchase/expenses')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card title="支出记录详情" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="记录编号">{record.no}</Descriptions.Item>
          <Descriptions.Item label="支出类型">{record.expense_type}</Descriptions.Item>
          <Descriptions.Item label="描述说明" span={2}>{record.description}</Descriptions.Item>
          <Descriptions.Item label="付款金额">
            {record.payment_amount ? `¥${record.payment_amount.toFixed(6)}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="付款日期">{record.pay_date?.split(' ')[0]}</Descriptions.Item>
          <Descriptions.Item label="付款方式">{record.method || '-'}</Descriptions.Item>
          <Descriptions.Item label="采购负责人">{record.purchasing_manager || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{record.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="附件" span={2}>
            {record.attachments && record.attachments.length > 0 ? (
              <Flex vertical gap="small">
                {record.attachments.map((file: string) => (
                    <a
                      key={file}
                      href={`${pb.baseUrl}/api/files/expense_records/${record.id}/${file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      <DownloadOutlined /> {file}
                    </a>
                  ))}
              </Flex>
            ) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default ExpenseDetail;
