import assert from 'node:assert/strict';
import test from 'node:test';

import type { BidAssessor } from '../llm/bid-assessor.ts';
import { assessLocalHelperReport } from './ingest-local-helper-report.ts';

const assessor: BidAssessor = {
  name: 'test-cloud-agent',
  async assess({ baseCard }) {
    return baseCard;
  },
  async assessBatch(inputs) {
    return inputs.map(({ baseCard }) => ({
      ...baseCard,
      businessRelevance: 'known_product' as const,
      bidability: 'needs_manual_check' as const,
      recommendedAction: 'prioritize' as const,
      businessAssessment: {
        decision: 'needs_manual_check' as const,
        decisionSummary: '产品匹配，但贸易商资格需要确认。',
        productSummary: 'TBC 阻聚剂',
        quantity: '20 吨',
        specifications: ['纯度≥99%'],
        deliveryTerms: ['分批交货'],
        commercialTerms: [],
        qualificationChecks: [{ requirement: '贸易商资格', status: 'unconfirmed' as const, basis: '公告未明确' }],
        historicalReferences: [],
        nextActions: ['确认是否接受贸易商投标'],
      },
    }));
  },
};

test('cloud Agent reassesses local CNPC reports before persistence', async () => {
  const result = await assessLocalHelperReport({
    assessor,
    now: Date.parse('2026-07-26T08:00:00+08:00'),
    report: {
      sourceName: '中国石油招标投标网',
      items: [{
        title: '吉林石化 TBC 阻聚剂采购招标公告',
        url: 'https://www.cnpcbidding.com/#/details?id=notice-1',
        buyerName: '吉林石化',
        publishedAt: '2026-07-25',
        deadlineAt: '2099-07-30',
        matchedProducts: ['阻聚剂'],
        rawText: '采购 TBC 阻聚剂 20 吨，纯度≥99%，分批交货。',
        detailReadMethod: '网页正文',
        attachmentUrls: ['https://example.com/notice.pdf'],
      }],
    },
  });

  assert.equal(result.sourceKey, 'cnpc');
  assert.equal(result.assessedCount, 1);
  assert.equal(result.notices.length, 1);
  assert.equal(result.notices[0]?.kind, 'current');
  assert.equal(result.notices[0]?.assessment?.quantity, '20 吨');
  assert.deepEqual(result.notices[0]?.assessment?.specifications, ['纯度≥99%']);
  assert.equal(result.notices[0]?.detailReadMethod, '网页正文');
  assert.deepEqual(result.notices[0]?.attachmentUrls, ['https://example.com/notice.pdf']);
});

test('local Yulong intelligence remains attention after cloud assessment', async () => {
  const result = await assessLocalHelperReport({
    assessor,
    report: {
      sourceName: '裕龙招投标网',
      intelligenceItems: [{
        title: '裕龙石化 TBC 阻聚剂采购招标公告',
        url: 'https://ctbpsp.com/#/bulletinDetail?uuid=notice-2',
        deadlineAt: '2026-07-20',
        rawText: '采购 TBC 阻聚剂。',
      }],
    },
  });

  assert.equal(result.sourceKey, 'yulong');
  assert.equal(result.notices[0]?.kind, 'attention');
  assert.match(result.notices[0]?.assessment?.decisionSummary || '', /仅保留/);
});
