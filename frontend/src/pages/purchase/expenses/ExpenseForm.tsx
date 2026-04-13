import { Form, Input, InputNumber, DatePicker, Button, Row, Col, Space, Upload } from 'antd';
import type { FormInstance } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ExpenseRecordFormData, ExpenseRecord } from '@/types/expense-record';

interface ExpenseFormProps {
  form: FormInstance<ExpenseRecordFormData>;
  onFinish: (values: ExpenseRecordFormData) => void;
  onCancel: () => void;
  initialValues?: ExpenseRecord | null;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ form, onFinish, onCancel, initialValues }) => {
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={
        initialValues
          ? {
              ...initialValues,
              pay_date: initialValues.pay_date ? dayjs(initialValues.pay_date.split(' ')[0]) : undefined,
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
              expense_type: '',
              description: '',
              payment_amount: undefined,
              pay_date: undefined,
              method: '',
              remark: '',
              attachments: [],
              purchasing_manager: '',
            }
      }
    >
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="no"
            label="记录编号"
            rules={[{ required: true, message: '请输入记录编号' }]}
          >
            <Input placeholder="请输入记录编号" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="expense_type"
            label="支出类型"
            rules={[{ required: true, message: '请输入支出类型' }]}
          >
            <Input placeholder="如：标书保证金、U盾费等" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="description"
        label="描述说明"
        rules={[{ required: true, message: '请输入描述说明' }]}
      >
        <Input.TextArea rows={2} placeholder="请输入描述说明" />
      </Form.Item>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="payment_amount" label="付款金额">
            <InputNumber
              placeholder="请输入付款金额"
              min={0}
              precision={4}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="pay_date"
            label="付款日期"
            rules={[{ required: true, message: '请选择付款日期' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="method" label="付款方式">
            <Input placeholder="请输入付款方式" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="purchasing_manager" label="采购负责人">
            <Input placeholder="请输入采购负责人" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="remark" label="备注">
        <Input.TextArea rows={2} placeholder="请输入备注" />
      </Form.Item>

      <Form.Item
        name="attachments"
        label="附件"
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
