import { useEffect, useState } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Upload, Button, Row, Col, App, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { SalesContractAPI } from '@/api/sales-shipment';
import type { SalesShipmentFormData } from '@/types/sales-shipment';
import { extractAttachments } from '@/utils/file';

interface ShipmentFormProps {
  initialValues?: Partial<SalesShipmentFormData>;
  onFinish: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

export const ShipmentForm: React.FC<ShipmentFormProps> = ({
  initialValues,
  onFinish,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [contractOptions, setContractOptions] = useState<{ label: string; value: string }[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);

  useEffect(() => {
    const fetchContracts = async () => {
      setLoadingContracts(true);
      try {
        const result = await SalesContractAPI.getOptions();
        const options = result.items.map((item) => {
          const record = item as unknown as { id: string; no: string; product_name: string };
          return {
            label: `${record.no} - ${record.product_name}`,
            value: record.id,
          };
        });
        setContractOptions(options);
      } catch (error) {
        const err = error as { name?: string; message?: string; cause?: { name?: string }; response?: { status?: number } };
        const isAborted =
          err.name === 'AbortError' ||
          err.name === 'CanceledError' ||
          err.message?.includes('aborted') ||
          err.message?.includes('autocancelled') ||
          err.cause?.name === 'AbortError' ||
          err.response?.status === 0;
        if (!isAborted) {
          console.error('Fetch contracts error:', error);
          message.error('加载合同列表失败');
        }
      } finally {
        setLoadingContracts(false);
      }
    };
    fetchContracts();
  }, [message]);

  useEffect(() => {
    if (initialValues) {
      const { date, ...rest } = initialValues;
      form.setFieldsValue({
        ...rest,
        date: date ? dayjs(date) : undefined,
      });
    }
  }, [initialValues, form]);

  const handleContractChange = (value: string) => {
    const selected = contractOptions.find((opt) => opt.value === value);
    if (selected && !initialValues?.product_name) {
      form.setFieldsValue({ product_name: '' });
    }
  };

  const handleFinish = (values: Record<string, unknown>) => {
    const fileList = values.attachments as { originFileObj?: File }[] | undefined;
    const attachments = extractAttachments(fileList);
    const data: SalesShipmentFormData = {
      product_name: String(values.product_name || ''),
      sales_contract: String(values.sales_contract || ''),
      tracking_contract_no: String(values.tracking_contract_no || ''),
      date: values.date ? (values.date as dayjs.Dayjs).format('YYYY-MM-DD') : '',
      quantity: Number(values.quantity) || 0,
      logistics_company: String(values.logistics_company || ''),
      delivery_address: String(values.delivery_address || ''),
      remark: values.remark ? String(values.remark) : undefined,
      attachments,
    };
    onFinish(data as unknown as Record<string, unknown>);
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
        <Col xs={24} md={12}>
          <Form.Item
            name="tracking_contract_no"
            label="运输合同号"
            rules={[{ required: true, message: '请输入运输合同号' }]}
          >
            <Input placeholder="请输入运输合同号" />
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
            name="date"
            label="到货日期"
            rules={[{ required: true, message: '请选择到货日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="quantity"
            label="客户到货数量"
            rules={[{ required: true, message: '请输入客户到货数量' }]}
          >
            <InputNumber min={0.01} precision={4} style={{ width: '100%' }} placeholder="请输入客户到货数量" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="logistics_company"
            label="物流公司"
            rules={[{ required: true, message: '请输入物流公司' }]}
          >
            <Input placeholder="请输入物流公司" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Form.Item
            name="delivery_address"
            label="到货地址"
            rules={[{ required: true, message: '请输入到货地址' }]}
          >
            <Input placeholder="请输入到货地址" />
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
