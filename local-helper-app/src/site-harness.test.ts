import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeObservation,
  buildObservationArtifacts,
  createSiteHarness,
  extractCandidateBundle,
  type SiteHarnessProfile,
} from './site-harness.ts';
import { profileFor } from './site-profiles.ts';

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

test('analyzeObservation does not treat a normal login nav link as a blocking captcha state', () => {
  const result = analyzeObservation(
    {
      title: '华锦兵器网',
      url: 'https://www.norincogroup-ebuy.com/',
      visibleText: [
        '首页 登录 退出登录',
        '2026-05-27 华锦精细化工消泡剂采购询价公告 报价截止 2026-05-30',
      ].join('\n'),
    },
    { sourceName: '华锦兵器网', buyerName: '华锦兵器网', buyerMatch: /华锦/ },
  );

  assert.equal(result.status, 'ready');
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

test('extractCandidateBundle promotes notice links and carries attachment links', () => {
  const bundle = extractCandidateBundle(
    {
      title: '中石油招投标网',
      url: 'https://www.cnpcbidding.com/#/tenders',
      visibleText: '公告列表',
      links: [
        {
          text: '2026-06-19 炼油助剂采购询价公告',
          href: '/#/tender/notice-1',
          title: '2026-06-19 炼油助剂采购询价公告',
        },
        {
          text: '下载招标文件',
          href: 'https://www.cnpcbidding.com/files/tender.docx',
          title: '',
        },
      ],
    },
    { id: 'task-cnpc', sourceName: '中石油招投标网', entryUrl: 'https://www.cnpcbidding.com/#/tenders' },
    profileFor('中石油招投标网'),
  );

  assert.equal(bundle.candidates.length, 1);
  assert.match(bundle.candidates[0].title, /炼油助剂/);
  assert.match(bundle.candidates[0].url, /notice-1/);
  assert.deepEqual(bundle.candidates[0].attachments, ['https://www.cnpcbidding.com/files/tender.docx']);
});

test('extractCandidateBundle extracts notice rows from network JSON responses', () => {
  const bundle = extractCandidateBundle(
    {
      title: '中化',
      url: 'https://scm.esinochem.com/',
      visibleText: '首页 登录 退出登录',
      networkResponses: [{
        url: 'https://scm.esinochem.com/gateway/notice/outer/page/queryPageList',
        status: 200,
        contentType: 'application/json',
        bodySnippet: JSON.stringify({
          rows: [{
            noticeTitle: '2026年中化水处理剂采购询价公告',
            detailUrl: '/notice/detail/abc',
            publishTime: '2026-06-19',
            deadline: '2026-06-25',
            buyerName: '中化商务',
          }],
        }),
      }],
    },
    { id: 'task-sinochem', sourceName: '中化', entryUrl: 'https://scm.esinochem.com/' },
    profileFor('中化'),
  );

  assert.equal(bundle.candidates.length, 1);
  assert.equal(bundle.candidates[0].title, '2026年中化水处理剂采购询价公告');
  assert.equal(bundle.candidates[0].url, 'https://scm.esinochem.com/notice/detail/abc');
  assert.equal(bundle.candidates[0].published_at, '2026-06-19');
  assert.equal(bundle.candidates[0].deadline_at, '2026-06-25');
  assert.equal(bundle.candidates[0].buyer_name, '中化商务');
});

test('buildObservationArtifacts creates DOM, network, and attachment evidence', () => {
  const artifacts = buildObservationArtifacts(
    {
      title: '中化',
      url: 'https://scm.esinochem.com/',
      visibleText: '公告列表',
      domSnapshot: '<html><body>采购公告</body></html>',
      networkResponses: [{
        url: 'https://scm.esinochem.com/gateway/notice/page',
        status: 200,
        contentType: 'application/json',
        bodySnippet: '{"rows":[{"title":"采购公告"}]}',
      }],
      links: [{ text: '附件下载', href: '/files/a.pdf' }],
    },
    { id: 'task-sinochem', sourceName: '中化', entryUrl: 'https://scm.esinochem.com/' },
  );

  assert.deepEqual(artifacts.map((artifact) => artifact.artifact_type), [
    'dom_snapshot',
    'network_response',
    'attachment',
  ]);
  assert.match(artifacts[0].content, /采购公告/);
  assert.match(artifacts[1].content, /notice\/page/);
  assert.equal(artifacts[2].content, 'https://scm.esinochem.com/files/a.pdf');
});

test('extractCandidateBundle handles norinco business rows and filters portal notices', () => {
  const bundle = extractCandidateBundle(
    {
      title: '兵器工业集团公司采购电子商务平台',
      url: 'https://www.norincogroup-ebuy.com/',
      visibleText: [
        '平台公告',
        '关于平台账号登录变更的通知',
        '2026年端午节假期公告',
        '关于平台系统升级维护及运营管理流程优化的公告',
        '业务资讯',
        '商天然气管网改造工程-液气混合设备',
        '2026-06-19 11:51',
        '商避雷针检测鉴定服务',
        '2026-06-19 10:10',
      ].join('\n'),
    },
    { id: 'task-huajin', sourceName: '华北兵器网', entryUrl: 'https://www.norincogroup-ebuy.com/' },
    profileFor('华北兵器网'),
  );

  assert.equal(bundle.candidates.length, 2);
  assert.equal(bundle.candidates[0].title, '天然气管网改造工程-液气混合设备');
  assert.equal(bundle.candidates[0].published_at, '2026-06-19');
  assert.equal(bundle.candidates[1].title, '避雷针检测鉴定服务');
  assert.equal(bundle.candidates.some((candidate) => /端午节|平台系统升级/.test(candidate.title)), false);
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

test('createSiteHarness continues after login when the page still contains login nav text', async () => {
  const browser = {
    open: async () => ({
      title: '华锦兵器网 登录',
      url: 'https://www.norincogroup-ebuy.com/',
      visibleText: '账号 密码 验证码',
    }),
    observe: async () => ({
      title: '华锦兵器网',
      url: 'https://www.norincogroup-ebuy.com/',
      visibleText: [
        '首页 登录 退出登录',
        '2026-05-27 华锦精细化工消泡剂采购询价公告 报价截止 2026-05-30',
      ].join('\n'),
    }),
  };
  const harness = createSiteHarness({
    browser,
    profile: { sourceName: '华锦兵器网', buyerName: '华锦兵器网', buyerMatch: /华锦/ },
  });
  const task = { id: 'task-huajin', sourceName: '华锦兵器网', entryUrl: 'https://www.norincogroup-ebuy.com/' };

  const first = await harness.openTask(task);
  const continued = await harness.continueTask(task);

  assert.equal(first.status, 'request_human');
  assert.equal(continued.status, 'completed');
  assert.equal(continued.candidateBundle?.candidates.length, 1);
  assert.match(continued.candidateBundle?.candidates[0].title || '', /消泡剂/);
});

test('createSiteHarness asks the user to navigate to a notice list when no candidate rows are visible', async () => {
  const browser = {
    open: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
    observe: async () => ({
      title: '华锦兵器网',
      url: 'https://www.norincogroup-ebuy.com/',
      visibleText: '首页 询价交易 招标采购 我的工作台 退出登录',
    }),
  };
  const harness = createSiteHarness({
    browser,
    profile: { sourceName: '华锦兵器网' },
  });

  const result = await harness.continueTask({
    id: 'task-huajin',
    sourceName: '华锦兵器网',
    entryUrl: 'https://www.norincogroup-ebuy.com/',
  });

  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /公告列表|搜索结果/);
});

test('createSiteHarness returns a human-readable error instead of navigating to an empty URL', async () => {
  let openedUrl = '';
  const browser = {
    open: async (url: string) => {
      openedUrl = url;
      return {
        title: '',
        url,
        visibleText: '',
      };
    },
    observe: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
  };
  const harness = createSiteHarness({
    browser,
    profile: { sourceName: '未知缺入口站点' },
  });

  const result = await harness.openTask({
    id: 'task-empty-url',
    sourceName: '未知缺入口站点',
    entryUrl: '',
  });

  assert.equal(openedUrl, '');
  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /缺少入口 URL/);
  assert.match(result.observation.visibleText, /补充入口网址/);
});

test('createSiteHarness uses the site profile entry URL when the task entry is empty', async () => {
  let openedUrl = '';
  const browser = {
    open: async (url: string) => {
      openedUrl = url;
      return {
        title: '中石油招投标网 登录',
        url,
        visibleText: '账号 密码 验证码',
      };
    },
    observe: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
  };
  const harness = createSiteHarness({
    browser,
    profile: {
      sourceName: '中石油招投标网',
      entryUrl: 'https://www.cnpcbidding.com/#/tenders',
    },
  });

  const result = await harness.openTask({
    id: 'task-cnpc',
    sourceName: '中石油招投标网',
    entryUrl: '',
  });

  assert.equal(openedUrl, 'https://www.cnpcbidding.com/#/tenders');
  assert.equal(result.status, 'request_human');
});

test('createSiteHarness converts browser DNS navigation failures into human-readable task state', async () => {
  const browser = {
    open: async () => {
      throw new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.cnpcbidding.com/#/tenders');
    },
    observe: async () => ({
      title: '',
      url: '',
      visibleText: '',
    }),
  };
  const harness = createSiteHarness({
    browser,
    profile: {
      sourceName: '中石油招投标网',
      entryUrl: 'https://www.cnpcbidding.com/#/tenders',
    },
  });

  const result = await harness.openTask({
    id: 'task-cnpc',
    sourceName: '中石油招投标网',
    entryUrl: '',
  });

  assert.equal(result.status, 'request_human');
  assert.match(result.humanReason, /DNS/);
  assert.match(result.observation.visibleText, /ERR_NAME_NOT_RESOLVED/);
});
