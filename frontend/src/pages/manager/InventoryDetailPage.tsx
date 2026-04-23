import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Button,
  Table,
  Tag,
  Spin,
  App,
  Flex,
  Popconfirm,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { pb } from '@/lib/pocketbase';
import { InventoryAPI } from '@/api/inventory';
import { StockMovementAPI } from '@/api/stock-movement';
import type { Inventory } from '@/types/inventory';
import type { StockMovement } from '@/types/stock-movement';

const fmtDate = (v?: string) => v?.split(' ')[0] || '-';

const renderFileLinks = (collectionName: string, recordId: string, files: string[] | undefined) => {
  if (!Array.isArray(files) || files.length === 0) return '-';
  return (
    <Flex vertical gap="small">
      {files.map((file: string) => (
        <a
          key={file}
          href={`${pb.baseUrl}/api/files/${collectionName}/${recordId}/${file}`}
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

const InventoryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementsLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [inventoryData, movementsData] = await Promise.all([
          InventoryAPI.getById(id),
          StockMovementAPI.list({ inventory: id, per_page: 500 }),
        ]);
        setInventory(inventoryData);
        setStockMovements(movementsData.items);
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
        console.error('Fetch inventory detail error:', err);
        message.error('加载库存详情失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, message]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await InventoryAPI.delete(id);
      message.success('删除成功');
      navigate('/manager/inventory');
    } catch (error) {
      console.error('Delete inventory error:', error);
      message.error('删除失败');
    }
  };

  const handleMovement = async (type: 'in' | 'out') => {
    if (!inventory) return;
    navigate('/manager/inventory', {
      state: { openMovementModal: true, inventoryId: inventory.id, movementType: type },
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!inventory) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/manager/inventory')}>
          返回库存列表
        </Button>
        <div style={{ marginTop: 24 }}>库存记录不存在</div>
      </div>
    );
  }

  const movementColumns: ColumnsType<StockMovement> = [
    {
      title: '类型',
      dataIndex: 'movement_type',
      key: 'movement_type',
      width: 100,
      render: (v: string) => (
        v === 'in' ? <Tag color="green">入库</Tag> : <Tag color="red">出库</Tag>
      ),
    },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
    { title: '备注', dataIndex: 'remark', key: 'remark', minWidth: 200, ellipsis: true },
    {
      title: '附件',
      key: 'attachments',
      width: 200,
      render: (_: unknown, record: StockMovement) => renderFileLinks('stock_movements', record.id, record.attachments),
    },
    { title: '时间', dataIndex: 'created', key: 'created', width: 180, render: (v: string) => fmtDate(v) },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/manager/inventory')}>
          返回库存列表
        </Button>
        <Flex gap="middle">
          <Button
            type="primary"
            icon={<ArrowUpOutlined />}
            onClick={() => handleMovement('in')}
          >
            入库
          </Button>
          <Button
            icon={<ArrowDownOutlined />}
            onClick={() => handleMovement('out')}
          >
            出库
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => navigate('/manager/inventory', { state: { openEditModal: true, inventoryId: inventory.id } })}
          >
            修改
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除后将无法恢复，是否继续？"
            onConfirm={handleDelete}
            okText="删除"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Flex>
      </Flex>

      <Card title="基本信息" style={{ marginBottom: 24 }}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label="产品名称">{inventory.product_name}</Descriptions.Item>
          <Descriptions.Item label="剩余库存">
            <Tag color={inventory.remaining_quantity > 0 ? 'green' : 'red'}>
              {inventory.remaining_quantity}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="累计入库">{inventory.total_in_quantity}</Descriptions.Item>
          <Descriptions.Item label="累计出库">{inventory.total_out_quantity}</Descriptions.Item>
          <Descriptions.Item label="最后入库">{fmtDate(inventory.last_in_date)}</Descriptions.Item>
          <Descriptions.Item label="最后出库">{fmtDate(inventory.last_out_date)}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{inventory.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="附件" span={2}>
            {renderFileLinks('inventory', inventory.id, inventory.attachments)}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="出入库记录">
        <Table
          columns={movementColumns}
          dataSource={stockMovements}
          rowKey="id"
          loading={movementsLoading}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          locale={{ emptyText: '暂无记录' }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
};

export default InventoryDetailPage;
