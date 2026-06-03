import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOUD_COLLECTION_PATHS,
  classifySourceForPhase3,
  phase3SourceMatrix,
  sitesByCollectionPath,
} from './source-classification.js';

test('phase3 source matrix classifies every planned tender website', () => {
  const expected = new Map([
    // 2026-06-02 实测后：中石油/中化/中海油 三个 JS 单页应用无公开接口，降级 local_helper。
    ['中石油招投标网', 'local_helper'],
    ['云梦泽询价网', 'local_helper'],
    ['能源一号（兰州恒化成）', 'local_helper'],
    ['能源一号（北京恒化成）', 'local_helper'],
    ['能源一号（天津宜远）', 'local_helper'],
    ['华锦兵器网', 'local_helper'],
    ['易派克', 'cloud_then_local'],
    ['延长石油', 'cloud_then_local'],
    ['中化', 'local_helper'],
    ['东华能源网', 'manual_only'],
    ['国能网', 'cloud_auto'],
    ['国能E招', 'cloud_auto'],
    ['国能E购', 'cloud_auto'],
    ['中海油', 'local_helper'],
    ['裕龙招投标网', 'cloud_then_local'],
    ['隆道云', 'local_helper'],
    ['金能招标网', 'local_helper'],
  ]);

  for (const [siteName, expectedPath] of expected) {
    assert.equal(phase3SourceMatrix[siteName].collectionPath, expectedPath, siteName);
  }
});

test('classifySourceForPhase3 uses configured site strategy before source flags', () => {
  const result = classifySourceForPhase3({
    source_name: '华锦兵器网',
    login_type: 'none',
    requires_login: false,
    may_have_captcha: false,
  });

  assert.equal(result.collectionPath, 'local_helper');
  assert.equal(result.recommendedCrawlStrategy, 'local_helper');
  assert.equal(result.fallbackPath, 'manual_only');
  assert.equal(result.firstTool, 'local_playwright_cdp');
});

test('classifySourceForPhase3 falls back from cloud source to local when login flags are present', () => {
  const result = classifySourceForPhase3({
    source_name: '未知登录站点',
    source_url: 'https://example.com',
    login_type: 'account',
    requires_login: true,
    may_have_captcha: true,
  });

  assert.equal(result.collectionPath, 'local_helper');
  assert.equal(result.recommendedCrawlStrategy, 'local_helper');
  assert.match(result.reason, /需要登录或人工验证/);
});

test('classifySourceForPhase3 marks missing entry urls as manual only', () => {
  const result = classifySourceForPhase3({
    source_name: '未知缺入口站点',
    login_type: 'none',
    requires_login: false,
    may_have_captcha: false,
  });

  assert.equal(result.collectionPath, 'manual_only');
  assert.equal(result.recommendedCrawlStrategy, 'manual_assist');
  assert.match(result.reason, /缺少入口/);
});

test('sitesByCollectionPath groups sites for the phase 3 test matrix', () => {
  const grouped = sitesByCollectionPath();

  assert.ok(grouped.cloud_auto.includes('国能网'));
  assert.ok(grouped.cloud_then_local.includes('易派克'));
  assert.ok(grouped.local_helper.includes('云梦泽询价网'));
  assert.ok(grouped.local_helper.includes('中石油招投标网'));
  assert.ok(grouped.manual_only.includes('东华能源网'));
  assert.deepEqual(Object.keys(grouped).sort(), [...CLOUD_COLLECTION_PATHS].sort());
});
