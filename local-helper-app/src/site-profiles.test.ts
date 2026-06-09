import test from 'node:test';
import assert from 'node:assert/strict';

import { SITE_PROFILES, profileFor } from './site-profiles.ts';

test('profileFor returns the registered profile for second-batch sites', () => {
  assert.equal(profileFor('华锦兵器网').buyerName, '华锦兵器网');
  assert.equal(profileFor('金能招标网').buyerName, '金能');
  assert.equal(profileFor('能源一号（天津宜远）').sourceName, '能源一号（天津宜远）');
  assert.ok(profileFor('易派克').buyerMatch?.test('中石化'));
});

test('profileFor falls back to a generic profile for unknown sites', () => {
  const profile = profileFor('某个未注册的招标网');
  assert.equal(profile.sourceName, '某个未注册的招标网');
  assert.equal(profile.buyerName, undefined);
});

test('profileFor returns a usable default when given an empty name', () => {
  assert.equal(profileFor('').sourceName, '本地采集站点');
});

test('all second-batch login sites are registered', () => {
  for (const site of [
    '华锦兵器网',
    '易派克',
    '云梦泽询价网',
    '能源一号（兰州恒化成）',
    '能源一号（北京恒化成）',
    '能源一号（天津宜远）',
    '隆道云',
    '金能招标网',
  ]) {
    assert.ok(SITE_PROFILES[site], `${site} 应在 SITE_PROFILES 中注册`);
  }
});
