import { useState, useEffect } from 'react';
import { Card, Table, Tabs, DatePicker, Button, Space, Modal } from 'antd';
import dayjs from 'dayjs';
import { PerformanceAPI } from '@/api/performance';
import type { UserPerformance, ContractDetail } from '@/api/performance';

const { RangePicker } = DatePicker;

const detailColumns = [
  { title: '合同编号', dataIndex: 'no', key: 'no' },
  { title: '品名', dataIndex: 'product_name', key: 'product_name' },
  { title: '签订日期', dataIndex: 'sign_date', key: 'sign_date', render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
  { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', render: (v: number) => `¥${(v ?? 0).toFixed(6)}` },
  { title: '数量(吨)', dataIndex: 'total_quantity', key: 'total_quantity', render: (v: number) => v?.toFixed(6) || '0.00' },
];

function makeColumns(): import('antd/es/table').ColumnsType<UserPerformance> {
  return [
    {
      title: '业务员',
      dataIndex: 'userName',
      key: 'userName',
      width: 150,
    },
    {
      title: '合同数量',
      dataIndex: 'contractCount',
      key: 'contractCount',
      width: 120,
      sorter: (a, b) => a.contractCount - b.contractCount,
    },
    {
      title: '合同总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 180,
      sorter: (a, b) => a.totalAmount - b.totalAmount,
      render: (v: number) => `¥${v.toFixed(6)}`,
    },
    {
      title: '金额占比',
      dataIndex: 'amountPercent',
      key: 'amountPercent',
      width: 120,
      sorter: (a, b) => a.amountPercent - b.amountPercent,
      render: (v: number) => `${v.toFixed(1)}%`,
    },
  ];
}

export const PerformancePage: React.FC = () => {
  const [salesData, setSalesData] = useState<UserPerformance[]>([]);
  const [purchaseData, setPurchaseData] = useState<UserPerformance[]>([]);
  const [serviceData, setServiceData] = useState<UserPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContracts, setModalContracts] = useState<ContractDetail[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const start = dateRange?.[0]?.format('YYYY-MM-DD') || undefined;
      const end = dateRange?.[1]?.endOf('day').format('YYYY-MM-DD HH:mm:ss') || undefined;
      const [sales, purchase, service] = await Promise.allSettled([
        PerformanceAPI.getSalesPerformance(start, end),
        PerformanceAPI.getPurchasePerformance(start, end),
        PerformanceAPI.getServicePerformance(start, end),
      ]);
      if (sales.status === 'fulfilled') setSalesData(sales.value);
      if (purchase.status === 'fulfilled') setPurchaseData(purchase.value);
      if (service.status === 'fulfilled') setServiceData(service.value);
    } catch (err) {
      console.error('Fetch performance error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRowClick = (record: UserPerformance) => {
    setModalTitle(`${record.userName} 的合同明细`);
    setModalContracts(record.contracts);
    setModalOpen(true);
  };

  const renderTable = (data: UserPerformance[]) => {
    const cols = makeColumns();

    return (
      <Table<UserPerformance>
        columns={cols}
        dataSource={data}
        rowKey="userId"
        pagination={false}
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
          style: { cursor: 'pointer' },
        })}
        summary={(pageData) => {
          const totalContracts = pageData.reduce((s, d) => s + d.contractCount, 0);
          const totalAmount = pageData.reduce((s, d) => s + d.totalAmount, 0);
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1}><strong>{totalContracts}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={2}><strong>¥{totalAmount.toFixed(6)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><strong>100%</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          );
        }}
      />
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="业绩统计"
        extra={
          <Space>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              placeholder={['开始日期', '结束日期']}
            />
            <Button type="primary" onClick={fetchData} loading={loading}>
              查询
            </Button>
            <Button onClick={() => setDateRange(null)}>
              重置
            </Button>
          </Space>
        }
      >
        <Tabs
          items={[
            {
              key: 'sales',
              label: '销售业绩',
              children: renderTable(salesData),
            },
            {
              key: 'purchase',
              label: '采购业绩',
              children: renderTable(purchaseData),
            },
            {
              key: 'service',
              label: '佣金业绩',
              children: renderTable(serviceData),
            },
          ]}
        />
      </Card>

      <Modal
        title={modalTitle}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={detailColumns}
          dataSource={modalContracts}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Modal>
    </div>
  );
};

export default PerformancePage;
