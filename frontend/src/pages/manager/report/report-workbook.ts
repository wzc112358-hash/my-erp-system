import XLSX from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';

import type { ReportData, ReportSummary } from '@/types/report';

type CellValue = string | number;
type ColumnKind = 'text' | 'date' | 'number' | 'money' | 'percent';

interface ExportColumn {
  header: string;
  width: number;
  kind?: ColumnKind;
}

interface SheetRow {
  values: CellValue[];
  total?: boolean;
}

interface SheetOptions {
  mergeGroups?: number[];
  mergeColumnCount?: number;
}

export interface ReportWorkbookOptions {
  scopeLabel: string;
  exchangeRate: number;
  generatedAt?: Date;
}

const BORDER_COLOR = { rgb: 'FFD9E2F3' };
const HEADER_STYLE: CellStyle = {
  font: { bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: BORDER_COLOR },
    right: { style: 'thin', color: BORDER_COLOR },
    bottom: { style: 'thin', color: BORDER_COLOR },
    left: { style: 'thin', color: BORDER_COLOR },
  },
};

const BODY_STYLE: CellStyle = {
  alignment: { vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: BORDER_COLOR },
    right: { style: 'thin', color: BORDER_COLOR },
    bottom: { style: 'thin', color: BORDER_COLOR },
    left: { style: 'thin', color: BORDER_COLOR },
  },
};

const TOTAL_STYLE: CellStyle = {
  ...BODY_STYLE,
  font: { bold: true },
  fill: { fgColor: { rgb: 'FFFFE699' } },
};

const asNumber = (value: number) => Number.isFinite(value) ? value : 0;
const asPercent = (value: number) => asNumber(value) / 100;
const dateLabel = (value: string) => value ? value.slice(0, 10) : '';

const cellStyle = (column: ExportColumn, total: boolean): CellStyle => {
  const base = total ? TOTAL_STYLE : BODY_STYLE;
  const isNumeric = column.kind === 'number' || column.kind === 'money' || column.kind === 'percent';
  const numFmt = column.kind === 'percent'
    ? '0.00%'
    : column.kind === 'money'
      ? '#,##0.00'
      : column.kind === 'number'
        ? '#,##0.00'
        : undefined;
  return {
    ...base,
    alignment: {
      ...base.alignment,
      horizontal: isNumeric ? 'right' : 'left',
    },
    numFmt,
  };
};

const createSheet = (
  columns: ExportColumn[],
  rows: SheetRow[],
  options: SheetOptions = {},
): WorkSheet => {
  const sheet = XLSX.utils.aoa_to_sheet([
    columns.map((column) => column.header),
    ...rows.map((row) => row.values),
  ]);
  sheet['!cols'] = columns.map((column) => ({ wch: column.width }));
  sheet['!rows'] = [{ hpt: 30 }, ...rows.map(() => ({ hpt: 22 }))];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };

  columns.forEach((_, columnIndex) => {
    const headerAddress = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    const headerCell = sheet[headerAddress] as CellObject | undefined;
    if (headerCell) headerCell.s = HEADER_STYLE;
  });

  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
      const cell = sheet[address] as CellObject | undefined;
      if (cell) cell.s = cellStyle(column, Boolean(row.total));
    });
  });

  if (options.mergeGroups && options.mergeColumnCount) {
    const merges: Range[] = [];
    let dataRow = 1;
    options.mergeGroups.forEach((rowCount) => {
      if (rowCount > 1) {
        for (let column = 0; column < options.mergeColumnCount!; column += 1) {
          merges.push({
            s: { r: dataRow, c: column },
            e: { r: dataRow + rowCount - 1, c: column },
          });
          const address = XLSX.utils.encode_cell({ r: dataRow, c: column });
          const cell = sheet[address] as CellObject | undefined;
          if (cell) {
            cell.s = {
              ...cell.s,
              alignment: { ...cell.s?.alignment, vertical: 'center' },
            };
          }
        }
      }
      dataRow += rowCount;
    });
    sheet['!merges'] = merges;
  }

  return sheet;
};

interface SalesGroup {
  anchor: ReportData;
  rows: ReportData[];
}

const groupSalesRows = (rows: ReportData[]): SalesGroup[] => {
  const groups = new Map<string, SalesGroup>();
  rows.filter((row) => row.salesContractId).forEach((row) => {
    const existing = groups.get(row.salesContractId);
    if (!existing) {
      groups.set(row.salesContractId, { anchor: row, rows: [row] });
      return;
    }
    existing.rows.push(row);
    if (row.salesRowSpan > 0) existing.anchor = row;
  });
  return Array.from(groups.values());
};

interface PurchaseGroup {
  anchor: ReportData;
  rows: ReportData[];
}

const groupPurchaseRows = (rows: ReportData[]): PurchaseGroup[] => {
  const groups = new Map<string, PurchaseGroup>();
  rows.filter((row) => row.purchaseContractId && row.salesContractId).forEach((row) => {
    const existing = groups.get(row.purchaseContractId);
    if (existing) existing.rows.push(row);
    else groups.set(row.purchaseContractId, { anchor: row, rows: [row] });
  });
  return Array.from(groups.values());
};

const relationColumns: ExportColumn[] = [
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
  { header: '采购成本分摊比例', width: 17, kind: 'percent' },
  { header: '分摊采购含税成本（CNY）', width: 23, kind: 'money' },
  { header: '营业利润（CNY）', width: 16, kind: 'money' },
  { header: '税额（CNY）', width: 14, kind: 'money' },
  { header: '净利润（CNY）', width: 16, kind: 'money' },
  { header: '已执行利润（CNY）', width: 17, kind: 'money' },
];

const relationValues = (row: ReportData, anchor: ReportData): CellValue[] => [
  row.salesContractNo,
  dateLabel(row.salesSignDate),
  row.customerName,
  row.salesProductName,
  asNumber(row.salesQuantity),
  asNumber(row.salesTotalAmount),
  asNumber(anchor.salesTaxTotalAmount),
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
  asPercent(row.purchaseAllocationRatio * 100),
  asNumber(row.allocatedPurchaseTaxAmount),
  asNumber(anchor.profit),
  asNumber(anchor.tax),
  asNumber(anchor.netProfit),
  asNumber(anchor.realizedProfit),
];

const salesSummaryColumns: ExportColumn[] = [
  ...relationColumns.slice(0, 9),
  { header: '营业利润（CNY）', width: 16, kind: 'money' },
  { header: '税额（CNY）', width: 14, kind: 'money' },
  { header: '净利润（CNY）', width: 16, kind: 'money' },
  { header: '已执行利润（CNY）', width: 17, kind: 'money' },
  ...relationColumns.slice(9, 24),
];

const salesSummaryValues = (row: ReportData, anchor: ReportData): CellValue[] => [
  ...relationValues(row, anchor).slice(0, 9),
  asNumber(anchor.profit),
  asNumber(anchor.tax),
  asNumber(anchor.netProfit),
  asNumber(anchor.realizedProfit),
  ...relationValues(row, anchor).slice(9, 24),
];

const purchaseSummaryColumns: ExportColumn[] = [
  ...relationColumns.slice(9, 22),
  ...relationColumns.slice(0, 9),
  ...relationColumns.slice(22, 24),
  { header: '销售合同净利润（CNY）', width: 20, kind: 'money' },
];

const purchaseSummaryValues = (row: ReportData, anchor: ReportData): CellValue[] => [
  ...relationValues(row, anchor).slice(9, 22),
  ...relationValues(row, anchor).slice(0, 9),
  ...relationValues(row, anchor).slice(22, 24),
  asNumber(anchor.netProfit),
];

const unlinkedColumns: ExportColumn[] = [
  { header: '合同类型', width: 12 },
  { header: '合同编号', width: 18 },
  { header: '签订日期', width: 13, kind: 'date' },
  { header: '客户/供应商', width: 22 },
  { header: '产品名称', width: 18 },
  { header: '数量', width: 12, kind: 'number' },
  { header: '单价（CNY）', width: 15, kind: 'money' },
  { header: '金额（不含税/CNY）', width: 20, kind: 'money' },
  { header: '金额（含税/CNY）', width: 20, kind: 'money' },
  { header: '开票/收票进度', width: 16, kind: 'percent' },
  { header: '收款/付款进度', width: 16, kind: 'percent' },
  { header: '最近开票/收票日期', width: 18, kind: 'date' },
  { header: '最近收款/付款日期', width: 18, kind: 'date' },
];

const totalsRow = (summary: ReportSummary): SheetRow => ({
  total: true,
  values: [
    '总计', '', '', '', '',
    asNumber(summary.totalSalesAmount),
    asNumber(summary.totalSalesTaxAmount),
    '', '', '', '', '', '', '',
    asNumber(summary.totalPurchaseAmount),
    asNumber(summary.totalPurchaseTaxAmount),
    '', '',
    asNumber(summary.totalFreight),
    asNumber(summary.totalMiscellaneous),
    asNumber(summary.totalTariff),
    asNumber(summary.totalValueAddedTax),
    '',
    '',
    asNumber(summary.totalProfit),
    asNumber(summary.totalTax),
    asNumber(summary.totalNetProfit),
    asNumber(summary.totalRealizedProfit),
  ],
});

const salesTotalsRow = (summary: ReportSummary): SheetRow => ({
  total: true,
  values: [
    '总计', '', '', '', '',
    asNumber(summary.totalSalesAmount),
    asNumber(summary.totalSalesTaxAmount),
    '', '',
    asNumber(summary.totalProfit),
    asNumber(summary.totalTax),
    asNumber(summary.totalNetProfit),
    asNumber(summary.totalRealizedProfit),
    '', '', '', '', '',
    asNumber(summary.totalPurchaseAmount),
    asNumber(summary.totalPurchaseTaxAmount),
    '', '',
    asNumber(summary.totalFreight),
    asNumber(summary.totalMiscellaneous),
    asNumber(summary.totalTariff),
    asNumber(summary.totalValueAddedTax),
    '',
    '',
  ],
});

const purchaseTotalsRow = (summary: ReportSummary): SheetRow => ({
  total: true,
  values: [
    '总计', '', '', '', '',
    asNumber(summary.totalPurchaseAmount),
    asNumber(summary.totalPurchaseTaxAmount),
    '', '',
    asNumber(summary.totalFreight),
    asNumber(summary.totalMiscellaneous),
    asNumber(summary.totalTariff),
    asNumber(summary.totalValueAddedTax),
    '', '', '', '', '',
    asNumber(summary.totalSalesAmount),
    asNumber(summary.totalSalesTaxAmount),
    '', '',
    '', '',
    asNumber(summary.totalNetProfit),
  ],
});

const summarizeLinkedGroups = (groups: SalesGroup[]): ReportSummary => {
  const result: ReportSummary = {
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
  };
  const purchaseIds = new Set<string>();
  groups.forEach((group) => {
    result.totalSalesAmount += group.anchor.salesTotalAmount;
    result.totalSalesTaxAmount += group.anchor.salesTaxTotalAmount;
    result.totalTax += group.anchor.tax;
    result.totalProfit += group.anchor.profit;
    result.totalNetProfit += group.anchor.netProfit;
    result.totalRealizedProfit += group.anchor.realizedProfit;
    group.rows.forEach((row) => {
      if (!row.purchaseContractId || purchaseIds.has(row.purchaseContractId)) return;
      purchaseIds.add(row.purchaseContractId);
      result.totalPurchaseAmount += row.purchaseTotalAmount;
      result.totalPurchaseTaxAmount += row.purchaseTaxTotalAmount;
      result.totalFreight += row.freight;
      result.totalMiscellaneous += row.miscellaneous;
      result.totalTariff += row.tariff;
      result.totalValueAddedTax += row.valueAddedTax;
    });
  });
  return result;
};

export const buildReportWorkbook = (
  reportData: ReportData[],
  summary: ReportSummary,
  options: ReportWorkbookOptions,
): WorkBook => {
  const salesGroups = groupSalesRows(reportData);
  const linkedSalesGroups = salesGroups.filter((group) => group.rows.some((row) => row.purchaseContractId));
  const purchaseGroups = groupPurchaseRows(reportData);
  const linkedSummary = summarizeLinkedGroups(linkedSalesGroups);
  const linkedRows = linkedSalesGroups.flatMap((group) => (
    group.rows.filter((row) => row.purchaseContractId).map((row) => ({ row, anchor: group.anchor }))
  ));

  const relationRows: SheetRow[] = linkedRows.map(({ row, anchor }) => ({
    values: relationValues(row, anchor),
  }));
  relationRows.push(totalsRow(linkedSummary));

  const salesSummaryRows: SheetRow[] = linkedSalesGroups.flatMap((group) => (
    group.rows.map((row) => ({ values: salesSummaryValues(row, group.anchor) }))
  ));
  salesSummaryRows.push(salesTotalsRow(linkedSummary));
  const purchaseSummaryRows: SheetRow[] = purchaseGroups.flatMap((group) => (
    group.rows.map((row) => ({ values: purchaseSummaryValues(row, group.anchor) }))
  ));
  purchaseSummaryRows.push(purchaseTotalsRow(linkedSummary));

  const unlinkedRows = reportData.filter((row) => !row.salesContractId || !row.purchaseContractId);
  const unlinkedSheetRows: SheetRow[] = unlinkedRows.map((row) => {
    const isSales = Boolean(row.salesContractId);
    return {
      values: isSales
        ? [
          '销售合同', row.salesContractNo, dateLabel(row.salesSignDate), row.customerName,
          row.salesProductName, asNumber(row.salesQuantity), asNumber(row.salesUnitPrice),
          asNumber(row.salesTotalAmount), asNumber(row.salesTaxTotalAmount),
          asPercent(row.salesInvoiceProgress), asPercent(row.salesReceiptProgress),
          dateLabel(row.salesInvoiceDate), dateLabel(row.salesReceiptDate),
        ]
        : [
          '采购合同', row.purchaseContractNo, dateLabel(row.purchaseSignDate), row.supplierName,
          row.purchaseProductName, asNumber(row.purchaseQuantity), asNumber(row.purchaseUnitPrice),
          asNumber(row.purchaseTotalAmount), asNumber(row.purchaseTaxTotalAmount),
          asPercent(row.purchaseInvoiceProgress), asPercent(row.purchasePaymentProgress),
          dateLabel(row.purchaseInvoiceDate), dateLabel(row.purchasePaymentDate),
        ],
    };
  });

  const linkedSalesCount = linkedSalesGroups.length;
  const linkedPurchaseCount = new Set(linkedRows.map(({ row }) => row.purchaseContractId)).size;
  const statisticsRows: SheetRow[] = [
    { values: ['导出范围', options.scopeLabel] },
    { values: ['导出时间', (options.generatedAt || new Date()).toLocaleString('zh-CN')] },
    { values: ['金额币种', '人民币（CNY）；跨境合同按导出时系统汇率折算'] },
    { values: ['美元兑人民币汇率', asNumber(options.exchangeRate)] },
    { values: ['关联销售合同数', linkedSalesCount] },
    { values: ['关联采购合同数', linkedPurchaseCount] },
    { values: ['关联关系数', linkedRows.length] },
    { values: ['未关联销售合同数', unlinkedRows.filter((row) => row.salesContractId).length] },
    { values: ['未关联采购合同数', unlinkedRows.filter((row) => row.purchaseContractId).length] },
    { values: ['范围销售含税金额（CNY）', asNumber(summary.totalSalesTaxAmount)] },
    { values: ['范围采购含税金额（CNY）', asNumber(summary.totalPurchaseTaxAmount)] },
    { values: ['范围关联合同净利润（CNY）', asNumber(summary.totalNetProfit)] },
    { values: ['关联合同明细', '一条销售—采购关联占一行，不合并单元格，便于筛选、排序和透视分析'] },
    { values: ['销售利润汇总', '同一销售合同的销售信息和利润纵向合并，对齐其每一份采购合同'] },
    { values: ['采购去向汇总', '按采购合同反向查看全部销售去向；同一采购对应多份销售时，采购单元格纵向合并并与各销售对齐'] },
    { values: ['共享采购成本', '一份采购关联多份销售时，采购金额和到货费用按各销售合同数量占比分摊；关联销售数量均为 0 时按合同数平均分摊'] },
    { values: ['营业利润', '销售不含税金额－采购不含税金额－运费－杂费－关税－增值税'] },
    { values: ['税额', '（销售含税金额－采购含税金额）× 18.81%'] },
    { values: ['净利润', '销售含税金额－采购含税金额－税额－运费－杂费－关税－增值税'] },
    { values: ['未关联合同利润', '不计算；合同建立关联后才进入利润核算'] },
  ];

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: '合同关联与利润报表',
    Subject: options.scopeLabel,
    Author: 'ERP系统',
    CreatedDate: options.generatedAt || new Date(),
  };
  XLSX.utils.book_append_sheet(workbook, createSheet(relationColumns, relationRows), '关联合同明细');
  XLSX.utils.book_append_sheet(workbook, createSheet(
    salesSummaryColumns,
    salesSummaryRows,
    { mergeGroups: linkedSalesGroups.map((group) => group.rows.length), mergeColumnCount: 13 },
  ), '销售利润汇总');
  XLSX.utils.book_append_sheet(workbook, createSheet(
    purchaseSummaryColumns,
    purchaseSummaryRows,
    { mergeGroups: purchaseGroups.map((group) => group.rows.length), mergeColumnCount: 13 },
  ), '采购去向汇总');
  XLSX.utils.book_append_sheet(workbook, createSheet(unlinkedColumns, unlinkedSheetRows), '未关联合同');
  XLSX.utils.book_append_sheet(workbook, createSheet(
    [{ header: '项目', width: 22 }, { header: '说明', width: 72 }],
    statisticsRows,
  ), '统计口径');
  return workbook;
};
