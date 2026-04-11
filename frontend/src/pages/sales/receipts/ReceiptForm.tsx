import { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Upload, Button, Row, Col, App, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import type { SaleReceipt } from '@/types';
import dayjs from 'dayjs';

interface ContractOption {
  label: string;
  value: string;
  unit_price?: number;
}

interface ReceiptFormProps {
  initialValues?: Partial<SaleReceipt>;
  onFinish: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

export const ReceiptForm: React.FC<ReceiptFormProps> = ({
  initialValues,
  onFinish,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractOption | null>(null);

  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const result = await pb.collection('sales_contracts').getList(1, 100, {
          filter: 'status = "executing"',
        });
        const options = result.items.map((item: Record<string, unknown>) => ({
          label: `${item.no} - ${item.product_name}`,
          value: item.id as string,
          unit_price: item.unit_price as number,
        }));
        setContractOptions(options);
      } catch (error: unknown) {
        const err = error as { isAbort?: boolean; cause?: { name?: string } };
        if (err.isAbort || err.cause?.name === 'AbortError') {
          return;
        }
        console.error('Fetch contracts error:', error);
        message.error('加载合同列表失败');
      }
    };
    fetchContracts();
  }, [message]);

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue({
        ...initialValues,
        receive_date: initialValues.receive_date ? dayjs(initialValues.receive_date) : undefined,
      });
      if (initialValues.sales_contract) {
        const contract = contractOptions.find(c => c.value === initialValues.sales_contract);
        if (contract) {
          setSelectedContract(contract);
        }
      }
    }
  }, [initialValues, form, contractOptions]);

  const handleProductAmountChange = (value: number | null) => {
    if (value && selectedContract?.unit_price) {
      const amount = value * selectedContract.unit_price;
      form.setFieldsValue({ amount });
    }
  };

  const handleFinish = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const fileList = values.attachments as { originFileObj?: File }[] | undefined;
      const attachments = fileList?.map((f) => f.originFileObj).filter(Boolean) as File[] || [];

      const data = {
        product_name: values.product_name as string,
        sales_contract: values.sales_contract as string,
        amount: values.amount as number,
        product_amount: values.product_amount as number,
        receive_date: (values.receive_date as dayjs.Dayjs).format('YYYY-MM-DD'),
        method: values.method as string | undefined,
        account: values.account as string | undefined,
        remark: values.remark as string | undefined,
        attachments,
      };

      onFinish(data);
    } catch (error) {
      const err = error as Error;
      message.error(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
    >
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="sales_contract"
            label="关联合同"
            rules={[{ required: true, message: '请选择关联合同' }]}
          >
            <Select
              placeholder="选择销售合同"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={contractOptions}
              disabled={!!initialValues?.sales_contract}
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

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="product_amount"
            label="产品数量"
            rules={[
              { required: true, message: '请输入产品数量' },
              { type: 'number', min: 0.01, message: '数量必须大于0' },
            ]}
          >
            <InputNumber
              placeholder="请输入产品数量"
              style={{ width: '100%' }}
              min={0.01}
              precision={2}
              onChange={handleProductAmountChange}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="amount"
            label="收款金额"
            rules={[
              { required: true, message: '请输入收款金额' },
              { type: 'number', min: 0.01, message: '金额必须大于0' },
            ]}
          >
            <InputNumber
              placeholder="请输入收款金额"
              style={{ width: '100%' }}
              precision={2}
              min={0}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="receive_date"
            label="收款日期"
            rules={[{ required: true, message: '请选择收款日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="method" label="收款方式">
            <Input placeholder="请输入收款方式" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="account" label="收款账户">
            <Input placeholder="请输入收款账户" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Form.Item
            name="attachments"
            label="收款凭证"
            valuePropName="fileList"
            getValueFromEvent={(e: { fileList?: unknown[] } | unknown[]) => {
              if (Array.isArray(e)) return e;
              return e?.fileList || [];
            }}
          >
            <Upload maxCount={5} beforeUpload={() => false} listType="text">
              <Button icon={<UploadOutlined />}>上传凭证</Button>
            </Upload>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            提交
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};
