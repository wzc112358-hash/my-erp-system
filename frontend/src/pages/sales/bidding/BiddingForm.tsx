import { Form, Input, InputNumber, DatePicker, Button, Row, Col, Space, Upload, Select, Divider } from 'antd';
import type { FormInstance } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { pb } from '@/lib/pocketbase';
import type { BiddingRecordFormData, BiddingRecord } from '@/types/bidding-record';

interface BiddingFormProps {
  form: FormInstance<BiddingRecordFormData>;
  onFinish: (values: BiddingRecordFormData) => void;
  onCancel: () => void;
  initialValues?: BiddingRecord | null;
}

interface SalesContractOption {
  id: string;
  no: string;
  product_name: string;
}

export const BiddingForm: React.FC<BiddingFormProps> = ({ form, onFinish, onCancel, initialValues }) => {
  const [contractOptions, setContractOptions] = useState<SalesContractOption[]>([]);

  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const result = await pb.collection('sales_contracts').getList<SalesContractOption>(1, 500, {});
        setContractOptions(result.items);
      } catch {
        // ignore
      }
    };
    fetchContracts();
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
              tender_fee_date: initialValues.tender_fee_date ? dayjs(initialValues.tender_fee_date.split(' ')[0]) : undefined,
              bid_bond_date: initialValues.bid_bond_date ? dayjs(initialValues.bid_bond_date.split(' ')[0]) : undefined,
              open_date: initialValues.open_date ? dayjs(initialValues.open_date.split(' ')[0]) : undefined,
              bond_return_date: initialValues.bond_return_date ? dayjs(initialValues.bond_return_date.split(' ')[0]) : undefined,
              tender_fee_invoice: Array.isArray(initialValues.tender_fee_invoice)
                ? initialValues.tender_fee_invoice.map((file, index) => ({
                    uid: `${index}`,
                    name: file,
                    status: 'done' as const,
                    url: file,
                  }))
                : [],
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
              bidding_company: '',
              bidding_no: '',
              product_name: '',
              quantity: undefined,
              bid_result: 'pending',
              tender_fee_invoice: [],
              attachments: [],
            }
      }
    >
      <Divider titlePlacement="left" plain>投标信息</Divider>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="bidding_company"
            label="招标公司"
            rules={[{ required: true, message: '请输入招标公司' }]}
          >
            <Input placeholder="请输入招标公司" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="bidding_no"
            label="招标编号"
            rules={[{ required: true, message: '请输入招标编号' }]}
          >
            <Input placeholder="请输入招标编号" />
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
            name="quantity"
            label="数量"
            rules={[{ required: true, message: '请输入数量' }]}
          >
            <InputNumber placeholder="请输入数量" min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="left" plain>标书费</Divider>
      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="tender_fee" label="标书费">
            <InputNumber placeholder="请输入标书费" min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="tender_fee_date" label="付标书费时间">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="tender_fee_invoice"
            label="标书费发票附件"
            valuePropName="fileList"
            getValueFromEvent={(e: { fileList?: unknown[] } | unknown[]) => {
              if (Array.isArray(e)) return e;
              return e?.fileList || [];
            }}
          >
            <Upload beforeUpload={() => false} maxCount={3} multiple listType="text">
              <Button icon={<UploadOutlined />}>上传</Button>
            </Upload>
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="left" plain>保证金</Divider>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="bid_bond" label="投标保证金">
            <InputNumber placeholder="请输入投标保证金" min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="bid_bond_date" label="付保证金时间">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="left" plain>开标信息</Divider>
      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="open_date" label="开标时间">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="bid_result" label="中标结果">
            <Select
              placeholder="请选择中标结果"
              options={[
                { label: '待开标', value: 'pending' },
                { label: '中标', value: 'won' },
                { label: '未中标', value: 'lost' },
              ]}
            />
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="left" plain>保证金退还</Divider>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="bond_return_date" label="保证金退还时间">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="bond_return_amount" label="退还金额">
            <InputNumber placeholder="请输入退还金额" min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="left" plain>其他</Divider>
      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="agency_fee" label="招标代理费">
            <InputNumber placeholder="请输入招标代理费" min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={16}>
          <Form.Item name="sales_contract" label="关联销售合同">
            <Select
              placeholder="可选，中标后关联"
              allowClear
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={contractOptions.map((c) => ({
                label: `${c.no} - ${c.product_name}`,
                value: c.id,
              }))}
            />
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
