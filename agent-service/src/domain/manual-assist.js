const formatShanghaiIso = (date) => {
  const offsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  return `${local.toISOString().replace('Z', '')}+08:00`;
};

export const requiredArtifactForReason = (reason = '') => {
  if (/购买|买标书|标书/.test(reason)) return '购买后的标书文件或公告正文';
  if (/验证码|验证|短信|CA|ca/.test(reason)) return '员工完成验证后的页面截图、DOM或附件';
  if (/登录|账号/.test(reason)) return '登录后的页面截图、详情页正文或附件';
  return '公告正文、页面截图、附件或可复制文本';
};

export const entryUrlForSource = (source = {}, opportunity = null) => {
  const categoryUrl = String(source.category_urls || '')
    .split(/[,，\n]+/)
    .map((url) => url.trim())
    .filter(Boolean)[0];
  return categoryUrl || source.source_url || opportunity?.url || '';
};

export const searchTermsForSource = (source = {}) => {
  const terms = String(source.keywords || '')
    .split(/[,，\n]+/)
    .map((term) => term.trim())
    .filter(Boolean);
  return terms.slice(0, 12).join(',');
};

export const sessionStatusForSource = (source = {}) => {
  if (source.requires_login || source.may_have_captcha || source.login_type === 'account') {
    return 'login_required';
  }
  if (['playwright_dom', 'playwright_network', 'local_helper'].includes(source.crawl_strategy)) {
    return 'not_started';
  }
  return '';
};

export const actionStepsForSource = (source = {}, reason = '') => {
  const searchTerms = searchTermsForSource(source);
  const entryUrl = entryUrlForSource(source);
  return [
    '1. 打开远程浏览器会话。',
    `2. 完成账号登录${source.may_have_captcha ? '、验证码或短信验证' : ''}。`,
    `3. 进入监测入口：${entryUrl || '按网站监测源配置进入对应栏目'}。`,
    `4. 搜索关键词：${searchTerms || '按监测源关键词搜索化工品/助剂相关公告'}。`,
    '5. 打开疑似相关公告，确认能看到标题、截止日期、采购单位和附件入口。',
    '6. 保存会话并返回 ERP；后端 Agent 将复用该登录态继续巡检。',
    reason ? `原因：${reason}` : '',
  ].filter(Boolean).join('\n');
};

export const shouldCreateManualAssistTask = (source = {}) => (
  source.status === 'manual_required' ||
  source.requires_login === true ||
  source.may_have_captcha === true ||
  ['manual_assist', 'local_helper', 'playwright_dom', 'playwright_network'].includes(source.crawl_strategy)
);

export const buildManualAssistTask = ({
  source = {},
  run = {},
  opportunity = null,
  reason,
  now = new Date(),
} = {}) => {
  const resolvedReason = reason ||
    source.manual_assist_reason ||
    (source.may_have_captcha ? '可能需要验证码或人工验证' : '') ||
    (source.requires_login ? '需要账号登录后查看详情' : '') ||
    '该来源需要人工协助采集';
  const dueAt = new Date(now.getTime() + 30 * 60 * 1000);
  const taskType = source.crawl_strategy === 'local_helper' ? 'local_helper' : 'manual_assist';
  const entryUrl = entryUrlForSource(source, opportunity);
  const searchTerms = searchTermsForSource(source);

  return {
    source: source.id || '',
    monitor_run: run.id || '',
    opportunity: opportunity?.id || '',
    source_name: source.source_name || opportunity?.source_name || '',
    owner_name: source.owner_name || opportunity?.owner_name || '',
    task_type: taskType,
    status: 'pending',
    reason: resolvedReason,
    required_artifact: requiredArtifactForReason(resolvedReason),
    entry_url: entryUrl,
    action_steps: actionStepsForSource(source, resolvedReason),
    search_terms: searchTerms,
    session_status: sessionStatusForSource(source),
    browser_url: '',
    last_attempt_at: formatShanghaiIso(now),
    due_at: formatShanghaiIso(dueAt),
    result_summary: '',
  };
};

export const buildLocalHelperTaskShape = ({ source = {}, task = {} } = {}) => ({
  task_id: task.id || '',
  source_id: source.id || task.source || '',
  source_name: source.source_name || task.source_name || '',
  owner_name: source.owner_name || task.owner_name || '',
  entry_url: source.source_url || task.entry_url || '',
  credential_ref: source.credential_ref || '',
  required_artifact: task.required_artifact || requiredArtifactForReason(task.reason || ''),
  upload_slots: ['dom_snapshot', 'network_response', 'screenshot', 'attachment', 'manual_text'],
});
