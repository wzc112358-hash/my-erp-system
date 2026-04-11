import { Form, Input, Button, Row, Col, Space } from 'antd';
import type { CustomerFormData } from '@/types/customer';

interface CustomerFormProps {
  form: typeof Form.prototype;
  onFinish: (values: CustomerFormData) => void;
  onCancel: () => void;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({ form, onFinish, onCancel }) => {
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={{
        name: '',
        contact: '',
        phone: '',
        email: '',
        address: '',
        industry: '',
        region: '',
        bank_name: '',
        bank_account: '',
        remark: '',
      }}
    >
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="name"
            label="客户名称"
            rules={[{ required: true, message: '请输入客户名称' }]}
          >
            <Input placeholder="请输入客户名称" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="contact" label="联系人">
            <Input placeholder="请输入联系人" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="phone" label="联系电话">
            <Input placeholder="请输入联系电话" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="email" label="电子邮箱">
            <Input placeholder="请输入电子邮箱" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="industry" label="所在行业">
            <Input placeholder="请输入所在行业" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="region" label="所属地区">
            <Input placeholder="请输入所属地区" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="address" label="地址">
        <Input placeholder="请输入地址" />
      </Form.Item>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="bank_name" label="开户银行">
            <Input placeholder="请输入开户银行" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="bank_account" label="银行账号">
            <Input placeholder="请输入银行账号" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="remark" label="备注">
        <Input.TextArea rows={3} placeholder="请输入备注" />
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
