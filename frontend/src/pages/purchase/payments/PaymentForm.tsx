import { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Upload, Button, Row, Col, App, Space, Alert } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { getUsdToCnyRate, formatRemainingAmount } from '@/lib/exchange-rate';
import type { PurchasePayment } from '@/types/purchase-contract';
import dayjs from 'dayjs';
import { extractAttachments } from '@/utils/file';
import { useAsyncSubmit } from '@/hooks/useAsyncSubmit';

interface ContractOption {
  label: string;
  value: string;
  unit_price?: number;
  is_cross_border?: boolean;
  unpaid_amount?: number;
}

interface PaymentFormProps {
  initialValues?: Partial<PurchasePayment>;
  onFinish: (values: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
}

export const PaymentForm: React.FC<PaymentFormProps> = ({
  initialValues,
  onFinish,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);
  const { submit, submitting } = useAsyncSubmit(onFinish);
  const selectedContractId = Form.useWatch('purchase_contract', form);
  const selectedContract = contractOptions.find((contract) => contract.value === selectedContractId) || null;

  useEffect(() => {
    getUsdToCnyRate().then(setExchangeRate);
  }, []);

  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const contracts = await pb.collection('purchase_contracts').getFullList({
          filter: 'status = "executing"',
          sort: '-created_at',
        });
        const options = contracts.map((item: Record<string, unknown>) => ({
          label: `${item.no} - ${item.product_name}`,
          value: item.id as string,
          unit_price: item.unit_price as number,
          is_cross_border: item.is_cross_border as boolean,
          unpaid_amount: item.unpaid_amount as number,
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
      const { pay_date, ...rest } = initialValues;
      form.setFieldsValue({
        ...rest,
        pay_date: pay_date ? dayjs(pay_date) : undefined,
      });
    }
  }, [initialValues, form]);

  const handleProductAmountChange = (value: number | null) => {
    if (value && selectedContract?.unit_price) {
      const amount = value * selectedContract.unit_price;
      form.setFieldsValue({ amount });
    }
  };

  const handleFinish = async (values: Record<string, unknown>) => {
    const fileList = values.attachments as { originFileObj?: File }[] | undefined;
    const attachments = extractAttachments(fileList);

    const data = {
      no: values.no as string,
      product_name: values.product_name as string,
      purchase_contract: values.purchase_contract as string,
      amount: values.amount as number,
      product_amount: values.product_amount as number,
      pay_date: (values.pay_date as dayjs.Dayjs).format('YYYY-MM-DD'),
      method: values.method as string | undefined,
      remark: values.remark as string | undefined,
      attachments,
    };

    await submit(data);
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
            name="no"
            label="付款单号"
            rules={[{ required: true, message: '请输入付款单号' }]}
          >
            <Input placeholder="请输入付款单号" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="purchase_contract"
            label="关联合同"
            rules={[{ required: true, message: '请选择关联合同' }]}
          >
            <Select
              placeholder="选择采购合同"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={contractOptions}
              disabled={!!initialValues?.purchase_contract}
            />
          </Form.Item>
        </Col>
      </Row>

      {selectedContract && selectedContract.unpaid_amount !== undefined && (
        <Row gutter={16}>
          <Col span={24}>
            <Alert
              message={`合同剩余未付款金额: ${formatRemainingAmount(selectedContract.unpaid_amount, selectedContract.is_cross_border, exchangeRate)}`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          </Col>
        </Row>
      )}

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
              precision={4}
              onChange={handleProductAmountChange}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="amount"
            label="付款金额"
            rules={[
              { required: true, message: '请输入付款金额' },
              { type: 'number', min: 0.01, message: '金额必须大于0' },
            ]}
          >
            <InputNumber
              placeholder="请输入付款金额"
              style={{ width: '100%' }}
              precision={4}
              min={0}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="pay_date"
            label="付款日期"
            rules={[{ required: true, message: '请选择付款日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="method" label="付款方式">
            <Input placeholder="请输入付款方式" />
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
            label="付款凭证"
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
          <Button type="primary" htmlType="submit" loading={submitting}>
            提交
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};
