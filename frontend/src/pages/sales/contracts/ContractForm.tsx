import { useEffect, useState } from 'react';
import { Form, Input, Select, InputNumber, DatePicker, Button, Row, Col, Space, message, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { SalesContractFormData, SalesContract } from '@/types/sales-contract';
import { CustomerAPI } from '@/api/customer';
import { PurchaseContractAPI } from '@/api/purchase-contract';

interface CustomerOption {
  id: string;
  name: string;
}

interface PurchaseContractOption {
  id: string;
  no: string;
  product_name: string;
}

interface ContractFormProps {
  form: typeof Form.prototype;
  onFinish: (values: SalesContractFormData) => void;
  onCancel: () => void;
  initialValues?: SalesContract | null;
}

export const ContractForm: React.FC<ContractFormProps> = ({ form, onFinish, onCancel, initialValues }) => {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [purchaseContracts, setPurchaseContracts] = useState<PurchaseContractOption[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const result = await CustomerAPI.list({ per_page: 100 });
        setCustomers(result.items.map((c) => ({ id: c.id, name: c.name })));
      } catch (error) {
        const err = error as { name?: string; message?: string; cause?: { name?: string } };
        const isAborted =
          err.name === 'AbortError' ||
          err.name === 'CanceledError' ||
          err.message?.includes('aborted') ||
          err.message?.includes('autocancelled') ||
          err.cause?.name === 'AbortError';
        if (!isAborted) {
          console.error('Fetch customers error:', error);
          message.error('加载客户列表失败');
        }
      }
    };

    const fetchPurchaseContracts = async () => {
      try {
        const result = await PurchaseContractAPI.list({ per_page: 100 });
        setPurchaseContracts(
          result.items.map((c) => ({
            id: c.id,
            no: c.no,
            product_name: c.product_name,
          }))
        );
      } catch (error) {
        const err = error as { name?: string; message?: string; cause?: { name?: string } };
        const isAborted =
          err.name === 'AbortError' ||
          err.name === 'CanceledError' ||
          err.message?.includes('aborted') ||
          err.message?.includes('autocancelled') ||
          err.cause?.name === 'AbortError';
        if (!isAborted) {
          console.error('Fetch purchase contracts error:', error);
        }
      }
    };

    fetchCustomers();
    fetchPurchaseContracts();
  }, []);

  const handleValuesChange = (_: unknown, allValues: SalesContractFormData) => {
    const unit_price = allValues.unit_price || 0;
    const total_quantity = allValues.total_quantity || 0;
    setTotalAmount(unit_price * total_quantity);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      onValuesChange={handleValuesChange}
      initialValues={
        initialValues
          ? {
              ...initialValues,
              sign_date: initialValues.sign_date ? dayjs(initialValues.sign_date.split(' ')[0]) : undefined,
              attachments: Array.isArray(initialValues.attachments)
                ? initialValues.attachments.map((file, index) => ({
                    uid: `${index}`,
                    name: file,
                    status: 'done',
                    url: file,
                  }))
                : [],
            }
          : {
              no: '',
              product_name: '',
              unit_price: undefined,
              total_quantity: undefined,
              sign_date: undefined,
              remark: '',
              attachments: [],
            }
      }
    >
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="no"
            label="合同编号"
            rules={[{ required: true, message: '请输入合同编号' }]}
          >
            <Input placeholder="请输入合同编号" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="customer"
            label="客户"
            rules={[{ required: true, message: '请选择客户' }]}
          >
            <Select
              placeholder="请选择客户"
              options={customers.map((c) => ({ label: c.name, value: c.id }))}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="product_name"
            label="产品名称"
            rules={[{ required: true, message: '请输入产品名称' }]}
          >
            <Input placeholder="请输入产品名称" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="purchase_contract"
            label="关联采购合同"
          >
            <Select
              placeholder="请选择关联的采购合同（可选）"
              allowClear
              options={purchaseContracts.map((c) => ({
                label: `${c.no} - ${c.product_name}`,
                value: c.id,
              }))}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="unit_price"
            label="产品单价"
            rules={[
              { required: true, message: '请输入产品单价' },
              {
                validator: (_, value) => {
                  if (value === undefined || value === null || value <= 0) {
                    return Promise.reject(new Error('单价必须大于0'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              placeholder="请输入产品单价"
              min={0.01}
              precision={2}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="total_quantity"
            label="产品数量"
            rules={[
              { required: true, message: '请输入产品数量' },
              {
                validator: (_, value) => {
                  if (value === undefined || value === null || value <= 0) {
                    return Promise.reject(new Error('数量必须大于0'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              placeholder="请输入产品数量"
              min={0.01}
              precision={2}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="合同总金额">
            <div style={{ padding: '9.5px 11px', background: '#f5f5f5', borderRadius: 6, color: '#333' }}>
              ¥ {totalAmount.toLocaleString()}
            </div>
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="sign_date"
            label="签订日期"
            rules={[{ required: true, message: '请选择签订日期' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="sales_manager"
        label="销售负责人"
      >
        <Input placeholder="请输入销售负责人" />
      </Form.Item>

      <Form.Item name="remark" label="备注">
        <Input.TextArea rows={3} placeholder="请输入备注" />
      </Form.Item>

      <Form.Item
        name="attachments"
        label="合同附件"
        valuePropName="fileList"
        getValueFromEvent={(e: { fileList?: unknown[] } | unknown[]) => {
          if (Array.isArray(e)) return e;
          return e?.fileList || [];
        }}
      >
        <Upload
          beforeUpload={() => false}
          maxCount={5}
          multiple
          listType="text"
        >
          <Button icon={<UploadOutlined />}>上传附件</Button>
        </Upload>
      </Form.Item>

      <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit">
            提交
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};
