import { Form, Input, InputNumber, DatePicker, Button, Space, Upload, Row, Col } from 'antd';
import type { FormInstance } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ServiceOrderFormData, ServiceOrder } from '@/types/service-contract';

interface ServiceOrderFormProps {
  form: FormInstance<ServiceOrderFormData>;
  onFinish: (values: ServiceOrderFormData) => void;
  onCancel: () => void;
  contractId?: string;
  initialValues?: ServiceOrder | null;
  isCrossBorder?: boolean;
}

export const ServiceOrderForm: React.FC<ServiceOrderFormProps> = ({
  form,
  onFinish,
  onCancel,
  initialValues,
  isCrossBorder = true,
}) => {
  const baseInit: Record<string, unknown> = {
    order_no: '',
    unit_price: undefined,
    quantity: undefined,
    service_fee_rate: undefined,
    receipt_amount: undefined,
    receipt_date: undefined,
    departure_date: undefined,
    customer_payment_date: undefined,
    bank_settlement_date: undefined,
    actual_receipt_amount_usd: undefined,
    receipt_amount_rmb: undefined,
    receipt_rmb_date: undefined,
    invoice_amount: undefined,
    invoice_date: undefined,
    tax_date: undefined,
    tax_amount: undefined,
    total_amount: undefined,
    invoice_time: undefined,
    payment_date: undefined,
    payment_amount: undefined,
    remark: '',
    manager: '',
    attachments: [],
  };

  const editInit: Record<string, unknown> = {
    ...initialValues,
    receipt_date: initialValues?.receipt_date ? dayjs(initialValues.receipt_date.split(' ')[0]) : undefined,
    receipt_rmb_date: initialValues?.receipt_rmb_date ? dayjs(initialValues.receipt_rmb_date.split(' ')[0]) : undefined,
    invoice_date: initialValues?.invoice_date ? dayjs(initialValues.invoice_date.split(' ')[0]) : undefined,
    tax_date: initialValues?.tax_date ? dayjs(initialValues.tax_date.split(' ')[0]) : undefined,
    departure_date: initialValues?.departure_date ? dayjs(initialValues.departure_date.split(' ')[0]) : undefined,
    customer_payment_date: initialValues?.customer_payment_date ? dayjs(initialValues.customer_payment_date.split(' ')[0]) : undefined,
    bank_settlement_date: initialValues?.bank_settlement_date ? dayjs(initialValues.bank_settlement_date.split(' ')[0]) : undefined,
    invoice_time: initialValues?.invoice_time ? dayjs(initialValues.invoice_time.split(' ')[0]) : undefined,
    payment_date: initialValues?.payment_date ? dayjs(initialValues.payment_date.split(' ')[0]) : undefined,
    attachments: Array.isArray(initialValues?.attachments)
      ? initialValues.attachments.map((file, index) => ({
          uid: `${index}`,
          name: file,
          status: 'done' as const,
          url: file,
        }))
      : [],
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={initialValues ? editInit : baseInit}
    >
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="order_no"
            label="佣金订单号"
            rules={[{ required: true, message: '请输入订单号' }]}
          >
            <Input placeholder="请输入佣金订单号" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="manager" label="负责人">
            <Input placeholder="请输入负责人" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="quantity" label="数量">
            <InputNumber placeholder="数量" min={0} precision={4} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="unit_price" label="单价">
            <InputNumber placeholder="单价" min={0} precision={6} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="service_fee_rate" label="服务费比例(%)">
            <InputNumber placeholder="服务费比例" min={0} max={100} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      {isCrossBorder ? (
        <>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="receipt_amount"
                label="收款金额 (USD)"
                rules={[{ required: true, message: '请输入收款金额' }]}
              >
                <InputNumber placeholder="USD" min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="receipt_date"
                label="收款时间"
                rules={[{ required: true, message: '请选择收款时间' }]}
              >
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="departure_date" label="出港时间">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="customer_payment_date" label="客户付款时间">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="bank_settlement_date" label="银行收汇时间">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="actual_receipt_amount_usd" label="实际收款金额 (USD)">
                <InputNumber placeholder="USD" min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="receipt_amount_rmb" label="兑换人民币金额">
                <InputNumber placeholder="¥" min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="receipt_rmb_date" label="兑换日期">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="invoice_amount" label="开票金额（RMB）">
                <InputNumber placeholder="开票金额" min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="invoice_date" label="佣金发票提供时间">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="tax_amount" label="报税金额（RMB）">
                <InputNumber placeholder="报税金额" min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="tax_date" label="报税时间">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
        </>
      ) : (
        <>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="total_amount" label="总金额">
                <InputNumber placeholder="总金额" min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="invoice_time" label="开票时间">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="payment_date" label="收款时间">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="payment_amount" label="收款金额">
                <InputNumber placeholder="收款金额" min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </>
      )}

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
