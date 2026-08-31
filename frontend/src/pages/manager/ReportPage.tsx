import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Select, Space, Tag, App, Spin, Empty } from 'antd';
import { DownloadOutlined, CloseOutlined } from '@ant-design/icons';
import XLSX from 'xlsx-js-style';
import dayjs from 'dayjs';

import { handleApiError } from '@/api/helpers';
import { ReportAPI } from '@/api/report';
import { buildReportWorkbook } from '@/pages/manager/report/report-workbook';
import type { ReportData, ReportSummary } from '@/types/report';

const { Option } = Select;

const currentYear = new Date().getFullYear();

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}月`,
}));

const formatAmount = (value: number) => (Number(value) || 0).toFixed(2);

export const ReportPage: React.FC = () => {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedSalesParam = searchParams.get('selectedSales') || '';
  const selectedPurchaseParam = searchParams.get('selectedPurchase') || '';
  const urlSelectedSales = useMemo(
    () => selectedSalesParam.split(',').filter(Boolean),
    [selectedSalesParam],
  );
  const urlSelectedPurchase = useMemo(
    () => selectedPurchaseParam.split(',').filter(Boolean),
    [selectedPurchaseParam],
  );
  const urlSortField = searchParams.get('sortField') || undefined;
  const urlSortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' | null;
  const hasContractFilter = urlSelectedSales.length > 0 || urlSelectedPurchase.length > 0;

  const [startMonth, setStartMonth] = useState<number>(1);
  const [endMonth, setEndMonth] = useState<number>(12);
  const [year, setYear] = useState<number>(currentYear);
  const [loading, setLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const requestIdRef = useRef(0);
  const [summary, setSummary] = useState<ReportSummary>({
    totalSalesAmount: 0,
    totalPurchaseAmount: 0,
    totalSalesTaxAmount: 0,
    totalPurchaseTaxAmount: 0,
    totalTax: 0,
    totalFreight: 0,
    totalMiscellaneous: 0,
    totalTariff: 0,
    totalValueAddedTax: 0,
    totalProfit: 0,
    totalNetProfit: 0,
    totalRealizedProfit: 0,
  });

  const fetchReportData = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      let result;
      if (hasContractFilter) {
        result = await ReportAPI.getReportByContractIds(urlSelectedSales, urlSelectedPurchase);
      } else {
        result = await ReportAPI.getReportData({ startMonth, endMonth, year });
      }
      if (requestIdRef.current === requestId) {
        setReportData(result.data);
        setSummary(result.summary);
        setExchangeRate(result.exchangeRate);
      }
    } catch (error) {
      handleApiError(error, '加载报表失败', (content) => message.error(content), 'Fetch report');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [startMonth, endMonth, year, hasContractFilter, urlSelectedSales, urlSelectedPurchase, message]);

  useEffect(() => {
    void fetchReportData();
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchReportData]);

  const sortedReportData = useMemo(() => {
    if (!urlSortField || !reportData.length) return reportData;
    const sorted = [...reportData];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (urlSortField) {
        case 'no':
          cmp = (a.salesContractNo || '').localeCompare(b.salesContractNo || '');
          break;
        case 'shipmentDate':
          cmp = (a.arrivalDate ? dayjs(a.arrivalDate).unix() : 0) - (b.arrivalDate ? dayjs(b.arrivalDate).unix() : 0);
          break;
        case 'payDate':
          cmp = (a.purchasePaymentDate ? dayjs(a.purchasePaymentDate).unix() : 0) - (b.purchasePaymentDate ? dayjs(b.purchasePaymentDate).unix() : 0);
          break;
        case 'salesReceiveDate':
          cmp = (a.salesReceiptDate ? dayjs(a.salesReceiptDate).unix() : 0) - (b.salesReceiptDate ? dayjs(b.salesReceiptDate).unix() : 0);
          break;
        case 'salesInvoiceDate':
          cmp = (a.salesInvoiceDate ? dayjs(a.salesInvoiceDate).unix() : 0) - (b.salesInvoiceDate ? dayjs(b.salesInvoiceDate).unix() : 0);
          break;
      }
      return urlSortOrder === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [reportData, urlSortField, urlSortOrder]);

  const displayData = urlSortField ? sortedReportData : reportData;

  const handleClearFilter = () => {
    navigate('/manager/reports', { replace: true });
  };

  const handleSearch = () => {
    void fetchReportData();
  };

  const handleExport = () => {
    if (displayData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    try {
      const scopeLabel = hasContractFilter
        ? `合同筛选：${urlSelectedSales.length} 个销售合同，${urlSelectedPurchase.length} 个采购合同`
        : `${year}年${startMonth}月至${endMonth}月`;
      const workbook = buildReportWorkbook(displayData, summary, { scopeLabel, exchangeRate });
      const fileName = hasContractFilter
        ? `合同关联与利润报表_筛选${displayData.length}条.xlsx`
        : `合同关联与利润报表_${year}年${startMonth}-${endMonth}月.xlsx`;
      const bytes = XLSX.write(workbook, {
        type: 'array',
        bookType: 'xlsx',
        cellStyles: true,
        compression: true,
      });
      const downloadUrl = URL.createObjectURL(new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      message.success('Excel导出成功');
    } catch (error) {
      console.error('Export report error:', error);
      message.error('Excel导出失败，请重试');
    }
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
      title: '采购单价(CNY)',
      dataIndex: 'purchaseUnitPrice',
      key: 'purchaseUnitPrice',
      width: 100,
      align: 'right' as const,
      render: formatAmount,
    },
    {
      title: '采购总价(不含税/CNY)',
      dataIndex: 'purchaseTotalAmount',
      key: 'purchaseTotalAmount',
      width: 120,
      align: 'right' as const,
      render: formatAmount,
    },
    {
      title: '采购含税总价(CNY)',
      dataIndex: 'purchaseTaxTotalAmount',
      key: 'purchaseTaxTotalAmount',
      width: 120,
      align: 'right' as const,
      render: formatAmount,
    },
    {
      title: '采购付款日期',
      dataIndex: 'purchasePaymentDate',
      key: 'purchasePaymentDate',
      width: 120,
      render: (date: string) => date ? new Date(date).toLocaleDateString() : '',
    },
    {
      title: '采购收票日期',
      dataIndex: 'purchaseInvoiceDate',
      key: 'purchaseInvoiceDate',
      width: 120,
      render: (date: string) => date ? new Date(date).toLocaleDateString() : '',
    },
    {
      title: '运费',
      dataIndex: 'freight',
      key: 'freight',
      width: 80,
      align: 'right' as const,
      render: formatAmount,
    },
    {
      title: '杂费',
      dataIndex: 'miscellaneous',
      key: 'miscellaneous',
      width: 80,
      align: 'right' as const,
      render: formatAmount,
    },
    {
      title: '关税',
      dataIndex: 'tariff',
      key: 'tariff',
      width: 80,
      align: 'right' as const,
      render: formatAmount,
    },
    {
      title: '增值税',
      dataIndex: 'valueAddedTax',
      key: 'valueAddedTax',
      width: 90,
      align: 'right' as const,
      render: formatAmount,
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
      title: '销售单价(CNY)',
      dataIndex: 'salesUnitPrice',
      key: 'salesUnitPrice',
      width: 100,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: formatAmount,
    },
    {
      title: '销售总价(不含税/CNY)',
      dataIndex: 'salesTotalAmount',
      key: 'salesTotalAmount',
      width: 120,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: formatAmount,
    },
    {
      title: '销售含税总价(CNY)',
      dataIndex: 'salesTaxTotalAmount',
      key: 'salesTaxTotalAmount',
      width: 120,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: formatAmount,
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
      title: '销售收款日期',
      dataIndex: 'salesReceiptDate',
      key: 'salesReceiptDate',
      width: 120,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: (date: string) => date ? new Date(date).toLocaleDateString() : '',
    },
    {
      title: '销售开票日期',
      dataIndex: 'salesInvoiceDate',
      key: 'salesInvoiceDate',
      width: 120,
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
      render: formatAmount,
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
      render: formatAmount,
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
      render: formatAmount,
    },
    {
      title: '已执行利润',
      dataIndex: 'realizedProfit',
      key: 'realizedProfit',
      width: 100,
      align: 'right' as const,
      onCell: (record: ReportData) => ({
        rowSpan: record.salesRowSpan,
      }),
      render: formatAmount,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          {!hasContractFilter && (
            <>
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
            </>
          )}
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={displayData.length === 0}
          >
            导出Excel
          </Button>
          {hasContractFilter && (
            <Button
              icon={<CloseOutlined />}
              onClick={handleClearFilter}
            >
              清除筛选
            </Button>
          )}
        </Space>
        {hasContractFilter && (
          <div style={{ marginTop: 8 }}>
            <Tag color="blue" style={{ marginRight: 4 }}>
              已筛选: {urlSelectedSales.length} 个销售合同, {urlSelectedPurchase.length} 个采购合同
            </Tag>
          </div>
        )}
      </Card>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
          </div>
        ) : displayData.length === 0 ? (
          <Empty description="暂无数据，请选择月份范围后查询" />
        ) : (
          <Table
            dataSource={displayData}
            columns={columns}
            rowKey={(record) => `${record.salesContractId || 'no-sales'}:${record.purchaseContractId || 'no-purchase'}`}
            scroll={{ x: 2900 }}
            pagination={false}
            size="small"
            footer={() => (
              <div style={{ fontWeight: 'bold' }}>
                总计: 采购总价(不含税) {formatAmount(summary.totalPurchaseAmount)} | 采购含税总价{' '}
                {formatAmount(summary.totalPurchaseTaxAmount)} | 运费 {formatAmount(summary.totalFreight)} | 杂费{' '}
                {formatAmount(summary.totalMiscellaneous)} | 关税 {formatAmount(summary.totalTariff)} | 增值税{' '}
                {formatAmount(summary.totalValueAddedTax)} | 销售总价(不含税) {formatAmount(summary.totalSalesAmount)} | 销售含税总价{' '}
                {formatAmount(summary.totalSalesTaxAmount)} | 税额 {formatAmount(summary.totalTax)} | 营业利润{' '}
                {formatAmount(summary.totalProfit)} | 净利润 {formatAmount(summary.totalNetProfit)} | 已执行利润{' '}
                {formatAmount(summary.totalRealizedProfit)}
              </div>
            )}
          />
        )}
      </Card>
    </div>
  );
};
