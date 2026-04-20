import { useState, useEffect } from 'react';
import { Table, Button, Space, App, Modal, Tag, Descriptions, Popconfirm } from 'antd';
import { EyeOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { SalesNotificationAPI } from '@/api/sales-notification';
import { PurchaseContractAPI } from '@/api/purchase-contract';
import { useNotificationStore } from '@/stores/notification';
import type { SalesNotification } from '@/types/sales-notification';
import type { PurchaseContract } from '@/types/purchase-contract';

const typeMap: Record<string, { text: string; color: string }> = {
  purchase_contract_created: { text: '采购合同创建', color: 'blue' },
  purchase_contract_reminder: { text: '采购合同提醒', color: 'blue' },
  exchange_rate_changed: { text: '汇率变更', color: 'orange' },
};

export const NotificationList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { decrementUnread } = useNotificationStore();
  const [data, setData] = useState<SalesNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailVisible, setDetailVisible] = useState(false);
  const [contractVisible, setContractVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<SalesNotification | null>(null);
  const [selectedContract, setSelectedContract] = useState<PurchaseContract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await SalesNotificationAPI.list({
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

  const handleViewDetail = async (record: SalesNotification) => {
    try {
      const fullNotification = await SalesNotificationAPI.getById(record.id);
      setSelectedNotification(fullNotification);
      setDetailVisible(true);
      
      if (!record.is_read) {
        await SalesNotificationAPI.markAsRead(record.id);
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
      await SalesNotificationAPI.markAsRead(id);
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
      await SalesNotificationAPI.delete(id);
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
      const contract = await PurchaseContractAPI.getById(contractId);
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
      render: (_: unknown, record: SalesNotification) => (
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

  const statusMap: Record<string, { text: string; color: string }> = {
    executing: { text: '执行中', color: 'blue' },
    completed: { text: '已完成', color: 'green' },
    cancelled: { text: '已取消', color: 'red' },
  };

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
          selectedNotification?.purchase_contract && (
            <Button
              key="contract"
              type="primary"
              onClick={() => handleGoToContract(selectedNotification.purchase_contract)}
              loading={contractLoading}
            >
              查看采购合同
            </Button>
          ),
          selectedNotification?.purchase_contract && (
            <Button
              key="create"
              onClick={() => {
                setDetailVisible(false);
                navigate(`/sales/contracts?purchaseContract=${selectedNotification.purchase_contract}`);
              }}
            >
              去创建销售合同
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
            {selectedNotification.expand?.purchase_contract && (
              <div style={{ marginTop: 16 }}>
                <strong>关联采购合同：</strong>
                <p>合同编号：{selectedNotification.expand.purchase_contract.no}</p>
                <p>产品名称：{selectedNotification.expand.purchase_contract.product_name}</p>
                <p>合同金额：{selectedNotification.expand.purchase_contract.is_cross_border ? `$${selectedNotification.expand.purchase_contract.total_amount?.toFixed(6)} USD` : `¥${selectedNotification.expand.purchase_contract.total_amount?.toFixed(6)}`}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        title="采购合同详情"
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
            <Descriptions.Item label="供应商">
              {selectedContract.expand?.supplier?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="产品单价">
              ¥{selectedContract.unit_price?.toFixed(6)}
            </Descriptions.Item>
            <Descriptions.Item label="合同总数量">
              {selectedContract.total_quantity} 吨
            </Descriptions.Item>
            <Descriptions.Item label="合同总金额" span={2}>
              ¥{selectedContract.total_amount?.toFixed(6)}
            </Descriptions.Item>
            <Descriptions.Item label="签订日期">
              {selectedContract.sign_date?.split(' ')[0] || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {statusMap[selectedContract.status]?.text || selectedContract.status}
            </Descriptions.Item>
            <Descriptions.Item label="已执行数量">
              {selectedContract.executed_quantity} 吨
            </Descriptions.Item>
            <Descriptions.Item label="执行进度">
              {selectedContract.execution_percent?.toFixed(1)}%
            </Descriptions.Item>
            <Descriptions.Item label="已收票金额">
              ¥{selectedContract.invoiced_amount?.toFixed(6)}
            </Descriptions.Item>
            <Descriptions.Item label="收票进度">
              {selectedContract.invoiced_percent?.toFixed(1)}%
            </Descriptions.Item>
            <Descriptions.Item label="已付款金额">
              ¥{selectedContract.paid_amount?.toFixed(6)}
            </Descriptions.Item>
            <Descriptions.Item label="付款进度">
              {selectedContract.paid_percent?.toFixed(1)}%
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
