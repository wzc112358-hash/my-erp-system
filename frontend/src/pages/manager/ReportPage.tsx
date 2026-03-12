import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Select, Space, App, Spin, Empty } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { ReportAPI } from '@/api/report';
import type { ReportData, ReportSummary } from '@/types/report';

const { Option } = Select;

const currentYear = new Date().getFullYear();

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}月`,
}));

export const ReportPage: React.FC = () => {
  const { message } = App.useApp();
  const [startMonth, setStartMonth] = useState<number>(1);
  const [endMonth, setEndMonth] = useState<number>(12);
  const [year, setYear] = useState<number>(currentYear);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({
    totalSalesAmount: 0,
    totalPurchaseAmount: 0,
    totalSalesTaxAmount: 0,
    totalPurchaseTaxAmount: 0,
    totalTax: 0,
    totalFreight: 0,
    totalMiscellaneous: 0,
    totalProfit: 0,
    totalNetProfit: 0,
  });

  useEffect(() => {
    fetchReportData();
  }, [startMonth, endMonth, year]);

  const fetchReportData = async () => {
    let cancelled = false;
    setLoading(true);

    try {
      const result = await ReportAPI.getReportData(
        { startMonth, endMonth, year }
      );
      if (!cancelled) {
        setReportData(result.data);
        setSummary(result.summary);
      }
    } catch (error) {
      const err = error as { response?: { status?: number }; message?: string };
      if (err.response?.status === 0 || err.message?.includes('aborted')) {
        return;
      }
      console.error('Fetch report error:', error);
      message.error('加载报表失败');
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }

    return () => {
      cancelled = true;
    };
  };

  const handleSearch = () => {
    fetchReportData();
  };

  const handleExport = () => {
    if (reportData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    console.log('reportData:', reportData);

    const exportData: Record<string, unknown>[] = [];
    const mergeInfo: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];

    const salesGroupMap = new Map<string, { rows: ReportData[]; firstIndex: number }>();
    let rowIndex = 0;

    reportData.forEach((row) => {
      console.log('Processing row:', row.salesContractNo, row.salesRowSpan);
      
      if (!row.salesContractNo || row.salesRowSpan === 0) {
        exportData.push({
          采购合同编号: row.purchaseContractNo,
          '签订日期(采购)': row.purchaseSignDate
            ? new Date(row.purchaseSignDate).toLocaleDateString()
            : '',
          产品名称: row.productName,
          供应商名称: row.supplierName,
          '产品数量(吨)': row.purchaseQuantity,
          采购单价: row.purchaseUnitPrice?.toFixed(2) || '0.00',
          采购总价: row.purchaseTotalAmount?.toFixed(2) || '0.00',
          采购含税总价: row.purchaseTaxTotalAmount?.toFixed(2) || '0.00',
          运费: row.freight?.toFixed(2) || '0.00',
          杂费: row.miscellaneous?.toFixed(2) || '0.00',
          销售合同号: '',
          '签订日期(销售)': '',
          客户名称: '',
          产品数量销售: '',
          销售单价: '',
          销售总价: '',
          销售含税总价: '',
          客户到货时间: '',
          税额: '',
          毛利: '',
        });
        rowIndex++;
        return;
      }

      const existing = salesGroupMap.get(row.salesContractNo);
      if (existing) {
        existing.rows.push(row);
        exportData.push({
          采购合同编号: row.purchaseContractNo,
          '签订日期(采购)': row.purchaseSignDate
            ? new Date(row.purchaseSignDate).toLocaleDateString()
            : '',
          产品名称: row.productName,
          供应商名称: row.supplierName,
          '产品数量(吨)': row.purchaseQuantity,
          采购单价: row.purchaseUnitPrice?.toFixed(2) || '0.00',
          采购总价: row.purchaseTotalAmount?.toFixed(2) || '0.00',
          采购含税总价: row.purchaseTaxTotalAmount?.toFixed(2) || '0.00',
          运费: row.freight?.toFixed(2) || '0.00',
          杂费: row.miscellaneous?.toFixed(2) || '0.00',
          销售合同号: '',
          '签订日期(销售)': '',
          客户名称: '',
          产品数量销售: '',
          销售单价: '',
          销售总价: '',
          销售含税总价: '',
          客户到货时间: '',
          税额: '',
          营业利润: '',
          净利润: '',
        });
      } else {
        salesGroupMap.set(row.salesContractNo, { rows: [row], firstIndex: rowIndex });
        exportData.push({
          采购合同编号: row.purchaseContractNo,
          '签订日期(采购)': row.purchaseSignDate
            ? new Date(row.purchaseSignDate).toLocaleDateString()
            : '',
          产品名称: row.productName,
          供应商名称: row.supplierName,
          '产品数量(吨)': row.purchaseQuantity,
          采购单价: row.purchaseUnitPrice?.toFixed(2) || '0.00',
          采购总价: row.purchaseTotalAmount?.toFixed(2) || '0.00',
          采购含税总价: row.purchaseTaxTotalAmount?.toFixed(2) || '0.00',
          运费: row.freight?.toFixed(2) || '0.00',
          杂费: row.miscellaneous?.toFixed(2) || '0.00',
          销售合同号: row.salesContractNo,
          '签订日期(销售)': row.salesSignDate
            ? new Date(row.salesSignDate).toLocaleDateString()
            : '',
          客户名称: row.customerName,
          产品数量销售: row.salesQuantity,
          销售单价: row.salesUnitPrice?.toFixed(2) || '0.00',
          销售总价: row.salesTotalAmount?.toFixed(2) || '0.00',
          销售含税总价: row.salesTaxTotalAmount?.toFixed(2) || '0.00',
          客户到货时间: row.arrivalDate
            ? new Date(row.arrivalDate).toLocaleDateString()
            : '',
          税额: row.tax?.toFixed(2) || '0.00',
          营业利润: row.profit?.toFixed(2) || '0.00',
          净利润: row.netProfit?.toFixed(2) || '0.00',
        });
      }
      rowIndex++;
    });

    salesGroupMap.forEach((group) => {
      if (group.rows.length > 1) {
        const startRow = group.firstIndex;
        const endRow = startRow + group.rows.length - 1;
        for (let c = 9; c <= 18; c++) {
          mergeInfo.push({
            s: { r: startRow, c },
            e: { r: endRow, c },
          });
        }
      }
    });

    const summaryRow = {
      采购合同编号: '总计',
      '签订日期(采购)': '',
      产品名称: '',
      供应商名称: '',
      '产品数量(吨)': '',
      采购单价: '',
      采购总价: summary.totalPurchaseAmount.toFixed(2),
      采购含税总价: summary.totalPurchaseTaxAmount.toFixed(2),
      运费: summary.totalFreight.toFixed(2),
      杂费: summary.totalMiscellaneous.toFixed(2),
      销售合同号: '',
      '签订日期(销售)': '',
      客户名称: '',
      产品数量销售: '',
      销售单价: '',
      销售总价: summary.totalSalesAmount.toFixed(2),
      销售含税总价: summary.totalSalesTaxAmount.toFixed(2),
      客户到货时间: '',
      税额: summary.totalTax.toFixed(2),
      营业利润: summary.totalProfit.toFixed(2),
      净利润: summary.totalNetProfit.toFixed(2),
    };

    const ws = XLSX.utils.json_to_sheet([...exportData, summaryRow] as Record<string, unknown>[]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '数据报表');

    if (mergeInfo.length > 0) {
      ws['!merges'] = mergeInfo;
    }

    const colWidths = [
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `数据报表_${year}年${startMonth}-${endMonth}月.xlsx`);
    message.success('导出成功');
  };

  const columns = [
    {
      title: '采购合同编号',
      dataIndex: 'purchaseContractNo',
      key: 'purchaseContractNo',
      width: 150,
    },
    {
      title: '签订日期(采购)',
      dataIndex: 'purchaseSignDate',
      key: 'purchaseSignDate',
      width: 120,
      render: (date: string) => date ? new Date(date).toLocaleDateString() : '',
    },
    {
      title: '产品名称',
      dataIndex: 'productName',
      key: 'productName',
      width: 120,
    },
    {
      title: '供应商名称',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 120,
    },
    {
      title: '产品数量(吨)',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '采购单价',
      dataIndex: 'purchaseUnitPrice',
      key: 'purchaseUnitPrice',
      width: 100,
      align: 'right' as const,
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '采购总价',
      dataIndex: 'purchaseTotalAmount',
      key: 'purchaseTotalAmount',
      width: 120,
      align: 'right' as const,
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '采购含税总价',
      dataIndex: 'purchaseTaxTotalAmount',
      key: 'purchaseTaxTotalAmount',
      width: 120,
      align: 'right' as const,
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '运费',
      dataIndex: 'freight',
      key: 'freight',
      width: 80,
      align: 'right' as const,
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '杂费',
      dataIndex: 'miscellaneous',
      key: 'miscellaneous',
      width: 80,
      align: 'right' as const,
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '销售合同号',
      dataIndex: 'salesContractNo',
      key: 'salesContractNo',
      width: 120,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
    },
    {
      title: '签订日期(销售)',
      dataIndex: 'salesSignDate',
      key: 'salesSignDate',
      width: 120,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (date: string) => date ? new Date(date).toLocaleDateString() : '',
    },
    {
      title: '客户名称',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 120,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
    },
    {
      title: '产品数量(销售)',
      dataIndex: 'salesQuantity',
      key: 'salesQuantity',
      width: 100,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
    },
    {
      title: '销售单价',
      dataIndex: 'salesUnitPrice',
      key: 'salesUnitPrice',
      width: 100,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '销售总价',
      dataIndex: 'salesTotalAmount',
      key: 'salesTotalAmount',
      width: 120,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '销售含税总价',
      dataIndex: 'salesTaxTotalAmount',
      key: 'salesTaxTotalAmount',
      width: 120,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '客户到货时间',
      dataIndex: 'arrivalDate',
      key: 'arrivalDate',
      width: 130,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (date: string) => date ? new Date(date).toLocaleDateString() : '',
    },
    {
      title: '税额',
      dataIndex: 'tax',
      key: 'tax',
      width: 100,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '营业利润',
      dataIndex: 'profit',
      key: 'profit',
      width: 100,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
    {
      title: '净利润',
      dataIndex: 'netProfit',
      key: 'netProfit',
      width: 100,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (val: number) => val?.toFixed(2) || '0.00',
    },
  ];

  const summaryColumns = columns.map((col) => ({
    ...col,
    footer: (_: unknown, record?: ReportData) => {
      if (record) return undefined;
      return col.dataIndex === 'purchaseTotalAmount'
        ? summary.totalPurchaseAmount.toFixed(2)
        : col.dataIndex === 'purchaseTaxTotalAmount'
        ? summary.totalPurchaseTaxAmount.toFixed(2)
        : col.dataIndex === 'salesTotalAmount'
        ? summary.totalSalesAmount.toFixed(2)
        : col.dataIndex === 'salesTaxTotalAmount'
        ? summary.totalSalesTaxAmount.toFixed(2)
        : col.dataIndex === 'tax'
        ? summary.totalTax.toFixed(2)
        : col.dataIndex === 'freight'
        ? summary.totalFreight.toFixed(2)
        : col.dataIndex === 'miscellaneous'
        ? summary.totalMiscellaneous.toFixed(2)
        : col.dataIndex === 'profit'
        ? summary.totalProfit.toFixed(2)
        : col.dataIndex === 'netProfit'
        ? summary.totalNetProfit.toFixed(2)
        : undefined;
    },
  }));

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <span>年份:</span>
          <Select
            value={year}
            onChange={setYear}
            style={{ width: 100 }}
          >
            <Option value={currentYear}>{currentYear}年</Option>
            <Option value={currentYear - 1}>{currentYear - 1}年</Option>
            <Option value={currentYear - 2}>{currentYear - 2}年</Option>
          </Select>
          <span>月份:</span>
          <Select
            value={startMonth}
            onChange={setStartMonth}
            style={{ width: 80 }}
          >
            {monthOptions.map((m) => (
              <Option key={m.value} value={m.value}>
                {m.label}
              </Option>
            ))}
          </Select>
          <span>至</span>
          <Select
            value={endMonth}
            onChange={setEndMonth}
            style={{ width: 80 }}
          >
            {monthOptions.map((m) => (
              <Option key={m.value} value={m.value}>
                {m.label}
              </Option>
            ))}
          </Select>
          <Button type="primary" onClick={handleSearch} loading={loading}>
            查询
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={reportData.length === 0}
          >
            导出Excel
          </Button>
        </Space>
      </Card>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
          </div>
        ) : reportData.length === 0 ? (
          <Empty description="暂无数据，请选择月份范围后查询" />
        ) : (
          <Table
            dataSource={reportData}
            columns={summaryColumns}
            rowKey={(_, index) => String(index)}
            scroll={{ x: 2000 }}
            pagination={false}
            size="small"
            footer={() => (
              <div style={{ fontWeight: 'bold' }}>
                总计: 采购总价 {summary.totalPurchaseAmount.toFixed(2)} | 采购含税总价{' '}
                {summary.totalPurchaseTaxAmount.toFixed(2)} | 运费{' '}
                {summary.totalFreight.toFixed(2)} | 杂费 {summary.totalMiscellaneous.toFixed(2)} | 销售总价{' '}
                {summary.totalSalesAmount.toFixed(2)} | 销售含税总价 {summary.totalSalesTaxAmount.toFixed(2)} | 税额{' '}
                {summary.totalTax.toFixed(2)} | 营业利润{' '}
                {summary.totalProfit.toFixed(2)} | 净利润 {summary.totalNetProfit.toFixed(2)}
              </div>
            )}
          />
        )}
      </Card>
    </div>
  );
};
