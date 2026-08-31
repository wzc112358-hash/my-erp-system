import assert from 'node:assert/strict';
import test from 'node:test';

import XLSX from 'xlsx-js-style';

import type { ReportData, ReportSummary } from '../../../types/report.ts';
import { buildReportWorkbook } from './report-workbook.ts';

const reportRow = (values: Partial<ReportData> = {}): ReportData => ({
  purchaseContractId: 'purchase-1',
  purchaseContractNo: 'P-001',
  purchaseSignDate: '2026-08-02 00:00:00.000Z',
  purchaseProductName: '采购产品',
  productName: '采购产品',
  supplierName: '供应商',
  purchaseQuantity: 5,
  purchaseUnitPrice: 60,
  purchaseTotalAmount: 300,
  purchaseTaxTotalAmount: 339,
  purchasePaymentDate: '2026-08-20 00:00:00.000Z',
  purchaseInvoiceDate: '2026-08-18 00:00:00.000Z',
  purchasePaymentProgress: 25,
  purchaseInvoiceProgress: 75,
  salesContractId: 'sales-1',
  salesContractNo: 'S-001',
  salesSignDate: '2026-08-01 00:00:00.000Z',
  salesProductName: '销售产品',
  customerName: '客户',
  salesQuantity: 10,
  salesUnitPrice: 100,
  salesTotalAmount: 1_000,
  salesTaxTotalAmount: 1_130,
  salesReceiptProgress: 50,
  salesInvoiceProgress: 80,
  freight: 10,
  miscellaneous: 5,
  tariff: 2,
  valueAddedTax: 1,
  purchaseAllocationRatio: 1,
  allocatedPurchaseTaxAmount: 339,
  arrivalDate: '2026-08-12 00:00:00.000Z',
  salesReceiptDate: '2026-08-16 00:00:00.000Z',
  salesInvoiceDate: '2026-08-15 00:00:00.000Z',
  tax: 100,
  profit: 382,
  netProfit: 282,
  realizedProfit: 120,
  salesRowSpan: 2,
  purchaseRowSpan: 1,
  isSalesRow: false,
  ...values,
});

const summary: ReportSummary = {
  totalSalesAmount: 1_200,
  totalPurchaseAmount: 700,
  totalSalesTaxAmount: 1_356,
  totalPurchaseTaxAmount: 791,
  totalTax: 100,
  totalFreight: 20,
  totalMiscellaneous: 10,
  totalTariff: 3,
  totalValueAddedTax: 2,
  totalProfit: 382,
  totalNetProfit: 282,
  totalRealizedProfit: 120,
};

test('builds five focused sheets and merges one sales contract across its purchases', () => {
  const rows = [
    reportRow(),
    reportRow({
      purchaseContractId: 'purchase-2',
      purchaseContractNo: 'P-002',
      purchaseTotalAmount: 400,
      purchaseTaxTotalAmount: 452,
      salesRowSpan: 0,
      tax: 0,
      profit: 0,
      netProfit: 0,
      realizedProfit: 0,
    }),
    reportRow({
      purchaseContractId: '',
      purchaseContractNo: '',
      salesContractId: 'sales-unlinked',
      salesContractNo: 'S-UNLINKED',
      salesRowSpan: 1,
      isSalesRow: true,
    }),
    reportRow({
      purchaseContractId: 'purchase-unlinked',
      purchaseContractNo: 'P-UNLINKED',
      salesContractId: '',
      salesContractNo: '',
      salesRowSpan: 0,
    }),
  ];

  const workbook = buildReportWorkbook(rows, summary, {
    scopeLabel: '2026年8月至8月',
    exchangeRate: 7.25,
    generatedAt: new Date('2026-08-25T10:00:00+08:00'),
  });

  assert.deepEqual(workbook.SheetNames, [
    '关联合同明细',
    '销售利润汇总',
    '采购去向汇总',
    '未关联合同',
    '统计口径',
  ]);

  const detailSheet = workbook.Sheets['关联合同明细'];
  assert.equal(detailSheet['!merges']?.length || 0, 0);
  assert.equal(detailSheet.A2.v, 'S-001');
  assert.equal(detailSheet.A3.v, 'S-001');
  assert.equal(detailSheet.F2.t, 'n');
  assert.equal(detailSheet.H2.t, 'n');
  assert.equal(detailSheet.H2.v, 0.8);

  const salesSheet = workbook.Sheets['销售利润汇总'];
  assert.equal(salesSheet['!merges']?.length, 13);
  assert.deepEqual(salesSheet['!merges']?.[0], {
    s: { r: 1, c: 0 },
    e: { r: 2, c: 0 },
  });
  assert.deepEqual(salesSheet['!merges']?.[12], {
    s: { r: 1, c: 12 },
    e: { r: 2, c: 12 },
  });
  assert.equal(salesSheet.A2.s?.alignment?.vertical, 'center');

  const unlinkedRows = XLSX.utils.sheet_to_json(workbook.Sheets['未关联合同']);
  assert.equal(unlinkedRows.length, 2);
});

test('preserves merged-cell alignment and numeric formatting in the written xlsx', () => {
  const workbook = buildReportWorkbook([
    reportRow(),
    reportRow({
      purchaseContractId: 'purchase-2',
      purchaseContractNo: 'P-002',
      salesRowSpan: 0,
      tax: 0,
      profit: 0,
      netProfit: 0,
      realizedProfit: 0,
    }),
  ], summary, {
    scopeLabel: '测试范围',
    exchangeRate: 7.25,
  });
  const bytes = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    cellStyles: true,
  });
  const roundTrip = XLSX.read(bytes, { type: 'buffer', cellStyles: true });
  const sheet = roundTrip.Sheets['销售利润汇总'];

  assert.equal(sheet['!merges']?.length, 13);
  assert.equal(Buffer.from(bytes).includes(Buffer.from('vertical="center"')), true);
  assert.equal(sheet.F2.t, 'n');
  assert.equal(sheet.F2.z, '#,##0.00');
  assert.equal(sheet.H2.z, '0.00%');
});

test('merges one purchase contract across multiple linked sales contracts', () => {
  const workbook = buildReportWorkbook([
    reportRow({
      purchaseAllocationRatio: 0.4,
      allocatedPurchaseTaxAmount: 135.6,
      salesRowSpan: 1,
    }),
    reportRow({
      salesContractId: 'sales-2',
      salesContractNo: 'S-002',
      salesQuantity: 15,
      purchaseAllocationRatio: 0.6,
      allocatedPurchaseTaxAmount: 203.4,
      salesRowSpan: 1,
    }),
  ], summary, {
    scopeLabel: '一采购多销售测试',
    exchangeRate: 7.25,
  });

  const purchaseSheet = workbook.Sheets['采购去向汇总'];
  assert.equal(purchaseSheet['!merges']?.length, 13);
  assert.deepEqual(purchaseSheet['!merges']?.[0], {
    s: { r: 1, c: 0 },
    e: { r: 2, c: 0 },
  });
  assert.equal(purchaseSheet.N2.v, 'S-001');
  assert.equal(purchaseSheet.N3.v, 'S-002');
  assert.equal(purchaseSheet.W2.v, 0.4);
  assert.equal(purchaseSheet.W3.v, 0.6);
});
