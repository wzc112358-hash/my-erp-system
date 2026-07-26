import { Col, Divider, Form, Input, InputNumber, Row, Select } from 'antd';

const amountInput = <InputNumber min={0} precision={4} style={{ width: '100%' }} />;

export const BiddingBusinessFields: React.FC = () => (
  <>
    <Divider titlePlacement="left" plain>产品与报价</Divider>
    <Row gutter={16}>
      <Col xs={24} md={12}>
        <Form.Item name="specification" label="规格与技术指标">
          <Input.TextArea rows={2} placeholder="牌号、技术参数、用途等" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Form.Item name="purity" label="纯度/含量">
          <Input placeholder="例如 ≥37%" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Form.Item name="packaging" label="包装">
          <Input placeholder="例如 25kg/桶" />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={16}>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="quoted_unit_price" label="我方报价单价">
          {amountInput}
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="quoted_total_amount" label="我方报价总额">
          {amountInput}
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="currency" label="币种">
          <Select
            allowClear
            placeholder="公告未明确时留空"
            options={[
              { label: '人民币 CNY', value: 'CNY' },
              { label: '美元 USD', value: 'USD' },
              { label: '欧元 EUR', value: 'EUR' },
            ]}
          />
        </Form.Item>
      </Col>
    </Row>

    <Divider titlePlacement="left" plain>中标结果与复盘</Divider>
    <Row gutter={16}>
      <Col xs={24} sm={12} md={6}>
        <Form.Item name="winning_unit_price" label="历史中标单价">
          {amountInput}
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Form.Item name="winning_total_amount" label="历史中标总额">
          {amountInput}
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Form.Item name="winning_supplier" label="中标厂家">
          <Input placeholder="中标单位或供应商" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Form.Item name="brand" label="品牌/生产商">
          <Input placeholder="产品品牌或实际生产商" />
        </Form.Item>
      </Col>
    </Row>
    <Form.Item name="loss_reason" label="未中标/弃标原因">
      <Input.TextArea rows={2} placeholder="例如价格排名、资质、技术指标、主动弃标等" />
    </Form.Item>
    <Form.Item name="qualification_snapshot" label="当时确认满足的资质">
      <Select
        mode="tags"
        tokenSeparators={['；', ';']}
        placeholder="逐项填写已核实满足的准入、业绩、检测、授权或危化资质"
      />
    </Form.Item>
  </>
);
