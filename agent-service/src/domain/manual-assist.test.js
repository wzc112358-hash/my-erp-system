import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalHelperTaskShape,
  buildManualAssistTask,
  requiredArtifactForReason,
  shouldCreateManualAssistTask,
} from './manual-assist.js';

test('requiredArtifactForReason maps login and captcha reasons to useful artifacts', () => {
  assert.equal(requiredArtifactForReason('需要账号登录后查看详情'), '登录后的页面截图、详情页正文或附件');
  assert.equal(requiredArtifactForReason('可能有验证码'), '员工完成验证后的页面截图、DOM或附件');
  assert.equal(requiredArtifactForReason('需要购买标书'), '购买后的标书文件或公告正文');
});

test('shouldCreateManualAssistTask returns true for login/captcha/manual/local sources', () => {
  assert.equal(shouldCreateManualAssistTask({ requires_login: true }), true);
  assert.equal(shouldCreateManualAssistTask({ may_have_captcha: true }), true);
  assert.equal(shouldCreateManualAssistTask({ crawl_strategy: 'manual_assist' }), true);
  assert.equal(shouldCreateManualAssistTask({ crawl_strategy: 'local_helper' }), true);
  assert.equal(shouldCreateManualAssistTask({ crawl_strategy: 'http_html', requires_login: false }), false);
});

test('buildManualAssistTask creates a structured task payload for ERP', () => {
  const task = buildManualAssistTask({
    source: {
      id: 'src1',
      source_name: '云梦泽询价网',
      owner_name: '小陈',
      crawl_strategy: 'manual_assist',
      manual_assist_reason: '账号登录后搜索询价',
    },
    run: { id: 'run1' },
    now: new Date('2026-05-25T09:00:00+08:00'),
  });

  assert.equal(task.source, 'src1');
  assert.equal(task.monitor_run, 'run1');
  assert.equal(task.owner_name, '小陈');
  assert.equal(task.task_type, 'manual_assist');
  assert.equal(task.status, 'pending');
  assert.equal(task.reason, '账号登录后搜索询价');
  assert.equal(task.required_artifact, '登录后的页面截图、详情页正文或附件');
  assert.equal(task.due_at, '2026-05-25T09:30:00.000+08:00');
});

test('buildManualAssistTask creates actionable remote-login instructions', () => {
  const task = buildManualAssistTask({
    source: {
      id: 'src-login',
      source_name: '易派克',
      owner_name: '小冯',
      source_url: 'https://ec.sinopec.com/supp/index.shtml',
      category_urls: 'https://ec.sinopec.com/supp/notice.shtml',
      crawl_strategy: 'playwright_network',
      requires_login: true,
      may_have_captcha: true,
      keywords: '缓蚀剂,阻垢剂,聚丙烯酰胺',
      manual_assist_reason: '账号内容、8位码和材料详情需要人工协助确认。',
    },
    run: { id: 'run-login' },
    now: new Date('2026-05-25T09:00:00+08:00'),
  });

  assert.equal(task.entry_url, 'https://ec.sinopec.com/supp/notice.shtml');
  assert.equal(task.session_status, 'login_required');
  assert.equal(task.browser_url, '');
  assert.equal(task.search_terms, '缓蚀剂,阻垢剂,聚丙烯酰胺');
  assert.match(task.action_steps, /1\. 打开远程浏览器会话/);
  assert.match(task.action_steps, /2\. 完成账号登录/);
  assert.match(task.action_steps, /4\. 搜索关键词：缓蚀剂,阻垢剂,聚丙烯酰胺/);
  assert.match(task.action_steps, /5\. 打开疑似相关公告/);
  assert.equal(task.last_attempt_at, '2026-05-25T09:00:00.000+08:00');
});

test('buildLocalHelperTaskShape exposes the future desktop helper polling contract', () => {
  const task = buildLocalHelperTaskShape({
    source: {
      id: 'src2',
      source_name: '中石油招投标网',
      owner_name: '小陈',
      source_url: 'https://example.com',
      credential_ref: 'secret:cnpc:xiaochen',
    },
  });

  assert.equal(task.source_id, 'src2');
  assert.equal(task.source_name, '中石油招投标网');
  assert.equal(task.owner_name, '小陈');
  assert.equal(task.entry_url, 'https://example.com');
  assert.equal(task.credential_ref, 'secret:cnpc:xiaochen');
  assert.deepEqual(task.upload_slots, ['dom_snapshot', 'network_response', 'screenshot', 'attachment', 'manual_text']);
});
