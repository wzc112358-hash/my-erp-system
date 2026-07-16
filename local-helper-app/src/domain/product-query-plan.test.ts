import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductQueryPlan,
  productFocusTerms,
} from './product-query-plan.ts';

test('product query plan comes from the weighted product catalog without guard terms', () => {
  const focus = productFocusTerms();
  assert.ok(focus.includes('白油'));
  assert.ok(focus.includes('阻聚剂'));
  assert.ok(focus.includes('引发剂'));
  assert.equal(focus.includes('办公用品'), false);
  assert.equal(focus.includes('化工'), false);
});

test('product query plan keeps ERP and chat priorities before catalog fallbacks', () => {
  const queries = buildProductQueryPlan({
    preferredTerms: ['阻聚剂', '白油', '凡士林脂'],
    limit: 6,
  });
  assert.deepEqual(queries.slice(0, 3), ['阻聚剂', '白油', '凡士林脂']);
  assert.equal(new Set(queries).size, queries.length);
  assert.equal(queries.length, 6);
});
