import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  App,
  Tag,
  Flex,
  Popconfirm,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload';
import {
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { pb } from '@/lib/pocketbase';
import { InventoryAPI } from '@/api/inventory';
import { StockMovementAPI } from '@/api/stock-movement';
import type { Inventory, InventoryFormData } from '@/types/inventory';
import type { StockMovementFormData } from '@/types/stock-movement';

const fmtDate = (v?: string) => v?.split(' ')[0] || '-';

const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();

  const [inventoryList, setInventoryList] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'create' | 'edit' | 'movement'>('create');
  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);

  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [movementType, setMovementType] = useState<'in' | 'out'>('in');

  const [form] = Form.useForm<InventoryFormData>();
  const [movementForm] = Form.useForm<StockMovementFormData>();

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [movementFileList, setMovementFileList] = useState<UploadFile[]>([]);

  // Handle navigation state for opening modals from detail page
  useEffect(() => {
    const state = location.state as { 
      openEditModal?: boolean; 
      openMovementModal?: boolean; 
      inventoryId?: string;
      movementType?: 'in' | 'out';
    } | null;
    
    if (!state?.inventoryId || inventoryList.length === 0) return;
    
    if (state?.openEditModal) {
      const record = inventoryList.find(i => i.id === state.inventoryId);
      if (record) {
        handleEdit(record);
        // Only clear state after successfully opening the modal
        navigate(location.pathname, { replace: true, state: {} });
      }
    } else if (state?.openMovementModal) {
      const record = inventoryList.find(i => i.id === state.inventoryId);
      if (record) {
        handleMovement(record, state.movementType || 'in');
        // Only clear state after successfully opening the modal
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, inventoryList]);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await InventoryAPI.list({ search: searchText });
      setInventoryList(result.items);
    } catch (error) {
      console.error('Fetch inventory error:', error);
      message.error('加载库存数据失败');
    } finally {
      setLoading(false);
    }
  }, [searchText, message]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleCreate = () => {
    setModalType('create');
    setSelectedInventory(null);
    form.resetFields();
    setFileList([]);
    setModalVisible(true);
  };

  const handleEdit = (record: Inventory) => {
    setModalType('edit');
    setSelectedInventory(record);
    form.setFieldsValue({
      product_name: record.product_name,
      remark: record.remark,
    });
    // Set existing attachments for display in Upload component
    const attachments = Array.isArray(record.attachments) ? record.attachments : [];
    const existingFiles = attachments.map((f) => ({
      uid: f,
      name: f,
      status: 'done' as const,
      url: `${pb.baseUrl}/api/files/inventory/${record.id}/${f}`,
    }));
    setFileList(existingFiles);
    setModalVisible(true);
  };

  const handleView = (record: Inventory) => {
    navigate(`/manager/inventory/${record.id}`);
  };

  const handleMovement = (record: Inventory, type: 'in' | 'out') => {
    setSelectedInventory(record);
    setMovementType(type);
    movementForm.resetFields();
    movementForm.setFieldsValue({
      inventory: record.id,
      movement_type: type,
      quantity: 1,
    });
    setMovementFileList([]);
    setMovementModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await InventoryAPI.delete(id);
      message.success('删除成功');
      fetchInventory();
    } catch (error) {
      console.error('Delete inventory error:', error);
      message.error('删除失败');
    }
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (modalType === 'create') {
        // For creation, only upload new files
        const attachments = fileList
          .filter((f) => f.originFileObj)
          .map((f) => f.originFileObj as File);
        await InventoryAPI.create({
          ...values,
          attachments,
        });
        message.success('创建成功');
      } else if (modalType === 'edit' && selectedInventory) {
        // For update, include both existing files (as strings) and new files
        const attachments = fileList.map((f) => {
          if (f.originFileObj) {
            return f.originFileObj as File;
          } else {
            return f.name; // existing file name to preserve
          }
        });
        await InventoryAPI.update(selectedInventory.id, {
          ...values,
          attachments,
        });
        message.success('更新成功');
      }
      setModalVisible(false);
      fetchInventory();
    } catch (error) {
      console.error('Form submit error:', error);
      message.error('操作失败');
    }
  };

  const handleMovementSubmit = async () => {
    try {
      const values = await movementForm.validateFields();
      const inventory = selectedInventory;
      if (!inventory) return;

      if (values.movement_type === 'out' && inventory.remaining_quantity < values.quantity) {
        message.error('库存不足，无法出库');
        return;
      }

      const attachments = movementFileList
        .filter((f) => f.originFileObj)
        .map((f) => f.originFileObj as File);

      await StockMovementAPI.create({
        ...values,
        attachments,
      });

      const newRemaining = values.movement_type === 'in'
        ? inventory.remaining_quantity + values.quantity
        : inventory.remaining_quantity - values.quantity;

      const newTotalIn = values.movement_type === 'in'
        ? inventory.total_in_quantity + values.quantity
        : inventory.total_in_quantity;

      const newTotalOut = values.movement_type === 'out'
        ? inventory.total_out_quantity + values.quantity
        : inventory.total_out_quantity;

      const now = new Date().toISOString();

      const updateData = new FormData();
      updateData.append('remaining_quantity', String(newRemaining));
      updateData.append('total_in_quantity', String(newTotalIn));
      updateData.append('total_out_quantity', String(newTotalOut));
      if (values.movement_type === 'in') {
        updateData.append('last_in_date', now);
      } else {
        updateData.append('last_out_date', now);
      }
      await pb.collection('inventory').update(inventory.id, updateData);

      message.success(values.movement_type === 'in' ? '入库成功' : '出库成功');
      setMovementModalVisible(false);
      fetchInventory();
    } catch (error) {
      console.error('Movement submit error:', error);
      message.error('操作失败');
    }
  };

  const columns: ColumnsType<Inventory> = [
    { title: '产品名称', dataIndex: 'product_name', key: 'product_name', width: 200, ellipsis: true },
    {
      title: '剩余库存',
      dataIndex: 'remaining_quantity',
      key: 'remaining_quantity',
      width: 100,
      render: (v: number) => <Tag color={v > 0 ? 'green' : 'red'}>{v}</Tag>,
    },
    { title: '累计入库', dataIndex: 'total_in_quantity', key: 'total_in_quantity', width: 100 },
    { title: '累计出库', dataIndex: 'total_out_quantity', key: 'total_out_quantity', width: 100 },
    { title: '最后入库', dataIndex: 'last_in_date', key: 'last_in_date', width: 110, render: (v: string) => fmtDate(v) },
    { title: '最后出库', dataIndex: 'last_out_date', key: 'last_out_date', width: 110, render: (v: string) => fmtDate(v) },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 380,
      fixed: 'right',
      render: (_: unknown, record: Inventory) => (
        <Flex gap="middle" align="center">
          <Button
            type="primary"
            icon={<ArrowUpOutlined />}
            onClick={() => handleMovement(record, 'in')}
            style={{ minWidth: 80 }}
          >
            入库
          </Button>
          <Button
            icon={<ArrowDownOutlined />}
            onClick={() => handleMovement(record, 'out')}
            style={{ minWidth: 80 }}
          >
            出库
          </Button>
          <Button
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
            title="查看详情"
            style={{ minWidth: 40 }}
          />
          <Button
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            title="修改"
            style={{ minWidth: 40 }}
          />
          <Popconfirm
            title="确认删除"
            description="删除后将无法恢复，是否继续？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              title="删除"
              style={{ minWidth: 40 }}
            />
          </Popconfirm>
        </Flex>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索产品名称或备注"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={fetchInventory}
          style={{ width: 300 }}
          allowClear
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新增库存
        </Button>
      </Flex>

      <Table
        columns={columns}
        dataSource={inventoryList}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 1000 }}
        locale={{ emptyText: '暂无数据' }}
      />

      <Modal
        title={modalType === 'create' ? '新增库存' : '编辑库存'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleFormSubmit}>
            {modalType === 'create' ? '创建' : '保存'}
          </Button>,
        ]}
        width={600}
        centered
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="product_name"
            label="产品名称"
            rules={[{ required: true, message: '请输入产品名称' }]}
          >
            <Input placeholder="请输入产品名称" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
          <Form.Item label="附件">
            <Upload
              fileList={fileList}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
              beforeUpload={() => false}
              multiple
              listType="text"
            >
              <Button icon={<InboxOutlined />}>上传附件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={movementType === 'in' ? '入库操作' : '出库操作'}
        open={movementModalVisible}
        onCancel={() => setMovementModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setMovementModalVisible(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleMovementSubmit}>
            确认
          </Button>,
        ]}
        width={500}
        centered
      >
        <Form form={movementForm} layout="vertical">
          <Form.Item name="inventory" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="movement_type" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="产品">
            <Input value={selectedInventory?.product_name} disabled />
          </Form.Item>
          <Form.Item label="当前库存">
            <Tag color={selectedInventory && selectedInventory.remaining_quantity > 0 ? 'green' : 'red'}>
              {selectedInventory?.remaining_quantity || 0}
            </Tag>
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
              fileList={movementFileList}
              onChange={({ fileList: newFileList }) => setMovementFileList(newFileList)}
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

export default InventoryPage;
