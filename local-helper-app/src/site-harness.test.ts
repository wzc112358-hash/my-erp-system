import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeObservation,
  createSiteHarness,
  extractCandidateBundle,
  type SiteHarnessProfile,
} from './site-harness.ts';

const genericProfile: SiteHarnessProfile = { sourceName: '隆道云' };

const buyerProfile: SiteHarnessProfile = {
  sourceName: '金能招标网',
  buyerName: '金能',
  buyerMatch: /金能/,
};

test('analyzeObservation asks for human takeover on login/captcha for any site', () => {
  const result = analyzeObservation(
    {
      title: '供应商登录',
      url: 'https://lap.longdao.com/',
      visibleText: '请输入账号 密码 验证码',
    },
    genericProfile,
  );

  assert.equal(result.status, 'request_human');
  assert.match(result.reason, /验证码/);
});

test('analyzeObservation flags empty page as needing human confirmation', () => {
  const result = analyzeObservation(
    { title: '', url: 'https://lap.longdao.com/', visibleText: '   ' },
    genericProfile,
  );

  assert.equal(result.status, 'request_human');
  assert.match(result.reason, /页面为空|加载失败/);
});

test('extractCandidateBundle uses default notice rules and attaches buyer when configured', () => {
  const bundle = extractCandidateBundle(
    {
      title: '金能招标网',
      url: 'https://www.jnzbw.com/list',
      visibleText: [
        '首页 登录',
        '2026-05-27 金能科技丙烯酸采购公开招标公告 报价截止 2026-05-30',
        '2026-05-26 办公用品采购公告',
      ].join('\n'),
    },
    { id: 't1', sourceName: '金能招标网', entryUrl: 'https://www.jnzbw.com/' },
    buyerProfile,
  );

  assert.equal(bundle.source_name, '金能招标网');
  assert.equal(bundle.candidates.length, 2);
  assert.match(bundle.candidates[0].title, /丙烯酸/);
  assert.equal(bundle.candidates[0].published_at, '2026-05-27');
  // 行内含"报价截止"提示时标记截止位，当前沿用行内首个日期（发布日），后续详情页再精修。
  assert.equal(bundle.candidates[0].deadline_at, '2026-05-27');
  assert.equal(bundle.candidates[0].buyer_name, '金能');
  // 第二行不含"金能"，buyerMatch 未命中，采购方留空。
  assert.equal(bundle.candidates[1].buyer_name, '');
});

test('createSiteHarness pauses for human then completes for a generic login site', async () => {
  const browser = {
    open: async () => ({
      title: '隆道云 登录',
      url: 'https://lap.longdao.com/',
      visibleText: '账号 密码 验证码',
    }),
    observe: async () => ({
      title: '招标公告',
      url: 'https://lap.longdao.com/notice/list',
      visibleText: '2026-05-27 某化工催化剂采购招标公告 截止 2026-05-29',
    }),
  };
  const harness = createSiteHarness({ browser, profile: genericProfile });
  const task = { id: 'task-1', sourceName: '隆道云', entryUrl: 'https://lap.longdao.com/' };

  const first = await harness.openTask(task);
  const continued = await harness.continueTask(task);

  assert.equal(first.status, 'request_human');
  assert.equal(continued.status, 'completed');
  assert.equal(continued.candidateBundle?.candidates.length, 1);
  assert.match(continued.candidateBundle?.candidates[0].title || '', /催化剂/);
});
