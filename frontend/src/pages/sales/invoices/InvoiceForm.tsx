import { useEffect, useState } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Upload, Button, Row, Col, App, Space, Alert } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { pb } from '@/lib/pocketbase';
import type { SaleInvoiceFormData } from '@/types/sales-contract';

interface ContractOption {
  label: string;
  value: string;
  uninvoiced_amount?: number;
  unit_price?: number;
}

interface InvoiceFormProps {
  initialValues?: Partial<SaleInvoiceFormData>;
  onFinish: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({
  initialValues,
  onFinish,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractOption | null>(null);

  useEffect(() => {
    const fetchContracts = async () => {
      setLoadingContracts(true);
      try {
        const result = await pb.collection('sales_contracts').getList(1, 100, {
          filter: 'status = "executing"',
        });
        const options = result.items.map((item: Record<string, unknown>) => ({
          label: `${item.no} - ${item.product_name}`,
          value: item.id as string,
          uninvoiced_amount: item.uninvoiced_amount as number,
          unit_price: item.unit_price as number,
        }));
        setContractOptions(options);
      } catch (error) {
        const err = error as { response?: { status?: number }; message?: string };
        if (err.response?.status === 0 || err.message?.includes('aborted')) {
          return;
        }
        console.error('Fetch contracts error:', error);
        message.error('加载合同列表失败');
      } finally {
        setLoadingContracts(false);
      }
    };
    fetchContracts();
  }, [message]);

  useEffect(() => {
    if (initialValues) {
      const { issue_date, ...rest } = initialValues;
      form.setFieldsValue({
        ...rest,
        issue_date: issue_date ? dayjs(issue_date) : undefined,
      });
      if (initialValues.sales_contract) {
        const contract = contractOptions.find(c => c.value === initialValues.sales_contract);
        if (contract) {
          setSelectedContract(contract);
        }
      }
    }
  }, [initialValues, form, contractOptions]);

  const handleContractChange = (value: string) => {
    const selected = contractOptions.find((opt) => opt.value === value);
    setSelectedContract(selected || null);
    if (selected && !initialValues?.product_name) {
      form.setFieldsValue({ product_name: '' });
    }
  };

  const handleProductAmountChange = (value: number | null) => {
    if (value && selectedContract?.unit_price) {
      const amount = value * selectedContract.unit_price;
      form.setFieldsValue({ amount });
    }
  };

  const validateAmount = (_: unknown, value: number) => {
    if (!value) {
      return Promise.resolve();
    }
    if (selectedContract && selectedContract.uninvoiced_amount !== undefined) {
      if (value > selectedContract.uninvoiced_amount) {
        return Promise.reject(new Error(`发票金额不能超过合同剩余未开票金额 ${selectedContract.uninvoiced_amount.toFixed(2)}`));
      }
    }
    return Promise.resolve();
  };

  const handleFinish = (values: Record<string, unknown>) => {
    const fileList = values.attachments as { originFileObj?: File }[] | undefined;
    const attachments = fileList?.map((f) => f.originFileObj).filter(Boolean) as File[] || [];
    const data: SaleInvoiceFormData = {
      no: String(values.no || ''),
      product_name: String(values.product_name || ''),
      sales_contract: String(values.sales_contract || ''),
      invoice_type: String(values.invoice_type || ''),
      product_amount: Number(values.product_amount) || 0,
      amount: Number(values.amount) || 0,
      issue_date: values.issue_date ? (values.issue_date as dayjs.Dayjs).format('YYYY-MM-DD') : '',
      remark: values.remark ? String(values.remark) : undefined,
      attachments,
    };
    console.log('Form submit attachments:', attachments);
    onFinish(data as unknown as Record<string, unknown>);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        invoice_type: '增值税专用发票',
      }}
      onFinish={handleFinish}
    >
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="no"
            label="发票号码"
            rules={[{ required: true, message: '请输入发票号码' }]}
          >
            <Input placeholder="请输入发票号码" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="sales_contract"
            label="关联销售合同"
            rules={[{ required: true, message: '请选择销售合同' }]}
          >
            <Select
              placeholder="选择销售合同"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={contractOptions}
              loading={loadingContracts}
              onChange={handleContractChange}
            />
          </Form.Item>
        </Col>
      </Row>

      {selectedContract && selectedContract.uninvoiced_amount !== undefined && (
        <Row gutter={16}>
          <Col span={24}>
            <Alert
              message={`合同剩余未开票金额: ¥${selectedContract.uninvoiced_amount.toFixed(2)}`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          </Col>
        </Row>
      )}

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="product_name"
            label="产品名称"
            rules={[{ required: true, message: '请输入产品名称' }]}
          >
            <Input placeholder="请输入产品名称" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="invoice_type"
            label="发票类型"
            rules={[{ required: true, message: '请选择发票类型' }]}
          >
            <Select
              placeholder="选择发票类型"
              options={[
                { label: '增值税专用发票', value: '增值税专用发票' },
                { label: '增值税普通发票', value: '增值税普通发票' },
                { label: '电子发票', value: '电子发票' },
              ]}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="product_amount"
            label="产品数量"
            rules={[{ required: true, message: '请输入产品数量' }]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入产品数量" onChange={handleProductAmountChange} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="amount"
            label="发票金额"
            rules={[
              { required: true, message: '请输入发票金额' },
              { validator: validateAmount },
            ]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入发票金额" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="issue_date"
            label="开票日期"
            rules={[{ required: true, message: '请选择开票日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
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
            label="附件"
            valuePropName="fileList"
            getValueFromEvent={(e: { fileList?: unknown[] } | unknown[]) => {
              if (Array.isArray(e)) return e;
              return e?.fileList || [];
            }}
          >
            <Upload
              maxCount={5}
              beforeUpload={() => false}
              listType="text"
            >
              <Button icon={<UploadOutlined />}>上传附件</Button>
            </Upload>
          </Form.Item>
        </Col>
      </Row>

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
