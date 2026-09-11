import XLSX from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';

import type { ReportData, ReportSummary } from '@/types/report';

type CellValue = string | number;
type ColumnKind = 'text' | 'date' | 'number' | 'money' | 'percent';

interface ExportColumn { header: string; width: number; kind?: ColumnKind }
interface SheetRow { values: CellValue[]; total?: boolean }
interface MergeGroup { start: number; count: number; columns: number[] }
export interface ReportWorkbookOptions { scopeLabel: string; exchangeRate: number; generatedAt?: Date }

const BORDER_COLOR = { rgb: 'FFD9E2F3' };
const HEADER_STYLE: CellStyle = {
  font: { bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: BORDER_COLOR }, right: { style: 'thin', color: BORDER_COLOR },
    bottom: { style: 'thin', color: BORDER_COLOR }, left: { style: 'thin', color: BORDER_COLOR },
  },
};
const BODY_STYLE: CellStyle = {
  alignment: { vertical: 'center', wrapText: true },
  border: HEADER_STYLE.border,
};
const TOTAL_STYLE: CellStyle = { ...BODY_STYLE, font: { bold: true }, fill: { fgColor: { rgb: 'FFFFE699' } } };

const asNumber = (value: number) => Number.isFinite(value) ? value : 0;
const asPercent = (value: number) => asNumber(value) / 100;
const dateLabel = (value: string) => value ? value.slice(0, 10) : '';

const cellStyle = (column: ExportColumn, total: boolean): CellStyle => {
  const base = total ? TOTAL_STYLE : BODY_STYLE;
  const numeric = ['number', 'money', 'percent'].includes(column.kind || '');
  const numFmt = column.kind === 'percent' ? '0.00%'
    : column.kind === 'money' ? '#,##0.00'
      : column.kind === 'number' ? '#,##0.00' : undefined;
  return { ...base, alignment: { ...base.alignment, horizontal: numeric ? 'right' : 'left' }, numFmt };
};

const createSheet = (columns: ExportColumn[], rows: SheetRow[], merges: MergeGroup[] = []): WorkSheet => {
  const sheet = XLSX.utils.aoa_to_sheet([columns.map((column) => column.header), ...rows.map((row) => row.values)]);
  sheet['!cols'] = columns.map((column) => ({ wch: column.width }));
  sheet['!rows'] = [{ hpt: 30 }, ...rows.map(() => ({ hpt: 22 }))];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
  columns.forEach((column, columnIndex) => {
    const header = sheet[XLSX.utils.encode_cell({ r: 0, c: columnIndex })] as CellObject | undefined;
    if (header) header.s = HEADER_STYLE;
    rows.forEach((row, rowIndex) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex })] as CellObject | undefined;
      if (cell) cell.s = cellStyle(column, Boolean(row.total));
    });
  });
  const ranges: Range[] = [];
  merges.forEach((group) => {
    if (group.count < 2) return;
    group.columns.forEach((column) => ranges.push({
      s: { r: group.start + 1, c: column },
      e: { r: group.start + group.count, c: column },
    }));
  });
  if (ranges.length) sheet['!merges'] = ranges;
  return sheet;
};

const dealColumns: ExportColumn[] = [
  { header: '总体交易', width: 34 },
  { header: '交易日期', width: 13, kind: 'date' },
  { header: '利润税率', width: 12, kind: 'percent' },
  { header: '销售合同号', width: 18 },
  { header: '销售签订日期', width: 13, kind: 'date' },
  { header: '客户名称', width: 20 },
  { header: '销售产品', width: 18 },
  { header: '销售数量', width: 12, kind: 'number' },
  { header: '销售金额（不含税/CNY）', width: 20, kind: 'money' },
  { header: '销售金额（含税/CNY）', width: 20, kind: 'money' },
  { header: '销售开票进度', width: 14, kind: 'percent' },
  { header: '销售收款进度', width: 14, kind: 'percent' },
  { header: '采购合同号', width: 18 },
  { header: '采购签订日期', width: 13, kind: 'date' },
  { header: '供应商名称', width: 20 },
  { header: '采购产品', width: 18 },
  { header: '采购数量', width: 12, kind: 'number' },
  { header: '采购金额（不含税/CNY）', width: 20, kind: 'money' },
  { header: '采购金额（含税/CNY）', width: 20, kind: 'money' },
  { header: '采购收票进度', width: 14, kind: 'percent' },
  { header: '采购付款进度', width: 14, kind: 'percent' },
  { header: '运费（CNY）', width: 14, kind: 'money' },
  { header: '杂费（CNY）', width: 14, kind: 'money' },
  { header: '关税（CNY）', width: 14, kind: 'money' },
  { header: '增值税（CNY）', width: 14, kind: 'money' },
  { header: '营业利润（CNY）', width: 16, kind: 'money' },
  { header: '税额（CNY）', width: 14, kind: 'money' },
  { header: '净利润（CNY）', width: 16, kind: 'money' },
  { header: '已执行利润（CNY）', width: 17, kind: 'money' },
];

const dealValues = (row: ReportData, anchor: ReportData): CellValue[] => [
  row.businessDealName,
  dateLabel(row.businessDealDate),
  asPercent(row.taxRate * 100),
  row.salesContractNo,
  dateLabel(row.salesSignDate),
  row.customerName,
  row.salesProductName,
  asNumber(row.salesQuantity),
  asNumber(row.salesTotalAmount),
  asNumber(row.salesTaxTotalAmount),
  asPercent(row.salesInvoiceProgress),
  asPercent(row.salesReceiptProgress),
  row.purchaseContractNo,
  dateLabel(row.purchaseSignDate),
  row.supplierName,
  row.purchaseProductName,
  asNumber(row.purchaseQuantity),
  asNumber(row.purchaseTotalAmount),
  asNumber(row.purchaseTaxTotalAmount),
  asPercent(row.purchaseInvoiceProgress),
  asPercent(row.purchasePaymentProgress),
  asNumber(row.freight),
  asNumber(row.miscellaneous),
  asNumber(row.tariff),
  asNumber(row.valueAddedTax),
  asNumber(anchor.profit),
  asNumber(anchor.tax),
  asNumber(anchor.netProfit),
  asNumber(anchor.realizedProfit),
];

const independentColumns: ExportColumn[] = [
  { header: '合同类型', width: 12 }, { header: '合同编号', width: 18 },
  { header: '签订日期', width: 13, kind: 'date' }, { header: '客户/供应商', width: 22 },
  { header: '产品名称', width: 18 }, { header: '数量', width: 12, kind: 'number' },
  { header: '单价（CNY）', width: 15, kind: 'money' }, { header: '金额（不含税/CNY）', width: 20, kind: 'money' },
  { header: '金额（含税/CNY）', width: 20, kind: 'money' }, { header: '开票/收票进度', width: 16, kind: 'percent' },
  { header: '收款/付款进度', width: 16, kind: 'percent' }, { header: '最近开票/收票日期', width: 18, kind: 'date' },
  { header: '最近收款/付款日期', width: 18, kind: 'date' },
];

const uniqueBy = (rows: ReportData[], keyOf: (row: ReportData) => string) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyOf(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildReportWorkbook = (
  reportData: ReportData[],
  summary: ReportSummary,
  options: ReportWorkbookOptions,
): WorkBook => {
  const linked = reportData.filter((row) => row.businessDealId);
  const dealGroups = new Map<string, ReportData[]>();
  linked.forEach((row) => dealGroups.set(row.businessDealId, [...(dealGroups.get(row.businessDealId) || []), row]));
  const dealRows: SheetRow[] = [];
  const merges: MergeGroup[] = [];
  dealGroups.forEach((rows) => {
    const anchor = rows.find((row) => row.profit || row.tax || row.netProfit || row.realizedProfit) || rows[0];
    const start = dealRows.length;
    rows.forEach((row) => dealRows.push({ values: dealValues(row, anchor) }));
    merges.push({ start, count: rows.length, columns: [0, 1, 2, 25, 26, 27, 28] });
  });

  const salesListColumns: ExportColumn[] = [
    { header: '总体交易', width: 34 }, ...dealColumns.slice(3, 12),
    { header: '交易净利润（CNY）', width: 18, kind: 'money' },
  ];
  const salesRows: SheetRow[] = uniqueBy(linked, (row) => row.salesContractId).map((row) => {
    const anchor = dealGroups.get(row.businessDealId)?.[0] || row;
    return { values: [row.businessDealName, ...dealValues(row, anchor).slice(3, 12), asNumber(dealGroups.get(row.businessDealId)?.reduce((sum, item) => sum + item.netProfit, 0) || 0)] };
  });
  const purchaseListColumns: ExportColumn[] = [
    { header: '总体交易', width: 34 }, ...dealColumns.slice(12, 25),
    { header: '交易净利润（CNY）', width: 18, kind: 'money' },
  ];
  const purchaseRows: SheetRow[] = uniqueBy(linked, (row) => row.purchaseContractId).map((row) => ({
    values: [row.businessDealName, ...dealValues(row, row).slice(12, 25), asNumber(dealGroups.get(row.businessDealId)?.reduce((sum, item) => sum + item.netProfit, 0) || 0)],
  }));

  const independent = reportData.filter((row) => !row.businessDealId);
  const independentRows: SheetRow[] = independent.map((row) => {
    const isSales = Boolean(row.salesContractId);
    return { values: isSales ? [
      '销售合同', row.salesContractNo, dateLabel(row.salesSignDate), row.customerName, row.salesProductName,
      asNumber(row.salesQuantity), asNumber(row.salesUnitPrice), asNumber(row.salesTotalAmount), asNumber(row.salesTaxTotalAmount),
      asPercent(row.salesInvoiceProgress), asPercent(row.salesReceiptProgress), dateLabel(row.salesInvoiceDate), dateLabel(row.salesReceiptDate),
    ] : [
      '采购合同', row.purchaseContractNo, dateLabel(row.purchaseSignDate), row.supplierName, row.purchaseProductName,
      asNumber(row.purchaseQuantity), asNumber(row.purchaseUnitPrice), asNumber(row.purchaseTotalAmount), asNumber(row.purchaseTaxTotalAmount),
      asPercent(row.purchaseInvoiceProgress), asPercent(row.purchasePaymentProgress), dateLabel(row.purchaseInvoiceDate), dateLabel(row.purchasePaymentDate),
    ] };
  });

  const statisticsRows: SheetRow[] = [
    { values: ['导出范围', options.scopeLabel] },
    { values: ['导出时间', (options.generatedAt || new Date()).toLocaleString('zh-CN')] },
    { values: ['金额币种', '人民币（CNY）；跨境合同按导出时系统汇率折算'] },
    { values: ['美元兑人民币汇率', asNumber(options.exchangeRate)] },
    { values: ['总体交易数', dealGroups.size] },
    { values: ['关联销售合同数', uniqueBy(linked, (row) => row.salesContractId).length] },
    { values: ['关联采购合同数', uniqueBy(linked, (row) => row.purchaseContractId).length] },
    { values: ['独立合同数', independent.length] },
    { values: ['范围销售含税金额（CNY）', asNumber(summary.totalSalesTaxAmount)] },
    { values: ['范围采购含税金额（CNY）', asNumber(summary.totalPurchaseTaxAmount)] },
    { values: ['范围总体交易净利润（CNY）', asNumber(summary.totalNetProfit)] },
    { values: ['关系口径', '同一总体交易中的销售与采购合同平级；支持一对一、一对多、多对一和多对多'] },
    { values: ['利润口径', '每笔总体交易只计算一次，不向单份销售合同分摊采购成本'] },
    { values: ['税额', '（总体交易销售含税金额－总体交易采购含税金额）× 该交易保存的税率快照'] },
    { values: ['未关联合同利润', '不计算；建立总体交易后才进入利润核算'] },
  ];

  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: '总体交易与利润报表', Subject: options.scopeLabel, Author: 'ERP系统', CreatedDate: options.generatedAt || new Date() };
  XLSX.utils.book_append_sheet(workbook, createSheet(dealColumns, dealRows, merges), '总体交易明细');
  XLSX.utils.book_append_sheet(workbook, createSheet(salesListColumns, salesRows), '销售合同清单');
  XLSX.utils.book_append_sheet(workbook, createSheet(purchaseListColumns, purchaseRows), '采购合同清单');
  XLSX.utils.book_append_sheet(workbook, createSheet(independentColumns, independentRows), '独立合同');
  XLSX.utils.book_append_sheet(workbook, createSheet([{ header: '项目', width: 24 }, { header: '说明', width: 78 }], statisticsRows), '统计口径');
  return workbook;
};
