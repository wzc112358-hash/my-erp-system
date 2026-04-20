import { useEffect, useState } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Upload, Button, Row, Col, App, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PurchaseContractAPI, SalesContractAPI } from '@/api/purchase-arrival';
import type { PurchaseArrivalFormData } from '@/types/purchase-arrival';
import { extractAttachments } from '@/utils/file';

interface ArrivalFormProps {
  initialValues?: Partial<PurchaseArrivalFormData>;
  onFinish: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

export const ArrivalForm: React.FC<ArrivalFormProps> = ({
  initialValues,
  onFinish,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [contractOptions, setContractOptions] = useState<{ label: string; value: string }[]>([]);
  const [salesContractOptions, setSalesContractOptions] = useState<{ label: string; value: string }[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [wetherTransit, setWetherTransit] = useState<'yes' | 'no'>('no');

  useEffect(() => {
    const fetchContracts = async () => {
      setLoadingContracts(true);
      try {
        const result = await PurchaseContractAPI.getOptions();
        const options = result.items.map((item) => {
          const record = item as unknown as { id: string; no: string; product_name: string };
          return {
            label: `${record.no} - ${record.product_name}`,
            value: record.id,
          };
        });
        setContractOptions(options);

        const salesResult = await SalesContractAPI.getSalesOptions();
        const salesOpts = salesResult.items.map((item) => {
          const record = item as unknown as { id: string; no: string; product_name: string };
          return {
            label: `${record.no} - ${record.product_name}`,
            value: record.id,
          };
        });
        setSalesContractOptions(salesOpts);
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
      const transit = initialValues.wether_transit || 'no';
      setWetherTransit(transit);
      form.setFieldsValue({
        ...initialValues,
        shipment_date: initialValues.shipment_date ? dayjs(initialValues.shipment_date) : undefined,
        freight_1_date: initialValues.freight_1_date ? dayjs(initialValues.freight_1_date) : undefined,
        freight_2_date: initialValues.freight_2_date ? dayjs(initialValues.freight_2_date) : undefined,
      });
    }
  }, [initialValues, form]);

  const handleContractChange = (value: string) => {
    const selected = contractOptions.find((opt) => opt.value === value);
    if (selected && !initialValues?.product_name) {
      form.setFieldsValue({ product_name: '' });
    }
  };

  const handleWetherTransitChange = (value: 'yes' | 'no') => {
    setWetherTransit(value);
    if (value === 'no') {
      form.setFieldsValue({
        transit_warehouse: undefined,
        freight_2: undefined,
        freight_2_currency: undefined,
        freight_2_status: undefined,
        freight_2_date: undefined,
        invoice_2_status: undefined,
      });
    }
  };

  const handleFinish = (values: Record<string, unknown>) => {
    const fileList = values.attachments as { originFileObj?: File }[] | undefined;
    const attachments = extractAttachments(fileList);
    
    const data: PurchaseArrivalFormData = {
      product_name: String(values.product_name || ''),
      purchase_contract: String(values.purchase_contract || ''),
      sales_contract: values.sales_contract ? String(values.sales_contract) : undefined,
      tracking_contract_no: String(values.tracking_contract_no || ''),
      shipment_date: values.shipment_date ? (values.shipment_date as dayjs.Dayjs).format('YYYY-MM-DD') : '',
      quantity: Number(values.quantity) || 0,
      logistics_company: String(values.logistics_company || ''),
      shipment_address: String(values.shipment_address || ''),
      wether_transit: values.wether_transit as 'yes' | 'no',
      transit_warehouse: values.transit_warehouse ? String(values.transit_warehouse) : undefined,
      delivery_address: String(values.delivery_address || ''),
      freight_1: Number(values.freight_1) || 0,
      freight_1_currency: (values.freight_1_currency as 'USD' | 'CNY') || 'CNY',
      freight_2: values.freight_2 !== undefined ? Number(values.freight_2) : undefined,
      freight_2_currency: (values.freight_2_currency as 'USD' | 'CNY') || undefined,
      miscellaneous_expenses: Number(values.miscellaneous_expenses) || 0,
      miscellaneous_expenses_currency: (values.miscellaneous_expenses_currency as 'USD' | 'CNY') || 'CNY',
      freight_1_status: (values.freight_1_status as 'paid' | 'unpaid') || 'unpaid',
      freight_2_status: values.freight_2_status as 'paid' | 'unpaid' | undefined,
      freight_1_date: values.freight_1_date ? (values.freight_1_date as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
      freight_2_date: values.freight_2_date ? (values.freight_2_date as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
      invoice_1_status: (values.invoice_1_status as 'issued' | 'unissued') || 'unissued',
      invoice_2_status: values.invoice_2_status as 'issued' | 'unissued' | undefined,
      remark: values.remark ? String(values.remark) : undefined,
      attachments,
    };
    onFinish(data as unknown as Record<string, unknown>);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        wether_transit: 'no',
        freight_1_status: 'unpaid',
        invoice_1_status: 'unissued',
        freight_1: 0,
        freight_1_currency: 'CNY',
        miscellaneous_expenses: 0,
        miscellaneous_expenses_currency: 'CNY',
      }}
      onFinish={handleFinish}
    >
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="purchase_contract"
            label="关联采购合同"
            rules={[{ required: true, message: '请选择采购合同' }]}
          >
            <Select
              placeholder="选择采购合同"
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
            name="sales_contract"
            label="关联销售合同"
          >
            <Select
              placeholder="选择销售合同（可选）"
              showSearch
              allowClear
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={salesContractOptions}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="tracking_contract_no"
            label="运输合同号"
            rules={[{ required: true, message: '请输入运输合同号' }]}
          >
            <Input placeholder="请输入运输合同号" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="wether_transit"
            label="是否有中转站"
            rules={[{ required: true, message: '请选择是否有中转站' }]}
          >
            <Select
              options={[
                { label: '否', value: 'no' },
                { label: '是', value: 'yes' },
              ]}
              onChange={handleWetherTransitChange}
            />
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
            name="shipment_date"
            label="发货日期"
            rules={[{ required: true, message: '请选择发货日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="quantity"
            label="到货数量"
            rules={[{ required: true, message: '请输入到货数量' }]}
          >
            <InputNumber min={0.01} precision={4} style={{ width: '100%' }} placeholder="请输入到货数量" />
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
        <Col xs={24} md={12}>
          <Form.Item
            name="shipment_address"
            label="发货地址"
            rules={[{ required: true, message: '请输入发货地址' }]}
          >
            <Input placeholder="请输入发货地址" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="delivery_address"
            label="收货地址"
            rules={[{ required: true, message: '请输入收货地址' }]}
          >
            <Input placeholder="请输入收货地址" />
          </Form.Item>
        </Col>
      </Row>

      {wetherTransit === 'yes' && (
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="transit_warehouse"
              label="中转仓库"
              rules={[{ required: true, message: '请输入中转仓库' }]}
            >
              <Input placeholder="请输入中转仓库" />
            </Form.Item>
          </Col>
        </Row>
      )}

      <Row gutter={16}>
        <Col xs={24} sm={12} md={6}>
          <Form.Item
            name="freight_1"
            label="运费金额1"
            rules={[{ required: true, message: '请输入运费金额1' }]}
          >
            <InputNumber min={0} precision={4} style={{ width: '100%' }} placeholder="请输入运费金额1" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item
            name="freight_1_currency"
            label="运费1币种"
            initialValue="CNY"
          >
            <Select
              options={[
                { label: '人民币(CNY)', value: 'CNY' },
                { label: '美元(USD)', value: 'USD' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item
            name="freight_1_status"
            label="运费1状态"
          >
            <Select
              options={[
                { label: '已付', value: 'paid' },
                { label: '未付', value: 'unpaid' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item name="freight_1_date" label="运费1付款日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      {wetherTransit === 'yes' && (
        <Row gutter={16}>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              name="freight_2"
              label="运费金额2"
              rules={[{ required: true, message: '请输入运费金额2' }]}
            >
              <InputNumber min={0} precision={4} style={{ width: '100%' }} placeholder="请输入运费金额2" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              name="freight_2_currency"
              label="运费2币种"
              initialValue="CNY"
            >
              <Select
                options={[
                  { label: '人民币(CNY)', value: 'CNY' },
                  { label: '美元(USD)', value: 'USD' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              name="freight_2_status"
              label="运费2状态"
              rules={[{ required: true, message: '请选择运费2状态' }]}
            >
              <Select
                options={[
                  { label: '已付', value: 'paid' },
                  { label: '未付', value: 'unpaid' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="freight_2_date" label="运费2付款日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      )}

      <Row gutter={16}>
        <Col xs={24} sm={12} md={6}>
          <Form.Item
            name="miscellaneous_expenses"
            label="杂费"
            rules={[{ required: true, message: '请输入杂费' }]}
          >
            <InputNumber min={0} precision={4} style={{ width: '100%' }} placeholder="请输入杂费" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item
            name="miscellaneous_expenses_currency"
            label="杂费币种"
            initialValue="CNY"
          >
            <Select
              options={[
                { label: '人民币(CNY)', value: 'CNY' },
                { label: '美元(USD)', value: 'USD' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item
            name="invoice_1_status"
            label="发票1状态"
          >
            <Select
              options={[
                { label: '已开', value: 'issued' },
                { label: '未开', value: 'unissued' },
              ]}
            />
          </Form.Item>
        </Col>
        {wetherTransit === 'yes' && (
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              name="invoice_2_status"
              label="发票2状态"
              rules={[{ required: true, message: '请选择发票2状态' }]}
            >
              <Select
                options={[
                  { label: '已开', value: 'issued' },
                  { label: '未开', value: 'unissued' },
                ]}
              />
            </Form.Item>
          </Col>
        )}
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
