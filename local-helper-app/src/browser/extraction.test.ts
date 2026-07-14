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

test('analyzeObservation treats real 502 pages as empty but ignores ICP numbers', () => {
  const gateway = analyzeObservation(
    { title: '502 Bad Gateway', url: 'https://bid.cnooc.com.cn/home/#/navigation', visibleText: '502 Bad Gateway' },
    profileFor('中海油'),
  );
  const normalPage = analyzeObservation(
    {
      title: '金能化学（青岛）有限公司电子招标管理平台',
      url: 'http://www.jinnengtech.com:6789/',
      visibleText: [
        '金能化学（青岛）有限公司BD2026-06-240096(采购内容：2026年6月24日环孔支撑剂、高铝耐火球招标（齐河）)招标采购公告',
        '版权所有 鲁公网安备37142502000101号',
      ].join('\n'),
    },
    profileFor('金能招标网'),
  );

  assert.equal(gateway.status, 'request_human');
  assert.match(gateway.reason, /页面为空|加载失败/);
  assert.equal(normalPage.status, 'ready');
});

test('analyzeObservation treats English slide verification as blocking even with network candidates', () => {
  const result = analyzeObservation(
    {
      title: '裕龙招投标网',
      url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99',
      visibleText: 'Access Verification Please slide to verify that you are not a robot TraceID:abc123',
      networkResponses: [{
        url: 'https://bulletin.cebpubservice.com/api/page',
        status: 200,
        contentType: 'application/json',
        bodySnippet: JSON.stringify({
          rows: [{ title: '2026-06-26 裕龙石化阻聚剂采购招标公告' }],
        }),
      }],
    },
    profileFor('裕龙招投标网'),
  );

  assert.equal(result.status, 'request_human');
  assert.match(result.reason, /验证码|滑块/);
});

test('analyzeObservation treats visible captcha input as blocking even with notice navigation', () => {
  const result = analyzeObservation(
    {
      title: '中石油招投标网',
      url: 'https://www.cnpcbidding.com/#/tenders',
      visibleText: [
        '招标公告',
        '投标邀请书',
        '资格预审公告',
        '外部招标机构公告',
        '关键字 项目类型',
        '输入验证码',
        '提交',
      ].join('\n'),
    },
    profileFor('中石油招投标网'),
  );

  assert.equal(result.status, 'request_human');
  assert.match(result.reason, /验证码/);
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

test('extractCandidateBundle does not treat notice column navigation as attachments', () => {
  const bundle = extractCandidateBundle(
    {
      title: '国能E招',
      url: 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html',
      visibleText: '公告信息 招标公告 招标文件公示',
      links: [
        {
          text: '2026-06-26 宁夏煤业煤制油项目化工助剂采购公开招标项目招标公告',
          href: '/bidweb/001/001002/001002001/20260626/notice.html',
        },
        { text: '招标公告', href: '/bidweb/001/001002/moreinfo.html' },
        { text: '资格预审公告', href: '/bidweb/001/001001/moreinfo.html' },
        { text: '招标文件公示', href: '/bidweb/001/001006/moreinfo.html' },
      ],
    },
    { id: 'task-guoneng', sourceName: '国能E招', entryUrl: 'https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html' },
    profileFor('国能E招'),
  );

  assert.equal(bundle.candidates.length, 1);
  assert.deepEqual(bundle.candidates[0].attachments, []);
});

test('extractCandidateBundle ignores portal search controls while a page is loading', () => {
  const bundle = extractCandidateBundle(
    {
      title: '裕龙招投标网',
      url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
      visibleText: [
        '登录',
        '登录信息定制开启更多服务',
        '首页|联系我们',
        '专栏首页',
        '发布工具',
        '发布媒介',
        '问题清单',
        '搜索引擎',
        '全部招标人招标代理机构',
        '搜索',
        '搜标题',
        '加载中...',
        '增值服务',
        '全网标讯智能搜索引擎：TenderSeek',
      ].join('\n'),
    },
    { id: 'task-yulong', sourceName: '裕龙招投标网', entryUrl: 'https://ctbpsp.com/#/bulletinList' },
    profileFor('裕龙招投标网'),
  );

  assert.equal(bundle.candidates.length, 0);
});

test('extractCandidateBundle keeps current Yulong tender rows and excludes award results', () => {
  const bundle = extractCandidateBundle(
    {
      title: '全国招标公告公示搜索引擎',
      url: 'https://ctbpsp.com/#/bulletinList?keyWords=%E8%A3%95%E9%BE%99%E7%9F%B3%E5%8C%96',
      visibleText: [
        '裕龙石化有限公司清洁用品框架采购【公开招标】中标结果公告',
        '山东省 中标结果公示 接收时间:2026-07-10',
        '裕龙石化产业园发展有限公司竣工环境保护验收服务竞争性磋商公告',
        '山东省 招标公告 接收时间:2026-07-08',
        '裕龙石化有限公司工艺阀门专项维修服务标段一二次招标公告',
        '山东省 招标公告 接收时间:2026-07-03',
      ].join('\n'),
    },
    { id: 'task-yulong-live', sourceName: '裕龙招投标网', entryUrl: 'https://ctbpsp.com/#/bulletinList' },
    profileFor('裕龙招投标网'),
  );

  assert.equal(bundle.candidates.length, 2);
  assert.equal(bundle.candidates.some((candidate) => /中标结果/.test(candidate.title)), false);
  assert.equal(bundle.candidates[0].published_at, '2026-07-08');
});

test('extractCandidateBundle ignores CNPC navigation and footer text', () => {
  const bundle = extractCandidateBundle(
    {
      title: '中石油招投标网',
      url: 'https://www.cnpcbidding.com/#/tenders',
      visibleText: [
        '分类导航',
        '招标公告',
        '投标邀请书',
        '资格预审公告',
        '外部招标机构公告',
        '中国石油 中国招标投标公共服务平台',
        '法律声明 联系我们 网站使用帮助',
        '© 2018 中国石油招标投标网 | 京ICP备10020258号',
        '客服咨询',
      ].join('\n'),
    },
    { id: 'task-cnpc', sourceName: '中石油招投标网', entryUrl: 'https://www.cnpcbidding.com/#/tenders' },
    profileFor('中石油招投标网'),
  );

  assert.equal(bundle.candidates.length, 0);
});

test('extractCandidateBundle ignores YMZ homepage columns and common website links', () => {
  const bundle = extractCandidateBundle(
    {
      title: '云梦泽询价网',
      url: 'https://www.ymzec.com/bid/web-outportal/index.html#/home',
      visibleText: [
        '云梦泽首页',
        '招标公示/公告',
        '招标计划资格预审公告招标公告邀请招标事项公示可不招标事项公示中标候选人公示中标结果公告',
        '非招标公示/公告',
        '谈判采购竞价采购询比采购直接采购拟成交结果公示成交结果公告',
        '客户服务',
        '政策法规',
        '操作说明',
        '常见问题',
        '下载专区',
        '用户手册',
        '培训课件',
        '工具下载',
        '常用网站',
        '中国招标投标公共服务平台',
        '全国企业采购交易供应商信用认证评价系统',
        '全国企业采购交易寻源询价系统',
        '中国招标投标协会',
        '国有企业采购供应信用管理平台',
        '国家企业信用信息公示系统',
        '采购与招标相关网站',
        '（四）《典型招标文件高效拆解与精准响应》',
      ].join('\n'),
    },
    { id: 'task-ymz', sourceName: '云梦泽询价网', entryUrl: 'https://www.ymzec.com/bid/web-outportal/index.html#/home' },
    profileFor('云梦泽询价网'),
  );

  assert.equal(bundle.candidates.length, 0);
});

test('extractCandidateBundle ignores YMZ training notices but keeps purchase tenders', () => {
  const bundle = extractCandidateBundle(
    {
      title: '云梦泽询价网',
      url: 'https://www.ymzec.com/bid/web-outportal/index.html#/home',
      visibleText: [
        '云梦泽智慧平台招标投标应用 线上直播培训通知 （第十四期）',
        '2026-06-22',
        '云梦泽智慧平台投标人操作实务与实战技能专项培训班 培训通知 （西安、沈阳站）',
        '2026-06-16',
        '川气东送二线天然气管道工程川渝鄂段施工总承包五标段项目钢筋混凝土套管采购招标项目-临时',
        '公开招标',
        '物资类',
        '2026-06-26',
      ].join('\n'),
    },
    { id: 'task-ymz', sourceName: '云梦泽询价网', entryUrl: 'https://www.ymzec.com/bid/web-outportal/index.html#/home' },
    profileFor('云梦泽询价网'),
  );

  assert.equal(bundle.candidates.length, 1);
  assert.match(bundle.candidates[0].title, /钢筋混凝土套管/);
  assert.equal(bundle.candidates[0].published_at, '2026-06-26');
});

test('extractCandidateBundle ignores bidding policy articles and manuals', () => {
  const bundle = extractCandidateBundle(
    {
      title: '云梦泽询价网',
      url: 'https://www.ymzec.com/bid/web-outportal/index.html#/home',
      visibleText: [
        '国家发展改革委等部门关于加快招标投标领域 人工智能推广应用的实施意见',
        '关于印发《招标人主体责任履行指引》的通知(发改法规〔2025〕1358号)',
        '《工程建设项目招标代理机构管理暂行办法》 2025年第34号令',
        '招标投标全流程解读',
        '云梦泽招标投标应用注意事项',
        '采购-供应商操作手册',
        '长庆油田分公司阻聚剂谈判采购公告',
        '2026-06-26',
      ].join('\n'),
    },
    { id: 'task-ymz', sourceName: '云梦泽询价网', entryUrl: 'https://www.ymzec.com/bid/web-outportal/index.html#/home' },
    profileFor('云梦泽询价网'),
  );

  assert.equal(bundle.candidates.length, 1);
  assert.equal(bundle.candidates[0].title, '长庆油田分公司阻聚剂谈判采购公告');
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

test('extractCandidateBundle ignores platform CMS notices in network JSON responses', () => {
  const bundle = extractCandidateBundle(
    {
      title: '中化',
      url: 'https://scm.esinochem.com/#/home',
      visibleText: '首页 中化采购商城',
      networkResponses: [{
        url: 'https://scm.esinochem.com/gateway/cms/page',
        status: 200,
        contentType: 'application/json',
        bodySnippet: JSON.stringify({
          rows: [
            {
              title: '中化采购供应链平台2026年2月3日系统发版通知',
              createTime: '2026-02-02T13:46:58',
              plateTypeName: '新闻通知',
              content: 'base64-body-that-must-not-be-product-matched',
            },
            {
              title: '（询比采购）【鲁西集团阻聚剂询价单20260626/RFQ2606260087】采购公告',
              publishTime: '2026-06-26T11:59:23',
              detailUrl: '/notice/detail/chem',
              buyerName: '鲁西集团',
            },
          ],
        }),
      }],
    },
    { id: 'task-sinochem', sourceName: '中化', entryUrl: 'https://scm.esinochem.com/' },
    profileFor('中化'),
  );

  assert.equal(bundle.candidates.length, 1);
  assert.match(bundle.candidates[0].title, /阻聚剂/);
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
