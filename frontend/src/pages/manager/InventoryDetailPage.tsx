import { useState, useEffect, useCallback } from 'react';
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
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload';
import {
  ArrowLeftOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { pb } from '@/lib/pocketbase';
import { InventoryAPI } from '@/api/inventory';
import { StockMovementAPI } from '@/api/stock-movement';
import type { Inventory } from '@/types/inventory';
import type { StockMovement, StockMovementFormData } from '@/types/stock-movement';

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

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);
  const [editFileList, setEditFileList] = useState<UploadFile[]>([]);
  const [editForm] = Form.useForm();

  const fetchData = useCallback(async () => {
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
  }, [id, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteInventory = async () => {
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

  const recalcInventory = async (
    movement: StockMovement,
    action: 'delete' | 'edit',
    newMovement?: { movement_type: string; quantity: number },
  ) => {
    if (!inventory) return;

    let deltaRemaining = 0;
    let deltaIn = 0;
    let deltaOut = 0;

    if (action === 'delete') {
      if (movement.movement_type === 'in') {
        deltaRemaining = -movement.quantity;
        deltaIn = -movement.quantity;
      } else {
        deltaRemaining = movement.quantity;
        deltaOut = -movement.quantity;
      }
    } else if (action === 'edit' && newMovement) {
      if (movement.movement_type === 'in') {
        deltaRemaining = -movement.quantity;
        deltaIn = -movement.quantity;
      } else {
        deltaRemaining = movement.quantity;
        deltaOut = -movement.quantity;
      }
      if (newMovement.movement_type === 'in') {
        deltaRemaining += newMovement.quantity;
        deltaIn += newMovement.quantity;
      } else {
        deltaRemaining -= newMovement.quantity;
        deltaOut += newMovement.quantity;
      }
    }

    const fd = new FormData();
    fd.append('remaining_quantity', String(inventory.remaining_quantity + deltaRemaining));
    fd.append('total_in_quantity', String(inventory.total_in_quantity + deltaIn));
    fd.append('total_out_quantity', String(inventory.total_out_quantity + deltaOut));
    await pb.collection('inventory').update(inventory.id, fd);
  };

  const handleDeleteMovement = async (movement: StockMovement) => {
    try {
      await recalcInventory(movement, 'delete');
      await StockMovementAPI.delete(movement.id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      console.error('Delete movement error:', error);
      message.error('删除失败');
    }
  };

  const handleEditMovement = (movement: StockMovement) => {
    setEditingMovement(movement);
    editForm.setFieldsValue({
      movement_type: movement.movement_type,
      quantity: movement.quantity,
      remark: movement.remark || '',
    });
    const attachments = Array.isArray(movement.attachments) ? movement.attachments : [];
    const existingFiles = attachments.map((f) => ({
      uid: f,
      name: f,
      status: 'done' as const,
      url: `${pb.baseUrl}/api/files/stock_movements/${movement.id}/${f}`,
    }));
    setEditFileList(existingFiles);
    setEditModalVisible(true);
  };

  const handleEditSubmit = async () => {
    if (!editingMovement || !inventory) return;
    try {
      const values = await editForm.validateFields();

      if (values.movement_type === 'out') {
        const tempRemaining =
          inventory.remaining_quantity +
          (editingMovement.movement_type === 'in' ? -editingMovement.quantity : editingMovement.quantity);
        if (tempRemaining < values.quantity) {
          message.error('库存不足，无法出库');
          return;
        }
      }

      const attachments = editFileList.map((f) => {
        if (f.originFileObj) return f.originFileObj as File;
        return f.name;
      });

      await recalcInventory(editingMovement, 'edit', {
        movement_type: values.movement_type,
        quantity: values.quantity,
      });

      const formData: StockMovementFormData = {
        inventory: inventory.id,
        movement_type: values.movement_type,
        quantity: values.quantity,
        remark: values.remark,
        attachments,
      };
      await StockMovementAPI.update(editingMovement.id, formData);

      message.success('修改成功');
      setEditModalVisible(false);
      fetchData();
    } catch (error) {
      console.error('Edit movement error:', error);
      message.error('修改失败');
    }
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
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 200, ellipsis: true },
    {
      title: '附件',
      key: 'attachments',
      width: 200,
      render: (_: unknown, record: StockMovement) => renderFileLinks('stock_movements', record.id, record.attachments),
    },
    { title: '时间', dataIndex: 'created', key: 'created', width: 180, render: (v: string) => fmtDate(v) },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_: unknown, record: StockMovement) => (
        <Flex gap="small">
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditMovement(record)}
          />
          <Popconfirm
            title="确认删除"
            description="删除后将回退对应库存数量，是否继续？"
            onConfirm={() => handleDeleteMovement(record)}
            okText="删除"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Flex>
      ),
    },
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
            onConfirm={handleDeleteInventory}
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
          scroll={{ x: 940 }}
        />
      </Card>

      <Modal
        title="编辑出入库记录"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleEditSubmit}
        okText="保存"
        cancelText="取消"
        width={500}
        centered
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="movement_type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select
              options={[
                { label: '入库', value: 'in' },
                { label: '出库', value: 'out' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="数量"
            rules={[
              { required: true, message: '请输入数量' },
              { type: 'number', min: 1, message: '数量必须大于0' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} min={1} placeholder="请输入数量" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
          <Form.Item label="附件">
            <Upload
              fileList={editFileList}
              onChange={({ fileList: newFileList }) => setEditFileList(newFileList)}
              beforeUpload={() => false}
              multiple
              listType="text"
            >
              <Button icon={<InboxOutlined />}>上传附件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default InventoryDetailPage;
