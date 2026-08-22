import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectCncecPublicNotices,
  collectGuonengEgouFeeds,
  collectSinopecPublicNotices,
  readCncecPublicCandidateDetail,
  readSinopecPublicCandidateDetail,
} from './public-collectors.ts';

test('Guoneng Egou keeps a healthy public baseline when optional server-side search is WAF-blocked', async () => {
  const result = await collectGuonengEgouFeeds({
    task: {
      id: 'scheduled-guoneng-egou',
      sourceName: '国能E购',
      entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
      searchTerms: '阻聚剂',
    },
    now: new Date('2026-08-06T08:00:00+08:00'),
    minimumIntervalMs: 0,
    fetchImpl: (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('searchCmsArticleList')) {
        return new Response('WAF rejected', { status: 405 });
      }
      return new Response(JSON.stringify({
        rows: [{
          title: '国能化工白油采购询价公告',
          link: '/upload/cms/article/inquireOne/10001.html',
          publishTime: '2026-08-06',
          quotDeadline: '2026-08-09',
          publishArea: '化工中心',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.deepEqual(result.warnings, []);
});

test('EPEC merges chemical categories and keyword search while excluding expired duplicates', async () => {
  const active = {
    noticeId: 'notice-active', businessId: 'business-active', noticeAttachType: '01',
    noticeTitle: '中国石化阻聚剂 100 吨框架公开招标公告',
    releaseTime: '2026-08-09 08:00:00', saleEndTime: '2026-08-12 16:00:00',
    bidOpeningTime: '2026-08-15 09:00:00', noticeState: '进行中', majorName: '化工辅料',
    tenderOrganizationName: '中国石化测试分公司', attachUrl: 'static/test.txt',
  };
  const expired = {
    ...active, noticeId: 'notice-expired', noticeTitle: '已截止抗氧剂招标公告',
    saleEndTime: '2026-08-08 16:00:00', noticeState: '已截止',
  };
  const result = await collectSinopecPublicNotices({
    task: {
      id: 'scheduled-epec', sourceName: '易派克',
      entryUrl: 'https://bidding.epec.com/tenderInfoOne', searchTerms: '阻聚剂',
    },
    now: new Date('2026-08-09T12:00:00+08:00'),
    minimumIntervalMs: 0,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('queryNoticePageList')) {
        const body = JSON.parse(String(init?.body || '{}'));
        const rows = body.model.noticeTitle ? [active] : body.model.majorCode === '01' ? [active] : [expired];
        return Response.json({ code: '000000', data: { root: rows, totalCount: rows.length } });
      }
      return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.match(result.candidateBundle?.candidates[0]?.url || '', /notice-active/);
  assert.equal(result.discoveryStats?.expiredCount, 1);
  assert.equal(result.discoveryStats?.duplicateCount, 1);
});

test('EPEC detail reader preserves public notice facts and downloadable PDF', async () => {
  const result = await readSinopecPublicCandidateDetail({
    candidate: {
      title: '阻聚剂招标公告',
      url: 'https://bidding.epec.com/noticeDetail?noticeId=1&attachUrl=static%2Ftest.txt',
      published_at: '2026-08-09', deadline_at: '', buyer_name: '中国石化', raw_text: '', attachments: [],
    },
    fetchImpl: (async () => new Response(`
      <h2>阻聚剂 100 吨公开招标公告</h2>
      <p>招标人：中国石化测试分公司。投标文件截止时间：2026-08-15 09:00。</p>
      <object data="/gateway/c/dowload/fee/view/notice.pdf"></object>
    `, { status: 200 })) as typeof fetch,
  });

  assert.equal(result.deadline_at, '2026-08-15');
  assert.equal(result.buyer_name, '中国石化测试分公司');
  assert.equal(result.attachments.length, 1);
  assert.match(result.raw_text, /100 吨/);
});

test('CNCEC scans goods tender, inquiry and negotiation pages before keyword supplementation', async () => {
  const item = (id: string, title: string, published: string, deadline: string) => `
    <li><a href="/cms/channel/ywgg1hw/${id}.htm" title="${title}">
      <span class="bidTime"><input buyend="${deadline}"></span><span class="bidDate">${published}</span>
    </a></li>`;
  const active = item('1001', '新型化工助剂公开招标项目公告', '2026-08-09', '2026-08-15 14:00:00');
  const expired = item('1002', '抗氧剂询比项目公告', '2026-08-09', '2026-08-08 14:00:00');
  const result = await collectCncecPublicNotices({
    task: {
      id: 'scheduled-cncec', sourceName: '中国化学电子招标投标平台',
      entryUrl: 'https://bid.cncecyc.com/cms/channel/ywgg1hw/index.htm', searchTerms: '化工助剂',
    },
    now: new Date('2026-08-09T12:00:00+08:00'),
    minimumIntervalMs: 0,
    fetchImpl: (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/ywgg1hw/')) return new Response(active);
      if (href.includes('/ywgg3xj1/')) return new Response(expired.replace('ywgg1hw', 'ywgg3xj1'));
      if (href.includes('/ywgg3jt1/')) return new Response('<ul></ul>');
      return new Response(active);
    }) as typeof fetch,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.equal(result.discoveryStats?.expiredCount, 1);
  assert.equal(result.discoveryStats?.duplicateCount, 1);
  assert.match(result.summary || '', /招标、询比\/询价和竞判/);
});

test('CNCEC detail reader extracts qualification, deadline and buyer from public HTML', async () => {
  const result = await readCncecPublicCandidateDetail({
    candidate: {
      title: '分散剂询比项目公告', url: 'https://bid.cncecyc.com/cms/channel/ywgg3xj1/1001.htm',
      published_at: '2026-08-09', deadline_at: '', buyer_name: '中国化学工程集团', raw_text: '', attachments: [],
    },
    fetchImpl: (async () => new Response(`
      <div class="ninfo-title"><h2>分散剂 50 吨询比项目公告</h2></div>
      <div class="ninfo-con"><p>采购人为中国化学第七建设有限公司，现进行公开询比。</p>
      <p>申请人资格要求：化学云采注册供应商。递交响应文件截止时间：2026-08-16 14:00。</p>
      <a href="/files/specification.pdf">技术附件</a></div><div class="ip-link"></div>
    `, { status: 200 })) as typeof fetch,
  });

  assert.equal(result.deadline_at, '2026-08-16');
  assert.equal(result.buyer_name, '中国化学第七建设有限公司');
  assert.equal(result.attachments[0], 'https://bid.cncecyc.com/files/specification.pdf');
  assert.match(result.raw_text, /化学云采注册供应商/);
});
