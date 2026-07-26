import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBidPreparationModule,
  matchHistoricalBids,
  type HistoricalBidRecord,
  type PreparationNotice,
} from './bid-preparation.ts';

const notice = (overrides: Partial<PreparationNotice> = {}): PreparationNotice => ({
  id: 'notice-1',
  fingerprint: 'fingerprint-1',
  sourceKey: 'epec',
  sourceName: '易派克',
  kind: 'current',
  title: '齐鲁分公司乙二胺四乙酸四钠盐≥37%框架采购招标公告',
  url: 'https://example.test/notice-1',
  buyerName: '齐鲁石化分公司',
  deadlineAt: '2026-08-01',
  matchedProducts: ['EDTA'],
  evidence: '项目编号 QLSH-2026-001。采购乙二胺四乙酸四钠盐 80 吨，含量≥37%。投标保证金 40000 元。',
  assessment: {
    decision: 'needs_manual_check',
    decisionSummary: '产品匹配，代理商资格待确认。',
    productSummary: '乙二胺四乙酸四钠盐 含量≥37%',
    quantity: '80 吨',
    specifications: ['含量≥37%'],
    deliveryTerms: [],
    commercialTerms: ['投标保证金 40000 元'],
    qualificationChecks: [],
    historicalReferences: [],
    nextActions: [],
  },
  ...overrides,
});

const history = (overrides: Partial<HistoricalBidRecord> = {}): HistoricalBidRecord => ({
  region: 'lanzhou',
  id: 'history-1',
  biddingCompany: '抚顺石化分公司',
  biddingNo: 'FSSH-001',
  productName: '乙二胺四乙酸四钠EDTA-4NA',
  quantity: 10,
  quantityUnit: '吨',
  specification: '',
  purity: '',
  packaging: '',
  quotedUnitPrice: 12_000,
  quotedTotalAmount: 120_000,
  currency: 'CNY',
  tenderFee: 500,
  bidBond: 2_000,
  winningSupplier: '',
  brand: '',
  bidResult: 'lost',
  openDate: '2026-06-13',
  lossReason: '',
  qualificationSnapshot: [],
  ...overrides,
});

test('separates exact product, product family, and same buyer history', () => {
  const matches = matchHistoricalBids(notice(), [
    history(),
    history({ id: 'white-oil', productName: '2号食品级白油' }),
    history({ id: 'same-buyer', productName: '催化剂', biddingCompany: '齐鲁石化有限公司' }),
  ]);
  assert.equal(matches.find((item) => item.id === 'history-1')?.matchType, 'exact_product');
  assert.equal(matches.find((item) => item.id === 'same-buyer')?.matchType, 'same_buyer');
  assert.equal(matches.some((item) => item.id === 'white-oil'), false);
});

test('prepares only current notice facts and never copies historical prices', async () => {
  const module = createBidPreparationModule({
    data: {
      getNotice: async () => notice(),
      listHistoricalBids: async () => [history()],
      findExisting: async () => undefined,
    },
    extractor: {
      extract: async () => ({
        biddingNo: 'QLSH-2026-001',
        bidBond: 40_000,
        quotedUnitPrice: 12_000,
        openDate: '2026-08-01',
        evidence: {
          biddingNo: '项目编号 QLSH-2026-001',
          bidBond: '投标保证金 40000 元',
          quotedUnitPrice: '历史报价 12000 元',
          openDate: '截止时间 2026-08-01',
        },
      }),
    },
  });
  const prepared = await module.prepare('notice-1', 'beijing');
  assert.equal(prepared.draft.biddingCompany, '齐鲁石化分公司');
  assert.equal(prepared.draft.biddingNo, 'QLSH-2026-001');
  assert.equal(prepared.draft.quantity, 80);
  assert.equal(prepared.draft.quantityUnit, '吨');
  assert.equal(prepared.draft.purity, '≥37%');
  assert.equal(prepared.fieldEvidence.purity, '含量≥37%');
  assert.equal(prepared.draft.bidBond, 40_000);
  assert.equal(prepared.draft.quotedUnitPrice, undefined);
  assert.equal(prepared.draft.openDate, '');
  assert.match(prepared.warnings.join(' '), /未使用截止时间代替/);
});

test('blocks preparation when the notice has an explicit blocker', async () => {
  const blocked = notice({
    assessment: {
      ...notice().assessment!,
      decision: 'likely_cannot_do',
      decisionSummary: '公告明确仅接受制造商。',
    },
  });
  const module = createBidPreparationModule({
    data: {
      getNotice: async () => blocked,
      listHistoricalBids: async () => [history()],
      findExisting: async () => undefined,
    },
    extractor: { extract: async () => ({}) },
  });
  await assert.rejects(() => module.prepare('notice-1', 'beijing'), /明确仅接受制造商/);
});
