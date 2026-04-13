import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Descriptions, Button, Table, Card, Space, Spin, App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { SupplierAPI } from '@/api/supplier';
import type { Supplier, PurchaseContract } from '@/types/supplier';

export const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [contracts, setContracts] = useState<PurchaseContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [supplierData, contractsData] = await Promise.all([
          SupplierAPI.getById(id),
          SupplierAPI.getContracts(id),
        ]);
        setSupplier(supplierData);
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
        console.error('Fetch supplier detail error:', err);
        message.error('加载供应商详情失败');
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

  if (!supplier) {
    return <div>供应商不存在</div>;
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
      render: (amount: number) => `¥${amount.toFixed(4)}`,
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
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchase/suppliers')}>
          返回列表
        </Button>
      </Space>

      <Card title="供应商基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label="供应商名称">{supplier.name}</Descriptions.Item>
          <Descriptions.Item label="联系人">{supplier.contact || '-'}</Descriptions.Item>
          <Descriptions.Item label="联系电话">{supplier.phone || '-'}</Descriptions.Item>
          <Descriptions.Item label="电子邮箱">{supplier.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="所在行业">{supplier.industry || '-'}</Descriptions.Item>
          <Descriptions.Item label="所属地区">{supplier.region || '-'}</Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>
            {supplier.address || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="开户银行">{supplier.bank_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="银行账号">{supplier.bank_account || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {supplier.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="关联的采购合同">
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

export default SupplierDetail;
