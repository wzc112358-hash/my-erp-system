import assert from 'node:assert/strict';
import test from 'node:test';

import { definitionFor } from '../sites/registry.ts';
import {
  analyzeObservation,
  buildObservationArtifacts,
  extractCandidateBundle,
} from './extraction.ts';

test('extraction recognizes a CDP network challenge before parsing page noise', () => {
  const result = analyzeObservation({
    title: '全国招标公告公示搜索引擎',
    url: 'https://ctbpsp.com/#/bulletinList',
    visibleText: '登录 信息定制 加载中...',
    networkResponses: [{
      url: 'https://ctbpsp.com/cutominfoapi/searchkeyword',
      status: 200,
      contentType: 'text/html',
      challenge: true,
    }],
  }, definitionFor('裕龙招投标网'));
  assert.equal(result.status, 'request_human');
  assert.match(result.reason, /安全挑战/);
});

test('extraction keeps current Yulong product notices and rejects results', () => {
  const bundle = extractCandidateBundle({
    title: '裕龙招投标网',
    url: 'https://example.com/list',
    visibleText: [
      '2026-07-14 裕龙石化有限公司二甲基硅油采购招标公告',
      '2026-07-14 裕龙石化清洁用品中标结果公告',
    ].join('\n'),
  }, {
    id: 'task-yulong', sourceName: '裕龙招投标网', entryUrl: 'https://example.com/list',
  }, definitionFor('裕龙招投标网'));
  assert.equal(bundle.candidates.length, 1);
  assert.match(bundle.candidates[0]?.title || '', /硅油/);
});

test('extraction reads structured candidates from captured network JSON', () => {
  const bundle = extractCandidateBundle({
    title: '采购列表',
    url: 'https://example.com/list',
    visibleText: '采购列表',
    networkResponses: [{
      url: 'https://example.com/api/list',
      status: 200,
      contentType: 'application/json',
      bodySnippet: JSON.stringify({ rows: [{
        noticeTitle: '裕龙石化阻聚剂采购招标公告',
        detailUrl: '/notice/1',
        publishDate: '2026-07-14',
        buyerName: '裕龙石化',
      }] }),
    }],
  }, {
    id: 'task-network', sourceName: '裕龙招投标网', entryUrl: 'https://example.com/list',
  }, definitionFor('裕龙招投标网'));
  assert.equal(bundle.candidates.length, 1);
  assert.equal(bundle.candidates[0]?.url, 'https://example.com/notice/1');
});

test('extraction preserves browser list references for later detail reading', () => {
  const bundle = extractCandidateBundle({
    title: '中国石油招标投标网',
    url: 'https://www.cnpcbidding.com/#/tenders',
    visibleText: '2026-07-15 吉林石化公司丁二烯阻聚剂采购公开招标公告',
    searchQuery: '阻聚剂',
    listItems: [{
      title: '吉林石化公司丁二烯阻聚剂采购公开招标公告',
      elementId: 'hcz-18',
      publishedAt: '2026-07-15',
      noticeType: '招标公告',
      rawText: '吉林石化公司丁二烯阻聚剂采购公开招标公告 2026-07-15',
    }],
  }, {
    id: 'task-cnpc', sourceName: '中国石油招标投标网', entryUrl: 'https://www.cnpcbidding.com/#/tenders',
  }, definitionFor('中国石油招标投标网'));

  assert.equal(bundle.candidates[0]?.browser_ref, 'hcz-18');
  assert.equal(bundle.candidates[0]?.search_query, '阻聚剂');
  assert.equal(bundle.candidates[0]?.published_at, '2026-07-15');
});

test('extraction rejects expired YMz cards and does not rebuild page labels as notices', () => {
  const bundle = extractCandidateBundle({
    title: '云梦泽智慧平台',
    url: 'https://www.ymzec.com/bid/web-outportal/index.html#/trade-info?search=阻聚剂',
    visibleText: [
      '全部招标采购非招标采购',
      '类型：公开招标公告/资格预审公告',
      '吉林石化公司阻聚剂采购招标公告',
    ].join('\n'),
    listItems: [{
      title: '吉林石化公司阻聚剂采购招标公告',
      elementId: 'hcz-18',
      publishedAt: '2026-06-22',
      deadlineAt: '2026-07-03',
      rawText: '吉林石化公司阻聚剂采购招标公告 发布时间：2026-06-22 已截止',
    }],
  }, {
    id: 'task-ymz', sourceName: '云梦泽智慧平台',
    entryUrl: 'https://www.ymzec.com/bid/web-outportal/index.html#/home',
  }, definitionFor('云梦泽智慧平台'));

  assert.deepEqual(bundle.candidates, []);
});

test('extraction artifacts retain network evidence without credentials', () => {
  const artifacts = buildObservationArtifacts({
    title: '采购列表',
    url: 'https://example.com/list',
    visibleText: '阻聚剂采购公告',
    networkResponses: [{
      url: 'https://example.com/api/list', status: 200, contentType: 'application/json', bodySnippet: '{"rows":[]}',
    }],
  }, { id: 'task-1', sourceName: '测试站点', entryUrl: 'https://example.com/list' });
  assert.equal(artifacts[0]?.artifact_type, 'network_response');
  assert.doesNotMatch(artifacts[0]?.content || '', /cookie|authorization/i);
});

test('extraction maps Sinochem dates, buyer and signed PDF evidence', () => {
  const pdfUrl = 'https://scm.esinochem.com/files/notice.pdf?u=signed';
  const bundle = extractCandidateBundle({
    title: '中化采购供应链平台',
    url: 'https://scm.esinochem.com/#/home',
    visibleText: '采购公告',
    networkResponses: [{
      url: 'https://scm.esinochem.com/gateway/notice/list',
      status: 200,
      contentType: 'application/json',
      bodySnippet: JSON.stringify({ rows: [{
        noticeId: '1',
        title: '（询比采购）芥酸酰胺采购公告',
        noticeTypeName: '采购公告',
        createTime: '2026-07-15T21:45:17.000+08:00',
        endTime: '2026-07-17T19:00:00.000+08:00',
        purchaseCompanyName: '中化某公司',
        preSupFileId: pdfUrl,
      }] }),
    }],
  }, {
    id: 'task-sinochem', sourceName: '中化采购供应链平台', entryUrl: 'https://scm.esinochem.com/#/home',
  }, definitionFor('中化采购供应链平台'));

  assert.equal(bundle.candidates[0]?.published_at, '2026-07-15');
  assert.equal(bundle.candidates[0]?.deadline_at, '2026-07-17');
  assert.equal(bundle.candidates[0]?.buyer_name, '中化某公司');
  assert.ok(bundle.candidates[0]?.attachments.includes(pdfUrl));
});
