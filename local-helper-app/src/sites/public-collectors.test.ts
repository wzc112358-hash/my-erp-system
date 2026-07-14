import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectGuonengEgouFeeds,
  collectSinopecPublicHtml,
  collectSitePublicFeed,
} from './public-collectors.ts';

const task = {
  id: 'task-egou',
  sourceName: '国能E购',
  entryUrl: 'https://neep.shop/html/portal/index-Inquiries.html',
  searchTerms: '亚硫酸钠',
};

test('collectGuonengEgouFeeds extracts rows from public JSON feeds', async () => {
	  const result = await collectGuonengEgouFeeds({
	    task,
	    fetchImpl: (async (url: string | URL | Request) => {
	      const href = String(url);
	      if (href.includes('searchCmsArticleList')) {
	        return new Response('hczLocalHelper({"respCode":"0000","data":{"total":0,"pageNo":1,"rows":[],"recordsTotal":0}})', { status: 200 });
	      }
	      const title = href.includes('inquireBidding')
	        ? '竞价公告'
	        : href.includes('inquireTwo')
	          ? '竞争性谈判公告'
	          : href.includes('inquireUrgent')
	            ? '紧急直接零星采购公告'
	          : '询价采购公告';
	      return new Response(JSON.stringify({
	        rows: [{
          title: `${title} 亚硫酸氢钠采购项目采购`,
          link: '/upload/cms/article/inquireOne/10166184.html',
          publishTime: '2026-05-27',
          quotDeadline: '2026-05-31',
          publishArea: '化工中心',
        }],
      }), { status: 200 });
    }) as typeof fetch,
  });

	  assert.equal(result.status, 'success');
	  assert.equal(result.candidateBundle?.source_name, '国能E购');
	  assert.equal(result.candidateBundle?.candidates.length, 4);
	  assert.match(result.candidateBundle?.candidates[0].title || '', /亚硫酸氢钠/);
	  assert.equal(result.candidateBundle?.candidates[0].published_at, '2026-05-27');
	  assert.equal(result.candidateBundle?.candidates[0].deadline_at, '2026-05-31');
	  assert.equal(result.candidateBundle?.candidates[0].buyer_name, '化工中心');
	  assert.equal(result.artifacts.length, 4);
	});

test('collectGuonengEgouFeeds prepends site JSONP deep search matches', async () => {
  const result = await collectGuonengEgouFeeds({
    task: {
      ...task,
      searchTerms: '消泡剂',
    },
    now: new Date('2026-06-27T08:00:00+08:00'),
    fetchImpl: (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('searchCmsArticleList')) {
        const parsed = new URL(href);
        if (parsed.searchParams.get('inquireName') === '消泡剂' && parsed.searchParams.get('noticeType') === '1') {
          return new Response('hczLocalHelper({"respCode":"0000","data":{"total":1,"pageNo":1,"recordsTotal":1,"rows":[{"inquireName":"焦化公司西来峰焦化二厂2026年6月消泡剂询价采购","articleUrl":"https://gd-prod.oss-cn-beijing.aliyuncs.com/upload/cms/article/inquireOne/10180001.html","publishTimeString":"2026-06-27 12:00:00","quotDeadlineString":"2026-07-01 14:00:00","publishArea":"煤化工中心","inquireCode":"WZJM-WZXJ-2026060001"}]}})', { status: 200 });
        }
        return new Response('hczLocalHelper({"respCode":"0000","data":{"total":0,"pageNo":1,"rows":[],"recordsTotal":0}})', { status: 200 });
      }
      return new Response(JSON.stringify({
        rows: [{
          title: '天津公司检修工程询价采购',
          link: 'https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/article/inquireOne/10183168.html',
          publishTime: '2026-06-27 12:45:38',
          quotDeadline: '2026-07-01 14:00:00',
          publishArea: '经贸公司',
        }],
      }), { status: 200 });
    }) as typeof fetch,
  });

  assert.equal(result.status, 'success');
  assert.match(result.candidateBundle?.candidates[0].title || '', /消泡剂/);
  assert.equal(result.candidateBundle?.candidates[0].deadline_at, '2026-07-01');
  assert.equal(result.candidateBundle?.candidates[0].buyer_name, '煤化工中心');
  assert.match(result.artifacts.map((artifact) => artifact.title).join('\n'), /站内深搜 询价采购公告\/消泡剂/);
});

test('collectSinopecPublicHtml extracts active notice rows and filters result notices', async () => {
  const result = await collectSinopecPublicHtml({
    task: {
      id: 'task-sinopec',
      sourceName: '易派克',
      entryUrl: 'https://ec.sinopec.com/supp/index.shtml',
    },
    fetchImpl: (async () => new Response(`
      <div class="itemli">
        <div class="title">
          <a href="/f/supp/notice/bidNotice.do?id=1" title="
          中国石化催化剂有限公司2026年30吨二甲基硅油招标公告">二甲基硅油招标公告</a>
        </div>
        <div class="date">2026/06/26</div>
      </div>
      <div class="itemli">
        <div class="title">
          <a href="/f/supp/notice/resultNotice.do?id=2" title="中国石化采购结果公告">采购结果公告</a>
        </div>
        <div class="date">2026/06/26</div>
      </div>
    `, { status: 200 })) as typeof fetch,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.candidateBundle?.source_name, '易派克');
  assert.equal(result.candidateBundle?.candidates.length, 1);
  assert.match(result.candidateBundle?.candidates[0].title || '', /二甲基硅油/);
  assert.equal(result.candidateBundle?.candidates[0].published_at, '2026-06-26');
});

test('collectSitePublicFeed returns unsupported for generic sites', async () => {
  const result = await collectSitePublicFeed({
    task: {
      id: 'task-other',
      sourceName: '中化',
      entryUrl: 'https://example.com',
    },
  });

  assert.equal(result.status, 'unsupported');
  assert.equal(result.candidateBundle, null);
});
