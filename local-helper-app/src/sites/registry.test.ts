import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actionStepsForSourceName,
  definitionFor,
  entryUrlForSourceName,
  PILOT_SITE_NAMES,
  searchTermsForSourceName,
  sitePromptFor,
} from './registry.ts';

test('registry contains the three stable and three next-stage sites', () => {
  assert.deepEqual(PILOT_SITE_NAMES, [
    '国能E购', '易派克', '裕龙招投标网',
    '中国石油招标投标网', '中化采购供应链平台', '云梦泽智慧平台',
  ]);
});

test('registry selects the right collection mode and browser engine', () => {
  assert.equal(definitionFor('国能E购').collectionMode, 'public-feed');
  assert.equal(definitionFor('易派克').collectionMode, 'public-feed');
  assert.equal(definitionFor('裕龙招投标网').collectionMode, 'browser-agent');
  assert.equal(definitionFor('裕龙招投标网').browserEngine, 'electron-cdp');
  assert.equal(definitionFor('中国石油招标投标网').browserJourney?.strategy, 'keyword');
  assert.equal(definitionFor('中化采购供应链平台').browserJourney?.strategy, 'latest');
  assert.equal(definitionFor('云梦泽智慧平台').browserJourney?.strategy, 'keyword');
});

test('registry centralizes task defaults and the LLM site prompt', () => {
  assert.match(entryUrlForSourceName('裕龙招投标网'), /ctbpsp/);
  assert.match(searchTermsForSourceName('裕龙招投标网'), /裕龙石化/);
  assert.match(actionStepsForSourceName('裕龙招投标网'), /安全验证/);
  assert.match(sitePromptFor('裕龙招投标网'), /页面抽取提示/);
});

test('unknown sites receive one conservative browser-agent definition', () => {
  const site = definitionFor('临时站点');
  assert.equal(site.sourceName, '临时站点');
  assert.equal(site.collectionMode, 'browser-agent');
  assert.ok(site.productFocus.length > 10);
});
