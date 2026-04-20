import { useState, useEffect } from 'react';
import { Tabs, Table, Modal, Descriptions, App, Tag, Button, Flex, Spin } from 'antd';
import { DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { pb } from '@/lib/pocketbase';
import { ServiceContractAPI } from '@/api/service-contract';
import type { ServiceContract, ServiceOrder } from '@/types/service-contract';
import type { ExpenseRecord } from '@/types/expense-record';
import type { BiddingRecord } from '@/types/bidding-record';
import type { ColumnsType } from 'antd/es/table';

const bidResultMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待开标', color: 'orange' },
  won: { label: '中标', color: 'green' },
  lost: { label: '未中标', color: 'red' },
};

const fmtDate = (v?: string) => v?.split(' ')[0] || '';
const fmtNum = (v?: number) => v != null ? v : '';

const exportServiceOrders = (contract: ServiceContract, orders: ServiceOrder[]) => {
  const rows = orders.map((o, i) => {
    const base: Record<string, unknown> = {
      '序号': i + 1,
      '订单号': o.order_no,
      '负责人': o.manager || '',
      '单价': fmtNum(o.unit_price),
      '数量': fmtNum(o.quantity),
      '服务费比例(%)': fmtNum(o.service_fee_rate),
    };
    if (contract.is_cross_border) {
      Object.assign(base, {
        '收款金额(USD)': fmtNum(o.receipt_amount),
        '收款时间': fmtDate(o.receipt_date),
        '出港时间': fmtDate(o.departure_date),
        '客户付款时间': fmtDate(o.customer_payment_date),
        '银行收汇时间': fmtDate(o.bank_settlement_date),
        '实际收款金额(USD)': fmtNum(o.actual_receipt_amount_usd),
        '兑换人民币金额': fmtNum(o.receipt_amount_rmb),
        '兑换日期': fmtDate(o.receipt_rmb_date),
        '开票金额(RMB)': fmtNum(o.invoice_amount),
        '佣金发票提供时间': fmtDate(o.invoice_date),
        '报税金额(RMB)': fmtNum(o.tax_amount),
        '报税时间': fmtDate(o.tax_date),
      });
    } else {
      Object.assign(base, {
        '总金额': fmtNum(o.total_amount),
        '开票时间': fmtDate(o.invoice_time),
        '收款时间': fmtDate(o.payment_date),
        '收款金额': fmtNum(o.payment_amount),
      });
    }
    base['备注'] = o.remark || '';
    return base;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '佣金子订单');
  XLSX.writeFile(wb, `${contract.no}_佣金子订单.xlsx`);
};

const exportExpenses = (records: ExpenseRecord[]) => {
  const rows = records.map((r, i) => ({
    '序号': i + 1,
    '编号': r.no,
    '支出类型': r.expense_type,
    '描述': r.description,
    '付款金额': fmtNum(r.payment_amount),
    '付款日期': fmtDate(r.pay_date),
    '付款方式': r.method || '',
    '采购负责人': r.purchasing_manager || '',
    '备注': r.remark || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '资金支出');
  XLSX.writeFile(wb, '资金支出报表.xlsx');
};

const exportBiddings = (records: BiddingRecord[]) => {
  const rows = records.map((r, i) => ({
    '序号': i + 1,
    '招标公司': r.bidding_company,
    '招标编号': r.bidding_no,
    '产品名称': r.product_name,
    '数量': fmtNum(r.quantity),
    '标书费': fmtNum(r.tender_fee),
    '投标保证金金额': fmtNum(r.bid_bond),
    '付保证金时间': fmtDate(r.bid_bond_date),
    '开标时间': fmtDate(r.open_date),
    '中标结果': bidResultMap[r.bid_result]?.label || '',
    '保证金退还时间': fmtDate(r.bond_return_date),
    '招标代理费': fmtNum(r.agency_fee),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '投标记录');
  XLSX.writeFile(wb, '投标记录报表.xlsx');
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

const getCrossBorderServiceOrderColumns = (): ColumnsType<ServiceOrder> => [
  { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 120 },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 90, render: (v: number) => v ? `¥${v.toFixed(6)}` : '-' },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70 },
  { title: '服务费比例', dataIndex: 'service_fee_rate', key: 'service_fee_rate', width: 90, render: (v: number) => v != null ? `${v}%` : '-' },
  { title: '收款金额(USD)', dataIndex: 'receipt_amount', key: 'receipt_amount', width: 120, render: (v: number) => v ? `$${v.toFixed(6)}` : '-' },
  { title: '收款时间', dataIndex: 'receipt_date', key: 'receipt_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '出港时间', dataIndex: 'departure_date', key: 'departure_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '客户付款时间', dataIndex: 'customer_payment_date', key: 'customer_payment_date', width: 110, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '银行收汇时间', dataIndex: 'bank_settlement_date', key: 'bank_settlement_date', width: 110, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '实际收款(USD)', dataIndex: 'actual_receipt_amount_usd', key: 'actual_receipt_amount_usd', width: 120, render: (v: number) => v != null ? `$${v.toFixed(6)}` : '-' },
  { title: '兑换人民币金额', dataIndex: 'receipt_amount_rmb', key: 'receipt_amount_rmb', width: 120, render: (v: number) => v ? `¥${v.toFixed(6)}` : '-' },
  { title: '兑换日期', dataIndex: 'receipt_rmb_date', key: 'receipt_rmb_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '开票金额(RMB)', dataIndex: 'invoice_amount', key: 'invoice_amount', width: 120, render: (v: number) => v ? `¥${v.toFixed(6)}` : '-' },
  { title: '佣金发票提供时间', dataIndex: 'invoice_date', key: 'invoice_date', width: 140, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '报税金额(RMB)', dataIndex: 'tax_amount', key: 'tax_amount', width: 120, render: (v: number) => v ? `¥${v.toFixed(6)}` : '-' },
  { title: '报税时间', dataIndex: 'tax_date', key: 'tax_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true },
  {
    title: '附件',
    key: 'attachments',
    width: 150,
    render: (_: unknown, record: ServiceOrder) => {
      if (!record.attachments || record.attachments.length === 0) return '-';
      return (
        <Flex vertical gap="small">
          {record.attachments.map((file: string) => (
            <a
              key={file}
              href={`${pb.baseUrl}/api/files/service_orders/${record.id}/${file}`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <DownloadOutlined /> {file}
            </a>
          ))}
        </Flex>
      );
    },
  },
  { title: '负责人', dataIndex: 'manager', key: 'manager', width: 80 },
];

const getDomesticServiceOrderColumns = (): ColumnsType<ServiceOrder> => [
  { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 120 },
  { title: '负责人', dataIndex: 'manager', key: 'manager', width: 80 },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70 },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 90, render: (v: number) => v ? `¥${v.toFixed(6)}` : '-' },
  { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, render: (v: number) => v != null ? `¥${v.toFixed(6)}` : '-' },
  { title: '服务费比例', dataIndex: 'service_fee_rate', key: 'service_fee_rate', width: 100, render: (v: number) => v != null ? `${v}%` : '-' },
  { title: '开票时间', dataIndex: 'invoice_time', key: 'invoice_time', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '收款时间', dataIndex: 'payment_date', key: 'payment_date', width: 100, render: (v: string) => v?.split(' ')[0] || '-' },
  { title: '收款金额', dataIndex: 'payment_amount', key: 'payment_amount', width: 100, render: (v: number) => v != null ? `¥${v.toFixed(6)}` : '-' },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true },
  {
    title: '附件',
    key: 'attachments',
    width: 150,
    render: (_: unknown, record: ServiceOrder) => {
      if (!record.attachments || record.attachments.length === 0) return '-';
      return (
        <Flex vertical gap="small">
          {record.attachments.map((file: string) => (
            <a
              key={file}
              href={`${pb.baseUrl}/api/files/service_orders/${record.id}/${file}`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <DownloadOutlined /> {file}
            </a>
          ))}
        </Flex>
      );
    },
  },
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
      title: '类型',
      key: 'type',
      width: 80,
      render: (_: unknown, record: ServiceContract) =>
        record.is_cross_border ? <Tag color="blue">跨境</Tag> : <Tag>国内</Tag>,
    },
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
      render: (v: number) => v ? `¥${v.toFixed(6)}` : '-',
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
      render: (v: number) => v ? `¥${v.toFixed(6)}` : '-',
    },
    {
      title: '投标保证金',
      dataIndex: 'bid_bond',
      key: 'bid_bond',
      width: 110,
      render: (v: number) => v ? `¥${v.toFixed(6)}` : '-',
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
      const orderCols = r.is_cross_border
        ? getCrossBorderServiceOrderColumns()
        : getDomesticServiceOrderColumns();

      return (
        <>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="合同编号">{r.no}</Descriptions.Item>
            <Descriptions.Item label="服务名称">{r.product_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{r.expand?.customer?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="签约日期">{r.sign_date?.split(' ')[0] || '-'}</Descriptions.Item>
            <Descriptions.Item label="跨境交易">
              {r.is_cross_border ? <Tag color="blue">跨境</Tag> : <Tag>国内</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="销售负责人">{r.sales_manager || '-'}</Descriptions.Item>
            <Descriptions.Item label="备注">{r.remark || '-'}</Descriptions.Item>
            <Descriptions.Item label="附件">{renderFileLinks('service_contracts', r.id, r.attachments)}</Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 16 }}>
            <Spin spinning={ordersLoading}>
              <Table
                title={() => (
                  <Flex justify="space-between" align="center">
                    <span>佣金子订单</span>
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => exportServiceOrders(r, serviceOrders)}
                      disabled={ordersLoading || serviceOrders.length === 0}
                    >
                      导出Excel
                    </Button>
                  </Flex>
                )}
                columns={orderCols}
                dataSource={serviceOrders}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: r.is_cross_border ? 2000 : 1000 }}
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
          <Descriptions.Item label="付款金额">{r.payment_amount ? `¥${r.payment_amount.toFixed(6)}` : '-'}</Descriptions.Item>
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
          <Descriptions.Item label="标书费">{r.tender_fee ? `¥${r.tender_fee.toFixed(6)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="付标书费时间">{r.tender_fee_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="标书费发票附件" span={2}>{renderFileLinks('bidding_records', r.id, r.tender_fee_invoice)}</Descriptions.Item>
          <Descriptions.Item label="投标保证金">{r.bid_bond ? `¥${r.bid_bond.toFixed(6)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="付保证金时间">{r.bid_bond_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="开标时间">{r.open_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="中标结果">
            {resultInfo ? <Tag color={resultInfo.color}>{resultInfo.label}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="保证金退还时间">{r.bond_return_date?.split(' ')[0] || '-'}</Descriptions.Item>
          <Descriptions.Item label="退还金额">{r.bond_return_amount ? `¥${r.bond_return_amount.toFixed(6)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="招标代理费">{r.agency_fee ? `¥${r.agency_fee.toFixed(6)}` : '-'}</Descriptions.Item>
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
                title={() => (
                  <Flex justify="flex-end">
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => {
                      const allOrders: ServiceOrder[] = [];
                      const contracts = serviceContracts;
                      Promise.all(contracts.map(c => ServiceContractAPI.getOrders(c.id).then(r => r.items).catch(() => [])))
                        .then(results => {
                          results.forEach(items => allOrders.push(...items));
                          if (allOrders.length === 0) { message.warning('无数据可导出'); return; }
                          const rows: Record<string, unknown>[] = [];
                          contracts.forEach(c => {
                            const orders = allOrders.filter(o => o.service_contract === c.id);
                            orders.forEach((o, i) => {
                              const base: Record<string, unknown> = {
                                '合同编号': c.no,
                                '客户': c.expand?.customer?.name || '',
                                '序号': i + 1,
                                '订单号': o.order_no,
                                '负责人': o.manager || '',
                                '单价': fmtNum(o.unit_price),
                                '数量': fmtNum(o.quantity),
                                '服务费比例(%)': fmtNum(o.service_fee_rate),
                              };
                              if (c.is_cross_border) {
                                Object.assign(base, {
                                  '收款金额(USD)': fmtNum(o.receipt_amount),
                                  '收款时间': fmtDate(o.receipt_date),
                                  '出港时间': fmtDate(o.departure_date),
                                  '客户付款时间': fmtDate(o.customer_payment_date),
                                  '银行收汇时间': fmtDate(o.bank_settlement_date),
                                  '实际收款金额(USD)': fmtNum(o.actual_receipt_amount_usd),
                                  '兑换人民币金额': fmtNum(o.receipt_amount_rmb),
                                  '兑换日期': fmtDate(o.receipt_rmb_date),
                                  '开票金额(RMB)': fmtNum(o.invoice_amount),
                                  '佣金发票提供时间': fmtDate(o.invoice_date),
                                  '报税金额(RMB)': fmtNum(o.tax_amount),
                                  '报税时间': fmtDate(o.tax_date),
                                });
                              } else {
                                Object.assign(base, {
                                  '总金额': fmtNum(o.total_amount),
                                  '开票时间': fmtDate(o.invoice_time),
                                  '收款时间': fmtDate(o.payment_date),
                                  '收款金额': fmtNum(o.payment_amount),
                                });
                              }
                              base['备注'] = o.remark || '';
                              rows.push(base);
                            });
                          });
                          const ws = XLSX.utils.json_to_sheet(rows);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, '佣金子订单');
                          XLSX.writeFile(wb, '佣金合同全部子订单.xlsx');
                        });
                    }}>
                      导出全部子订单
                    </Button>
                  </Flex>
                )}
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
                title={() => (
                  <Flex justify="flex-end">
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => exportExpenses(expenseRecords)} disabled={expenseRecords.length === 0}>
                      导出Excel
                    </Button>
                  </Flex>
                )}
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
                title={() => (
                  <Flex justify="flex-end">
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => exportBiddings(biddingRecords)} disabled={biddingRecords.length === 0}>
                      导出Excel
                    </Button>
                  </Flex>
                )}
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
