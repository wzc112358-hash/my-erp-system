import assert from 'node:assert/strict';
import test from 'node:test';

import XLSX from 'xlsx-js-style';

import type { ReportData, ReportSummary } from '../../../types/report.ts';
import { buildReportWorkbook } from './report-workbook.ts';

const reportRow = (values: Partial<ReportData> = {}): ReportData => ({
  businessDealId: 'deal-1', businessDealName: '销售 S-001 / 采购 P-001',
  businessDealDate: '2026-08-01 00:00:00.000Z', taxRate: 0.1881,
  purchaseContractId: 'purchase-1', purchaseContractNo: 'P-001', purchaseSignDate: '2026-08-02 00:00:00.000Z',
  purchaseProductName: '采购产品', productName: '采购产品', supplierName: '供应商', purchaseQuantity: 5,
  purchaseUnitPrice: 60, purchaseTotalAmount: 300, purchaseTaxTotalAmount: 339,
  purchasePaymentDate: '2026-08-20 00:00:00.000Z', purchaseInvoiceDate: '2026-08-18 00:00:00.000Z',
  purchasePaymentProgress: 25, purchaseInvoiceProgress: 75,
  salesContractId: 'sales-1', salesContractNo: 'S-001', salesSignDate: '2026-08-01 00:00:00.000Z',
  salesProductName: '销售产品', customerName: '客户', salesQuantity: 10, salesUnitPrice: 100,
  salesTotalAmount: 1_000, salesTaxTotalAmount: 1_130, salesReceiptProgress: 50, salesInvoiceProgress: 80,
  freight: 10, miscellaneous: 5, tariff: 2, valueAddedTax: 1,
  purchaseAllocationRatio: 1, allocatedPurchaseTaxAmount: 339,
  arrivalDate: '2026-08-12 00:00:00.000Z', salesReceiptDate: '2026-08-16 00:00:00.000Z',
  salesInvoiceDate: '2026-08-15 00:00:00.000Z', tax: 100, profit: 382, netProfit: 282,
  realizedProfit: 120, salesRowSpan: 1, purchaseRowSpan: 1, isSalesRow: true,
  ...values,
});

const summary: ReportSummary = {
  totalSalesAmount: 1_200, totalPurchaseAmount: 700, totalSalesTaxAmount: 1_356,
  totalPurchaseTaxAmount: 791, totalTax: 100, totalFreight: 20, totalMiscellaneous: 10,
  totalTariff: 3, totalValueAddedTax: 2, totalProfit: 382, totalNetProfit: 282, totalRealizedProfit: 120,
};

test('exports overall deals, contract lists, independent contracts and calculation notes', () => {
  const workbook = buildReportWorkbook([
    reportRow(),
    reportRow({
      purchaseContractId: 'purchase-2', purchaseContractNo: 'P-002', salesContractId: '', salesContractNo: '',
      purchaseTotalAmount: 400, purchaseTaxTotalAmount: 452, tax: 0, profit: 0, netProfit: 0, realizedProfit: 0,
    }),
    reportRow({
      businessDealId: '', businessDealName: '独立销售合同', purchaseContractId: '', purchaseContractNo: '',
      salesContractId: 'sales-independent', salesContractNo: 'S-INDEPENDENT', taxRate: 0,
    }),
  ], summary, { scopeLabel: '2026年8月', exchangeRate: 7.25 });

  assert.deepEqual(workbook.SheetNames, ['总体交易明细', '销售合同清单', '采购合同清单', '独立合同', '统计口径']);
  const detail = workbook.Sheets['总体交易明细'];
  assert.equal(detail.A2.v, '销售 S-001 / 采购 P-001');
  assert.equal(detail.C2.v, 0.1881);
  assert.equal(detail['!merges']?.length, 7);
  assert.equal((XLSX.utils.sheet_to_json(workbook.Sheets['独立合同']) as unknown[]).length, 1);
});

test('keeps money and percent types after writing xlsx', () => {
  const workbook = buildReportWorkbook([reportRow()], summary, { scopeLabel: '测试', exchangeRate: 7.25 });
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
  const sheet = XLSX.read(bytes, { type: 'buffer', cellStyles: true }).Sheets['总体交易明细'];
  assert.equal(sheet.C2.z, '0.00%');
  assert.equal(sheet.I2.z, '#,##0.00');
  assert.equal(sheet.K2.z, '0.00%');
});
