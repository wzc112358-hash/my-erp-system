import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSiteSearchScope,
  effectiveSearchTerms,
  normalizeSiteSearchScope,
  rotatingExploratoryTerms,
  serializedSiteSearchScope,
  storedSiteSearchScope,
} from './site-search-scope.ts';

test('site search scope keeps exact products separate from broad discovery terms', () => {
  const scope = buildSiteSearchScope({
    preferredProductTerms: ['抗氧剂618', 'ABS树脂', '磷酸三钙'],
    productLimit: 3,
    familyTerms: ['化工原料', '油品'],
    exploratoryTerms: ['油', '酸', '酯'],
    exploratoryTermsPerRun: 2,
  });
  assert.deepEqual(scope.productTerms, ['抗氧剂618', 'ABS树脂', '磷酸三钙']);
  assert.deepEqual(scope.familyTerms, ['化工原料', '油品']);
  assert.equal(rotatingExploratoryTerms(scope, '云梦泽智慧平台', new Date('2026-08-06T08:00:00+08:00')).length, 2);
  assert.equal(effectiveSearchTerms(scope, '云梦泽智慧平台', new Date('2026-08-06T08:00:00+08:00')).length, 7);
});

test('stored ERP scope overrides defaults and safely falls back from invalid JSON', () => {
  const fallback = normalizeSiteSearchScope({
    productTerms: ['阻聚剂'],
    familyTerms: ['化工原料'],
    exploratoryTerms: ['油'],
    exploratoryTermsPerRun: 1,
  });
  const configured = normalizeSiteSearchScope({
    productTerms: ['白油', '磷酸三钙'],
    familyTerms: ['油品'],
    exploratoryTerms: ['酸'],
    exploratoryTermsPerRun: 2,
  });

  assert.deepEqual(storedSiteSearchScope(serializedSiteSearchScope(configured), fallback), configured);
  assert.deepEqual(storedSiteSearchScope('{broken', fallback), fallback);
  assert.deepEqual(storedSiteSearchScope('', fallback), fallback);
});

test('site search scope accepts one-character exploration but rejects one-character product terms', () => {
  const scope = normalizeSiteSearchScope({
    productTerms: ['油', '白油'],
    familyTerms: ['酸', '有机酸'],
    exploratoryTerms: ['油', '酸'],
    exploratoryTermsPerRun: 9,
  });
  assert.deepEqual(scope.productTerms, ['白油']);
  assert.deepEqual(scope.familyTerms, ['有机酸']);
  assert.deepEqual(scope.exploratoryTerms, ['油', '酸']);
  assert.equal(scope.exploratoryTermsPerRun, 4);
});
