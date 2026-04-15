import { useEffect, useState } from 'react';
import { Form, Input, Select, DatePicker, Button, Row, Col, Space, Switch, message, Upload } from 'antd';
import type { FormInstance } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ServiceContractFormData, ServiceContract } from '@/types/service-contract';
import { CustomerAPI } from '@/api/customer';

interface CustomerOption {
  id: string;
  name: string;
}

interface ServiceFormProps {
  form: FormInstance<ServiceContractFormData>;
  onFinish: (values: ServiceContractFormData) => void;
  onCancel: () => void;
  initialValues?: ServiceContract | null;
}

export const ServiceForm: React.FC<ServiceFormProps> = ({ form, onFinish, onCancel, initialValues }) => {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

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
    fetchCustomers();
  }, []);

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={
        initialValues
          ? {
              ...initialValues,
              sign_date: initialValues.sign_date ? dayjs(initialValues.sign_date.split(' ')[0]) : undefined,
              attachments: Array.isArray(initialValues.attachments)
                ? initialValues.attachments.map((file, index) => ({
                    uid: `${index}`,
                    name: file,
                    status: 'done' as const,
                    url: file,
                  }))
                : [],
            }
          : {
              no: '',
              product_name: '',
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
            name="customer"
            label="客户"
            rules={[{ required: true, message: '请选择客户' }]}
          >
            <Select
              placeholder="请选择客户"
              options={customers.map((c) => ({ label: c.name, value: c.id }))}
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="product_name"
            label="服务名称"
            rules={[{ required: true, message: '请输入服务名称' }]}
          >
            <Input placeholder="请输入服务名称" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="sign_date"
            label="签约日期"
            rules={[{ required: true, message: '请选择签约日期' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="sales_manager" label="销售负责人">
        <Input placeholder="请输入销售负责人" />
      </Form.Item>

      <Form.Item name="is_cross_border" label="跨境交易" valuePropName="checked">
        <Switch checkedChildren="跨境" unCheckedChildren="国内" />
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
