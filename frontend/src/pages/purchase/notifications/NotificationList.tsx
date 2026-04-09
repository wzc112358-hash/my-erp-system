import { useState, useEffect } from 'react';
import { Table, Button, Space, App, Modal, Tag, Descriptions, Popconfirm } from 'antd';
import { EyeOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { NotificationAPI } from '@/api/notification';
import { SalesContractAPI } from '@/api/sales-contract';
import { useNotificationStore } from '@/stores/notification';
import type { Notification } from '@/types/notification';
import type { SalesContract } from '@/types/sales-contract';

const typeMap: Record<string, { text: string; color: string }> = {
  sales_contract_created: { text: '销售合同创建', color: 'blue' },
};

export const NotificationList: React.FC = () => {
  const { message } = App.useApp();
  const { decrementUnread } = useNotificationStore();
  const [data, setData] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailVisible, setDetailVisible] = useState(false);
  const [contractVisible, setContractVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [selectedContract, setSelectedContract] = useState<SalesContract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await NotificationAPI.list({
        page,
        per_page: pageSize,
      });
      setData(result.items);
      setTotal(result.totalItems);
    } catch (err) {
      const error = err as { name?: string; message?: string; cause?: { name?: string } };
      const isAborted =
        error.name === 'AbortError' ||
        error.name === 'CanceledError' ||
        error.message?.includes('aborted') ||
        error.message?.includes('autocancelled') ||
        error.cause?.name === 'AbortError';
      if (isAborted) {
        return;
      }
      console.error('Fetch notifications error:', err);
      message.error('加载通知列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize]);

  const handleViewDetail = async (record: Notification) => {
    try {
      const fullNotification = await NotificationAPI.getById(record.id);
      setSelectedNotification(fullNotification);
      setDetailVisible(true);
      
      if (!record.is_read) {
        await NotificationAPI.markAsRead(record.id);
        decrementUnread();
        fetchData();
      }
    } catch (err) {
      console.error('Fetch notification detail error:', err);
      message.error('加载通知详情失败');
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await NotificationAPI.markAsRead(id);
      message.success('标记已读成功');
      decrementUnread();
      fetchData();
    } catch (err) {
      console.error('Mark as read error:', err);
      message.error('标记已读失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const record = data.find(n => n.id === id);
      await NotificationAPI.delete(id);
      if (record && !record.is_read) {
        decrementUnread();
      }
      message.success('删除成功');
      fetchData();
    } catch (err) {
      console.error('Delete notification error:', err);
      message.error('删除失败');
    }
  };

  const handleGoToContract = async (contractId: string) => {
    setContractLoading(true);
    try {
      const contract = await SalesContractAPI.getById(contractId);
      setSelectedContract(contract);
      setContractVisible(true);
    } catch (err) {
      console.error('Fetch contract error:', err);
      message.error('加载合同详情失败');
    } finally {
      setContractLoading(false);
    }
  };

  const columns = [
    {
      title: '通知类型',
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (type: string) => {
        const info = typeMap[type] || { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 300,
    },
    {
      title: '时间',
      dataIndex: 'created',
      key: 'created',
      width: 180,
      render: (date: string) => (date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '状态',
      dataIndex: 'is_read',
      key: 'is_read',
      width: 100,
      render: (isRead: boolean) => (
        <span style={{ color: isRead ? '#999' : '#f5222d' }}>
          {isRead ? '已读' : '未读'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right' as const,
      render: (_: unknown, record: Notification) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          />
          {!record.is_read && (
            <Button
              type="text"
              icon={<CheckOutlined />}
              onClick={() => handleMarkAsRead(record.id)}
              title="标记已读"
            />
          )}
          <Popconfirm
            title="确定删除此通知？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (p: number, ps: number) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        locale={{ emptyText: '暂无通知' }}
        scroll={{ x: 800 }}
      />

      <Modal
        title={selectedNotification?.title || '通知详情'}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>,
          selectedNotification?.sales_contract && (
            <Button
              key="contract"
              type="primary"
              onClick={() => handleGoToContract(selectedNotification.sales_contract)}
              loading={contractLoading}
            >
              查看销售合同
            </Button>
          ),
        ]}
        width={600}
      >
        {selectedNotification && (
          <div>
            <p>
              <strong>通知类型：</strong>
              {typeMap[selectedNotification.type]?.text || selectedNotification.type}
            </p>
            <p>
              <strong>通知时间：</strong>
              {dayjs(selectedNotification.created).format('YYYY-MM-DD HH:mm:ss')}
            </p>
            <p>
              <strong>状态：</strong>
              {selectedNotification.is_read ? '已读' : '未读'}
            </p>
            <p>
              <strong>通知内容：</strong>
            </p>
            <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 4 }}>
              {selectedNotification.message}
            </div>
            {selectedNotification.expand?.sales_contract && (
              <div style={{ marginTop: 16 }}>
                <strong>关联销售合同：</strong>
                <p>合同编号：{selectedNotification.expand.sales_contract.no}</p>
                <p>产品名称：{selectedNotification.expand.sales_contract.product_name}</p>
                <p>合同金额：¥{selectedNotification.expand.sales_contract.total_amount?.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        title="销售合同详情"
        open={contractVisible}
        onCancel={() => setContractVisible(false)}
        footer={[
          <Button key="close" onClick={() => setContractVisible(false)}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {selectedContract && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="合同编号" span={2}>
              {selectedContract.no}
            </Descriptions.Item>
            <Descriptions.Item label="产品名称">
              {selectedContract.product_name}
            </Descriptions.Item>
            <Descriptions.Item label="客户">
              {selectedContract.expand?.customer?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="产品单价">
              ¥{selectedContract.unit_price?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="合同总数量">
              {selectedContract.total_quantity} 吨
            </Descriptions.Item>
            <Descriptions.Item label="合同总金额" span={2}>
              ¥{selectedContract.total_amount?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="签订日期">
              {selectedContract.sign_date?.split(' ')[0] || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {selectedContract.status === 'executing' ? '执行中' : selectedContract.status === 'completed' ? '已完成' : '已取消'}
            </Descriptions.Item>
            <Descriptions.Item label="已执行数量">
              {selectedContract.executed_quantity} 吨
            </Descriptions.Item>
            <Descriptions.Item label="执行进度">
              {selectedContract.execution_percent?.toFixed(1)}%
            </Descriptions.Item>
            <Descriptions.Item label="已收款金额">
              ¥{selectedContract.receipted_amount?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="收款进度">
              {selectedContract.receipt_percent?.toFixed(1)}%
            </Descriptions.Item>
            <Descriptions.Item label="欠款金额">
              ¥{selectedContract.debt_amount?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="欠款进度">
              {selectedContract.debt_percent?.toFixed(1)}%
            </Descriptions.Item>
            <Descriptions.Item label="已开票金额">
              ¥{selectedContract.invoiced_amount?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="开票进度">
              {selectedContract.invoice_percent?.toFixed(1)}%
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {selectedContract.remark || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default NotificationList;
