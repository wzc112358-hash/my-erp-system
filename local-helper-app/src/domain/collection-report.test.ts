import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCollectionReport } from './collection-report.ts';
import type { ScreenedNotice } from './tender-screening.ts';
import type { HelperTask } from '../app/task-store.ts';

const card = (overrides: Partial<ScreenedNotice> = {}): ScreenedNotice => ({
  id: 'card-1',
  title: '云南公司循环水阻垢剂采购公告',
  sourceName: '国能E购',
  url: 'https://example.com/notice/1',
  buyerName: '云南公司',
  publishedAt: '2026-07-11',
  deadlineAt: '2026-07-13 13:30:00',
  matchedTerms: ['阻垢剂'],
  matchedSources: ['erp_history'],
  relevanceScore: 88,
  bidability: 'needs_manual_check',
  hardRequirements: ['需确认是否接受代理商'],
  riskFlags: [],
  missingInfo: ['未找到规格'],
  recommendedAction: 'send_to_group',
  evidenceText: '标题命中阻垢剂。',
  wechatSummary: '',
  confidence: 0.8,
  ...overrides,
});

const task = (overrides: Partial<HelperTask> = {}): HelperTask => ({
  id: 'task-1',
  sourceName: '国能E购',
  entryUrl: 'https://neep.shop/',
  status: 'completed',
  updatedAt: '2026-07-12T01:00:00.000Z',
  lastCandidateBundle: { source_name: '国能E购', candidates: [] },
  lastScreenedNotices: [],
  ...overrides,
});

test('collection report keeps only information selected for follow-up', () => {
  const report = buildCollectionReport(task({
    lastCandidateBundle: {
      source_name: '国能E购',
      candidates: [
        { title: '阻垢剂采购公告', url: '', published_at: '', deadline_at: '', buyer_name: '', raw_text: '', attachments: [] },
        { title: '办公用品采购公告', url: '', published_at: '', deadline_at: '', buyer_name: '', raw_text: '', attachments: [] },
      ],
    },
    lastScreenedNotices: [card(), card({ id: 'card-2', title: '办公用品采购公告', recommendedAction: 'ignore' })],
  }), '2026-07-12T01:00:00.000Z');

  assert.equal(report.status, 'has_matches');
  assert.equal(report.rawCount, 2);
  assert.equal(report.selectedCount, 1);
  assert.match(report.summary, /阻垢剂采购公告/);
  assert.doesNotMatch(report.summary, /办公用品/);
  assert.match(report.summary, /截止：2026-07-13/);
});

test('collection report produces a copy-ready no-match conclusion', () => {
  const report = buildCollectionReport(task(), '2026-07-12T01:00:00.000Z');
  assert.equal(report.status, 'no_matches');
  assert.match(report.summary, /今日已巡检/);
  assert.match(report.summary, /未筛选出/);
});

test('collection report excludes notices whose Shanghai deadline has passed', () => {
  const report = buildCollectionReport(task({
    lastScreenedNotices: [card({ deadlineAt: '2026-07-07 16:00:00' })],
  }), '2026-07-12T01:00:00.000Z');

  assert.equal(report.status, 'no_matches');
  assert.equal(report.expiredCount, 1);
  assert.equal(report.selectedCount, 0);
  assert.doesNotMatch(report.summary, /阻垢剂采购公告/);
});

test('collection report treats a date-only deadline as the end of that Shanghai day', () => {
  const report = buildCollectionReport(task({
    lastScreenedNotices: [card({ deadlineAt: '2026-07-12' })],
  }), '2026-07-12T01:00:00.000Z');

  assert.equal(report.status, 'has_matches');
  assert.equal(report.expiredCount, 0);
  assert.equal(report.selectedCount, 1);
});

test('collection report never publishes award results even when a keyword matcher selected them', () => {
  const report = buildCollectionReport(task({
    sourceName: '易派克',
    lastScreenedNotices: [card({
      title: '茂名三万吨 PAO 装置齿轮泵评标结果公示',
      deadlineAt: '',
    })],
  }), '2026-07-12T01:00:00.000Z');

  assert.equal(report.status, 'no_matches');
  assert.equal(report.selectedCount, 0);
  assert.doesNotMatch(report.summary, /齿轮泵/);
});

test('collection report explains when browser agent needs an employee', () => {
  const report = buildCollectionReport(task({
    sourceName: '裕龙招投标网',
    status: 'waiting_agent',
    lastLog: '需要人工处理：请完成网易安全验证后继续。',
  }));
  assert.equal(report.status, 'needs_human');
  assert.match(report.summary, /网易安全验证/);
});

test('collection report keeps the employee instruction concise when logs contain technical context', () => {
  const report = buildCollectionReport(task({
    sourceName: '裕龙招投标网',
    status: 'waiting_agent',
    lastLog: 'Agent 已开始搜索。需要人工处理：ReAct Agent 已完成 2 轮。检测到安全验证，需要员工完成网易盾/滑块验证。当前地址：https://example.com 结果摘要：很多技术信息',
  }));

  assert.match(report.summary, /检测到安全验证/);
  assert.doesNotMatch(report.summary, /当前地址|结果摘要|https/);
});
