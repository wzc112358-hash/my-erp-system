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
