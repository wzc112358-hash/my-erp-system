import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SITE_COLLECTION_SKILLS,
  siteCollectionSkillFor,
  siteCollectionSkillPromptFor,
} from './site-skills.ts';

test('site collection skills cover documented daily bidding sources', () => {
  for (const sourceName of [
    '中石油招投标网',
    '云梦泽询价网',
    '能源一号（兰州恒化成）',
    '华锦兵器网',
    '易派克',
    '延长石油',
    '中化',
    '东华能源网',
    '国能网',
    '中海油',
    '裕龙招投标网',
    '能源一号（北京恒化成）',
    '隆道云',
    '金能招标网',
  ]) {
    const skill = siteCollectionSkillFor(sourceName);
    assert.equal(skill.sourceName, sourceName);
    assert.ok(skill.searchPlan.length > 0);
    assert.ok(skill.requiredExtraction.some((item) => /代理商|制造商|截止/.test(item)));
  }
});

test('site collection skill prompt omits credentials and includes business checklist', () => {
  const prompt = siteCollectionSkillPromptFor('易派克');

  assert.match(prompt, /是否接受代理商/);
  assert.match(prompt, /历史中标人/);
  assert.doesNotMatch(prompt, /密码|账号：|账号:/);
});

test('public and semi-public site skills include executable deep-search hints', () => {
  for (const sourceName of ['易派克', '国能E招', '国能E购', '隆道云', '金能招标网', '裕龙招投标网']) {
    const skill = siteCollectionSkillFor(sourceName);
    assert.ok((skill.deepSearchTerms || []).length > 0, `${sourceName} should expose deepSearchTerms`);
    assert.ok((skill.deepSearchQueries || []).length > 0, `${sourceName} should expose deepSearchQueries`);
  }
});

test('site collection skills keep source data credential-free', () => {
  const serialized = JSON.stringify(SITE_COLLECTION_SKILLS);

  assert.doesNotMatch(serialized, /LZhhc|LZHHC|hhc580|151012|30002557/i);
});
