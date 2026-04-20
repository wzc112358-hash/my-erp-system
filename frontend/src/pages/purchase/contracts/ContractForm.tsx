import { useEffect, useState } from 'react';
import { Form, Input, Select, InputNumber, DatePicker, Button, Row, Col, Space, message, Upload, Switch, Alert } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { PurchaseContractFormData, PurchaseContract } from '@/types/purchase-contract';
import { SupplierAPI } from '@/api/supplier';
import { SalesContractAPI } from '@/api/sales-contract';
import { getUsdToCnyRate } from '@/lib/exchange-rate';

interface SupplierOption {
  id: string;
  name: string;
}

interface SalesContractOption {
  id: string;
  no: string;
  product_name: string;
}

interface ContractFormProps {
  form: typeof Form.prototype;
  onFinish: (values: PurchaseContractFormData) => void;
  onCancel: () => void;
  initialValues?: PurchaseContract | null;
}

export const ContractForm: React.FC<ContractFormProps> = ({
  form,
  onFinish,
  onCancel,
  initialValues,
}) => {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [salesContracts, setSalesContracts] = useState<SalesContractOption[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [isCrossBorder, setIsCrossBorder] = useState(initialValues?.is_cross_border || false);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);

  useEffect(() => {
    getUsdToCnyRate().then(setExchangeRate);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [supplierResult, salesResult] = await Promise.all([
          SupplierAPI.list({ per_page: 100 }),
          SalesContractAPI.list({ per_page: 100 }),
        ]);
        setSuppliers(supplierResult.items.map((s) => ({ id: s.id, name: s.name })));
        setSalesContracts(
          salesResult.items.map((c) => ({
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
          console.error('Fetch data error:', error);
          message.error('加载数据失败');
        }
      }
    };
    fetchData();
  }, []);

  const handleValuesChange = (_: unknown, allValues: PurchaseContractFormData) => {
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
              sign_date: initialValues.sign_date
                ? dayjs(initialValues.sign_date.split(' ')[0])
                : undefined,
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
              is_cross_border: false,
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
            name="supplier"
            label="供应商"
            rules={[{ required: true, message: '请选择供应商' }]}
          >
            <Select
              placeholder="请选择供应商"
              options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
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
            name="sales_contract"
            label="关联销售合同"
          >
            <Select
              placeholder="请选择销售合同（可选）"
              allowClear
              options={salesContracts.map((c) => ({
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
        <Col xs={24} md={12}>
          <Form.Item
            name="product_name"
            label="产品名称"
            rules={[{ required: true, message: '请输入产品名称' }]}
          >
            <Input placeholder="请输入产品名称" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="is_cross_border" label="跨境交易（USD）" valuePropName="checked">
        <Switch onChange={(checked) => setIsCrossBorder(checked)} />
      </Form.Item>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="unit_price"
            label={isCrossBorder ? '产品单价（USD）' : '产品单价'}
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
              precision={4}
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
              precision={4}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label={isCrossBorder ? '合同总金额（USD）' : '合同总金额'}>
            <div style={{ padding: '9.5px 11px', background: '#f5f5f5', borderRadius: 6, color: '#333' }}>
              {isCrossBorder ? '$' : '¥'} {totalAmount.toFixed(6)}
            </div>
            {isCrossBorder && (
              <Alert
                message={`折合人民币：¥ ${(totalAmount * exchangeRate).toFixed(6)}（汇率：${exchangeRate}）`}
                type="info"
                style={{ marginTop: 8 }}
                showIcon
              />
            )}
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
        name="purchasing_manager"
        label="采购负责人"
      >
        <Input placeholder="请输入采购负责人" />
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
        <Upload beforeUpload={() => false} maxCount={5} multiple listType="text">
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
