import { useState, useEffect } from 'react';
import { Tabs, Table, Modal, Descriptions, App, Tag, Button, Flex, Spin } from 'antd';
import { DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import { pb } from '@/lib/pocketbase';
import { ServiceContractAPI } from '@/api/service-contract';
import type { ServiceContract, ServiceOrder } from '@/types/service-contract';
import type { ExpenseRecord } from '@/types/expense-record';
import type { BiddingRecord } from '@/types/bidding-record';

const bidResultMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待开标', color: 'orange' },
  won: { label: '中标', color: 'green' },
  lost: { label: '未中标', color: 'red' },
};

const renderFileLinks = (collectionName: string, recordId: string, files: string[] | undefined) => {
  if (!files || files.length === 0) return '-';
  return (
    <Flex vertical gap="small">
      {files.map((file: string) => (
        <a
          key={file}
          href={`${pb.baseUrl}/api/files/${collectionName}/${recordId}/${file}`}
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          <DownloadOutlined /> {file}
        </a>
      ))}
    </Flex>
  );
};

const serviceOrderColumns = [
  { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 120 },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 90, render: (v: number) => v ? `¥${v.toFixed(4)}` : '-' },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70 },
  { title: '收款金额(USD)', dataIndex: 'receipt_amount', key: 'receipt_amount', width: 120, render: (v: number) => v ? `$${v.toFixed(4)}` : '-' },
  { title: '收款时间', dataIndex: 'receipt_date', key: 'receipt_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '收款金额RMB', dataIndex: 'receipt_amount_rmb', key: 'receipt_amount_rmb', width: 110, render: (v: number) => v ? `¥${v.toFixed(4)}` : '-' },
  { title: '兑换日期', dataIndex: 'receipt_rmb_date', key: 'receipt_rmb_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '开票金额(RMB)', dataIndex: 'invoice_amount', key: 'invoice_amount', width: 120, render: (v: number) => v ? `¥${v.toFixed(4)}` : '-' },
  { title: '开票时间', dataIndex: 'invoice_date', key: 'invoice_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '报税金额(RMB)', dataIndex: 'tax_amount', key: 'tax_amount', width: 120, render: (v: number) => v ? `¥${v.toFixed(4)}` : '-' },
  { title: '报税时间', dataIndex: 'tax_date', key: 'tax_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true },
  { title: '负责人', dataIndex: 'manager', key: 'manager', width: 80 },
];

const OtherBusinessPage: React.FC = () => {
  const { message } = App.useApp();

  const [serviceContracts, setServiceContracts] = useState<ServiceContract[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [biddingRecords, setBiddingRecords] = useState<BiddingRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState<{
    type: 'service' | 'expense' | 'bidding';
    data: ServiceContract | ExpenseRecord | BiddingRecord | null;
  }>({ type: 'service', data: null });

  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [servicesRes, expensesRes, biddingsRes] = await Promise.allSettled([
          pb.collection('service_contracts').getList<ServiceContract>(1, 500, { expand: 'customer,creator_user' }),
          pb.collection('expense_records').getList<ExpenseRecord>(1, 500, { expand: 'creator_user' }),
          pb.collection('bidding_records').getList<BiddingRecord>(1, 500, { expand: 'sales_contract,creator_user' }),
        ]);
        if (servicesRes.status === 'fulfilled') setServiceContracts(servicesRes.value.items);
        if (expensesRes.status === 'fulfilled') setExpenseRecords(expensesRes.value.items);
        if (biddingsRes.status === 'fulfilled') setBiddingRecords(biddingsRes.value.items);
      } catch (error) {
        console.error('Fetch other business error:', error);
        message.error('加载数据失败');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [message]);

  const handleView = async (type: 'service' | 'expense' | 'bidding', record: ServiceContract | ExpenseRecord | BiddingRecord) => {
    setModalData({ type, data: record });
    setModalVisible(true);

    if (type === 'service') {
      setOrdersLoading(true);
      try {
        const result = await ServiceContractAPI.getOrders(record.id);
        setServiceOrders(result.items);
      } catch {
        setServiceOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    }
  };

  const serviceColumns = [
    { title: '合同编号', dataIndex: 'no', key: 'no', width: 140 },
    { title: '服务名称', dataIndex: 'product_name', key: 'product_name', width: 160, ellipsis: true },
    {
      title: '客户',
      key: 'customer',
      width: 140,
      render: (_: unknown, record: ServiceContract) => record.expand?.customer?.name || '-',
    },
    { title: '签约日期', dataIndex: 'sign_date', key: 'sign_date', width: 110, render: (v: string) => v?.split(' ')[0] || '-' },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_: unknown, record: ServiceContract) => (
        <Button type="text" icon={<EyeOutlined />} onClick={() => handleView('service', record)} />
      ),
    },
  ];

  const expenseColumns = [
    { title: '编号', dataIndex: 'no', key: 'no', width: 140 },
    { title: '支出类型', dataIndex: 'expense_type', key: 'expense_type', width: 120 },
    { title: '描述', dataIndex: 'description', key: 'description', width: 160, ellipsis: true },
    {
      title: '付款金额',
      dataIndex: 'payment_amount',
      key: 'payment_amount',
      width: 110,
      render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
    },
    { title: '付款日期', dataIndex: 'pay_date', key: 'pay_date', width: 110, render: (v: string) => v?.split(' ')[0] || '-' },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_: unknown, record: ExpenseRecord) => (
        <Button type="text" icon={<EyeOutlined />} onClick={() => handleView('expense', record)} />
      ),
    },
  ];

  const biddingColumns = [
    { title: '招标公司', dataIndex: 'bidding_company', key: 'bidding_company', width: 140, ellipsis: true },
    { title: '招标编号', dataIndex: 'bidding_no', key: 'bidding_no', width: 130 },
    { title: '产品名称', dataIndex: 'product_name', key: 'product_name', width: 130, ellipsis: true },
    {
      title: '标书费',
      dataIndex: 'tender_fee',
      key: 'tender_fee',
      width: 100,
      render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
    },
    {
      title: '投标保证金',
      dataIndex: 'bid_bond',
      key: 'bid_bond',
      width: 110,
      render: (v: number) => v ? `¥${v.toFixed(4)}` : '-',
    },
    { title: '开标时间', dataIndex: 'open_date', key: 'open_date', width: 110, render: (v: string) => v?.split(' ')[0] || '-' },
    {
      title: '中标结果',
      dataIndex: 'bid_result',
      key: 'bid_result',
      width: 100,
      render: (v: string) => {
        const info = bidResultMap[v];
        return info ? <Tag color={info.color}>{info.label}</Tag> : '-';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_: unknown, record: BiddingRecord) => (
        <Button type="text" icon={<EyeOutlined />} onClick={() => handleView('bidding', record)} />
      ),
    },
  ];

  const renderModalContent = () => {
    const { type, data } = modalData;
    if (!data) return null;

    if (type === 'service') {
      const r = data as ServiceContract;
      return (
        <>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="合同编号">{r.no}</Descriptions.Item>
            <Descriptions.Item label="服务名称">{r.product_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{r.expand?.customer?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="签约日期">{r.sign_date?.split(' ')[0] || '-'}</Descriptions.Item>
            <Descriptions.Item label="销售负责人">{r.sales_manager || '-'}</Descriptions.Item>
            <Descriptions.Item label="备注">{r.remark || '-'}</Descriptions.Item>
            <Descriptions.Item label="附件" span={2}>{renderFileLinks('service_contracts', r.id, r.attachments)}</Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 16 }}>
            <Spin spinning={ordersLoading}>
              <Table
                title={() => '佣金子订单'}
                columns={serviceOrderColumns}
                dataSource={serviceOrders}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 1400 }}
                locale={{ emptyText: '暂无子订单' }}
              />
            </Spin>
          </div>
        </>
      );
    }

    if (type === 'expense') {
      const r = data as ExpenseRecord;
      return (
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="记录编号">{r.no}</Descriptions.Item>
          <Descriptions.Item label="支出类型">{r.expense_type}</Descriptions.Item>
          <Descriptions.Item label="描述说明" span={2}>{r.description}</Descriptions.Item>
          <Descriptions.Item label="付款金额">{r.payment_amount ? `¥${r.payment_amount.toFixed(4)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="付款日期">{r.pay_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="付款方式">{r.method || '-'}</Descriptions.Item>
          <Descriptions.Item label="采购负责人">{r.purchasing_manager || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{r.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="附件" span={2}>{renderFileLinks('expense_records', r.id, r.attachments)}</Descriptions.Item>
        </Descriptions>
      );
    }

    if (type === 'bidding') {
      const r = data as BiddingRecord;
      const resultInfo = bidResultMap[r.bid_result];
      return (
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="招标公司">{r.bidding_company}</Descriptions.Item>
          <Descriptions.Item label="招标编号">{r.bidding_no}</Descriptions.Item>
          <Descriptions.Item label="产品名称">{r.product_name}</Descriptions.Item>
          <Descriptions.Item label="数量">{r.quantity}</Descriptions.Item>
          <Descriptions.Item label="标书费">{r.tender_fee ? `¥${r.tender_fee.toFixed(4)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="付标书费时间">{r.tender_fee_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="标书费发票附件" span={2}>{renderFileLinks('bidding_records', r.id, r.tender_fee_invoice)}</Descriptions.Item>
          <Descriptions.Item label="投标保证金">{r.bid_bond ? `¥${r.bid_bond.toFixed(4)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="付保证金时间">{r.bid_bond_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="开标时间">{r.open_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="中标结果">
            {resultInfo ? <Tag color={resultInfo.color}>{resultInfo.label}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="保证金退还时间">{r.bond_return_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="退还金额">{r.bond_return_amount ? `¥${r.bond_return_amount.toFixed(4)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="招标代理费">{r.agency_fee ? `¥${r.agency_fee.toFixed(4)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="关联销售合同">
            {r.expand?.sales_contract ? `${r.expand.sales_contract.no} - ${r.expand.sales_contract.product_name}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{r.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="附件" span={2}>{renderFileLinks('bidding_records', r.id, r.attachments)}</Descriptions.Item>
        </Descriptions>
      );
    }

    return null;
  };

  const modalTitle = modalData.type === 'service'
    ? '佣金合同详情'
    : modalData.type === 'expense'
    ? '资金支出详情'
    : '投标记录详情';

  return (
    <div style={{ padding: 24 }}>
      <Tabs
        defaultActiveKey="service"
        items={[
          {
            key: 'service',
            label: '佣金合同',
            children: (
              <Table
                columns={serviceColumns}
                dataSource={serviceContracts}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
                scroll={{ x: 700 }}
                locale={{ emptyText: '暂无数据' }}
              />
            ),
          },
          {
            key: 'expense',
            label: '资金支出',
            children: (
              <Table
                columns={expenseColumns}
                dataSource={expenseRecords}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
                scroll={{ x: 700 }}
                locale={{ emptyText: '暂无数据' }}
              />
            ),
          },
          {
            key: 'bidding',
            label: '投标记录',
            children: (
              <Table
                columns={biddingColumns}
                dataSource={biddingRecords}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
                scroll={{ x: 900 }}
                locale={{ emptyText: '暂无数据' }}
              />
            ),
          },
        ]}
      />

      <Modal
        title={modalTitle}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={modalData.type === 'service' ? 1000 : 600}
        centered
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
};

export default OtherBusinessPage;
