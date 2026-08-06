import { Empty, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import { businessDateLabel } from '@/lib/business-month';
import { formatCny } from '@/lib/monthly-profit';
import type {
  MonthlyProfitContract,
  MonthlyProfitOverview,
  MonthlyProfitRow,
} from '@/types/monthly-profit';

const ProfitValue: React.FC<{ value: number; max: number }> = ({ value, max }) => {
  const width = max > 0 ? Math.max(3, Math.abs(value) / max * 100) : 0;
  return (
    <div className={`monthly-profit-value ${value < 0 ? 'is-negative' : 'is-positive'}`}>
      <span className="monthly-profit-value__bar" aria-hidden="true">
        <i style={{ width: `${width}%` }} />
      </span>
      <strong>{formatCny(value)}</strong>
    </div>
  );
};

const detailColumns: ColumnsType<MonthlyProfitContract> = [
  { title: '销售合同', dataIndex: 'no', key: 'no', width: 160 },
  {
    title: '签约日期',
    dataIndex: 'signDate',
    key: 'signDate',
    width: 120,
    render: (value: string) => businessDateLabel(value),
  },
  {
    title: '客户 / 产品',
    key: 'business',
    width: 220,
    render: (_, record) => (
      <div className="monthly-profit-business">
        <strong>{record.customerName}</strong>
        <span>{record.productName}</span>
      </div>
    ),
  },
  {
    title: '关联采购',
    dataIndex: 'purchaseContractCount',
    key: 'purchaseContractCount',
    width: 100,
    render: (value: number) => `${value} 份`,
  },
  { title: '销售含税金额', dataIndex: 'salesAmountIncTax', key: 'salesAmountIncTax', width: 160, align: 'right', render: formatCny },
  { title: '采购含税金额', dataIndex: 'purchaseAmountIncTax', key: 'purchaseAmountIncTax', width: 160, align: 'right', render: formatCny },
  {
    title: '运杂及税费',
    key: 'expenses',
    width: 150,
    align: 'right',
    render: (_, record) => formatCny(
      record.freight + record.miscellaneous + record.tariff + record.valueAddedTax,
    ),
  },
  {
    title: '净利润',
    dataIndex: 'netProfit',
    key: 'netProfit',
    width: 160,
    align: 'right',
    render: (value: number) => (
      <strong className={value < 0 ? 'monthly-profit-number--negative' : 'monthly-profit-number--positive'}>
        {formatCny(value)}
      </strong>
    ),
  },
];

interface MonthlyProfitTableProps {
  overview: MonthlyProfitOverview;
  months: MonthlyProfitRow[];
  loading: boolean;
}

export const MonthlyProfitTable: React.FC<MonthlyProfitTableProps> = ({
  overview,
  months,
  loading,
}) => {
  const navigate = useNavigate();
  const maxProfit = Math.max(0, ...months.map((month) => Math.abs(month.netProfit)));
  const columns: ColumnsType<MonthlyProfitRow> = [
    {
      title: '月份',
      dataIndex: 'label',
      key: 'label',
      width: 90,
      fixed: 'left',
      className: 'monthly-profit-month-cell',
      render: (label: string, record) => (
        <div className="monthly-profit-month-label">
          <strong>{label}</strong>
          {record.monthKey === dayjs().format('YYYY-MM') && <Tag color="blue">本月</Tag>}
        </div>
      ),
    },
    { title: '关联合同', dataIndex: 'contractCount', key: 'contractCount', width: 80, render: (value: number) => value ? `${value} 组` : '-' },
    { title: '销售含税金额', dataIndex: 'salesAmountIncTax', key: 'salesAmountIncTax', width: 125, align: 'right', render: formatCny },
    { title: '采购含税金额', dataIndex: 'purchaseAmountIncTax', key: 'purchaseAmountIncTax', width: 125, align: 'right', render: formatCny },
    { title: '运杂及税费', dataIndex: 'expenses', key: 'expenses', width: 110, align: 'right', render: formatCny },
    { title: '营业利润', dataIndex: 'operatingProfit', key: 'operatingProfit', width: 125, align: 'right', render: formatCny },
    { title: '税额', dataIndex: 'taxAmount', key: 'taxAmount', width: 105, align: 'right', render: formatCny },
    {
      title: '合同净利润',
      dataIndex: 'netProfit',
      key: 'netProfit',
      width: 200,
      align: 'right',
      fixed: 'right',
      render: (value: number) => <ProfitValue value={value} max={maxProfit} />,
    },
  ];

  return (
    <Table<MonthlyProfitRow>
      rowKey="monthKey"
      columns={columns}
      dataSource={months}
      loading={loading}
      pagination={false}
      size="middle"
      scroll={{ x: 1008 }}
      locale={{ emptyText: <Empty description="该年度暂无关联合同利润数据" /> }}
      rowClassName={(record) => record.netProfit < 0 ? 'monthly-profit-row--negative' : ''}
      expandable={{
        rowExpandable: (record) => record.contracts.length > 0,
        expandedRowRender: (record) => (
          <Table<MonthlyProfitContract>
            rowKey="id"
            columns={detailColumns}
            dataSource={record.contracts}
            pagination={false}
            size="small"
            scroll={{ x: 1230 }}
            onRow={(contract) => ({
              onClick: () => navigate(`/manager/overview/contract/${contract.id}`),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(`/manager/overview/contract/${contract.id}`);
                }
              },
              tabIndex: 0,
              'aria-label': `查看销售合同 ${contract.no} 的关联合同详情`,
              className: 'monthly-profit-contract-row',
            })}
          />
        ),
      }}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0} />
          <Table.Summary.Cell index={1}><strong>年度合计</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={2}>{overview.totals.contractCount} 组</Table.Summary.Cell>
          <Table.Summary.Cell index={3} align="right">{formatCny(overview.totals.salesAmountIncTax)}</Table.Summary.Cell>
          <Table.Summary.Cell index={4} align="right">{formatCny(overview.totals.purchaseAmountIncTax)}</Table.Summary.Cell>
          <Table.Summary.Cell index={5} align="right">{formatCny(overview.totals.expenses)}</Table.Summary.Cell>
          <Table.Summary.Cell index={6} align="right">{formatCny(overview.totals.operatingProfit)}</Table.Summary.Cell>
          <Table.Summary.Cell index={7} align="right">{formatCny(overview.totals.taxAmount)}</Table.Summary.Cell>
          <Table.Summary.Cell index={8} align="right">
            <strong className={overview.totals.netProfit < 0 ? 'monthly-profit-number--negative' : 'monthly-profit-number--positive'}>
              {formatCny(overview.totals.netProfit)}
            </strong>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      )}
    />
  );
};
