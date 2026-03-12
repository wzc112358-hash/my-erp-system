import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Descriptions, Button, Table, Card, Space, Spin, App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { CustomerAPI } from '@/api/customer';
import type { Customer, SalesContract } from '@/types/customer';

export const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [customerData, contractsData] = await Promise.all([
          CustomerAPI.getById(id),
          CustomerAPI.getContracts(id),
        ]);
        setCustomer(customerData);
        setContracts(contractsData.items);
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
        console.error('Fetch customer detail error:', err);
        message.error('加载客户详情失败');
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

  if (!customer) {
    return <div>客户不存在</div>;
  }

  const contractColumns = [
    {
      title: '合同编号',
      dataIndex: 'no',
      key: 'no',
    },
    {
      title: '产品名称',
      dataIndex: 'product_name',
      key: 'product_name',
    },
    {
      title: '合同金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      render: (amount: number) => `¥${amount.toLocaleString()}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, string> = {
          executing: '执行中',
          completed: '已完成',
          cancelled: '已取消',
        };
        return statusMap[status] || status;
      },
    },
    {
      title: '签订日期',
      dataIndex: 'created',
      key: 'created',
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN'),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/customers')}>
          返回列表
        </Button>
      </Space>

      <Card title="客户基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label="客户名称">{customer.name}</Descriptions.Item>
          <Descriptions.Item label="联系人">{customer.contact || '-'}</Descriptions.Item>
          <Descriptions.Item label="联系电话">{customer.phone || '-'}</Descriptions.Item>
          <Descriptions.Item label="电子邮箱">{customer.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="所在行业">{customer.industry || '-'}</Descriptions.Item>
          <Descriptions.Item label="所属地区">{customer.region || '-'}</Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>
            {customer.address || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="开户银行">{customer.bank_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="银行账号">{customer.bank_account || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {customer.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="关联的销售合同">
        <Table
          columns={contractColumns}
          dataSource={contracts}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '暂无关联合同' }}
        />
      </Card>
    </div>
  );
};

export default CustomerDetail;
