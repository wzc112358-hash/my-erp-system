'use strict';

const params = new URLSearchParams(location.search);
const apiBase = (params.get('api') || 'http://127.0.0.1:17321').replace(/\/+$/, '');
let selectedTaskId = params.get('taskId') || '';
let tasks = [];
let profiles = [];
let schedules = [];
let busy = false;
const expandedGroups = new Set(JSON.parse(localStorage.getItem('hcz-expanded-task-groups') || '[]'));
const knownGroups = new Set();
let lastSelectedTask = null;
let siteSelectInitialized = false;
let llmSettingsInitialized = false;
let feedbackLearning = null;
let priorityBoard = null;
let scheduleSiteInitialized = false;
let agentTools = null;
let activeSidebarPanel = localStorage.getItem('hcz-active-sidebar-panel') || 'tasks';
let agentRuns = [];
let selectedAgentRunId = localStorage.getItem('hcz-selected-agent-run-id') || '';
const agentRunDetails = new Map();

const $ = (id) => document.getElementById(id);
const railNav = $('railNav');
const sidebarTitle = $('sidebarTitle');
const taskList = $('taskList');
const detail = $('detail');
const notice = $('notice');
const releaseNotice = $('releaseNotice');
const cloudState = $('cloudState');
const refreshButton = $('refresh');
const createTaskForm = $('createTaskForm');
const llmSettingsForm = $('llmSettingsForm');
const llmBaseUrl = $('llmBaseUrl');
const llmModel = $('llmModel');
const llmApiKey = $('llmApiKey');
const llmEnabled = $('llmEnabled');
const llmState = $('llmState');
const testLLM = $('testLLM');
const feedbackLearningState = $('feedbackLearningState');
const clearFeedbackLearning = $('clearFeedbackLearning');
const priorityBoardState = $('priorityBoardState');
const copyPriorityReport = $('copyPriorityReport');
const agentToolsState = $('agentToolsState');
const scheduleForm = $('scheduleForm');
const scheduleSiteSelect = $('scheduleSiteSelect');
const scheduleCustomSourceName = $('scheduleCustomSourceName');
const scheduleTimes = $('scheduleTimes');
const scheduleRunMode = $('scheduleRunMode');
const scheduleSearchTerms = $('scheduleSearchTerms');
const scheduleEntryUrl = $('scheduleEntryUrl');
const scheduleActionSteps = $('scheduleActionSteps');
const scheduleEnabled = $('scheduleEnabled');
const scheduleList = $('scheduleList');
const scheduleState = $('scheduleState');
const siteSelect = $('siteSelect');
const customSourceName = $('customSourceName');
const searchTerms = $('searchTerms');
const entryUrl = $('entryUrl');
const actionSteps = $('actionSteps');

const sidebarPanels = {
  tasks: '本地采集任务',
  agent: 'Agent 设置',
  schedule: '自动巡检',
  insights: '商机看板',
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const statusLabel = (status) => ({
  pending: '待处理',
  running: '采集中',
  waiting_agent: '等待继续',
  cancelled: '已取消',
  completed: '已完成',
  failed: '失败',
}[status] || status || '未知');

const agentRunStatusLabel = (status) => ({
  running: '运行中',
  request_human: '等待人工',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}[status] || status || '未知');

const phaseLabel = (phase) => ({
  plan: '计划',
  discover: '发现',
  browser: '浏览器',
  extract: '提取',
  assess: '研判',
  summarize: '摘要',
  human: '人工',
  complete: '完成',
  error: '错误',
}[phase] || phase || '步骤');

const groupTasks = (items) => {
  const groups = new Map();
  for (const task of items) {
    const key = task.sourceName || '未命名站点';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  return [...groups.entries()]
    .map(([sourceName, groupTasks]) => ({ sourceName, tasks: groupTasks }))
    .sort((left, right) => {
      const leftUpdated = left.tasks[0]?.updatedAt || '';
      const rightUpdated = right.tasks[0]?.updatedAt || '';
      return String(rightUpdated).localeCompare(String(leftUpdated));
    });
};

const showNotice = (message, bad = false) => {
  notice.textContent = message || '';
  notice.className = `notice${message ? ' show' : ''}${bad ? ' bad' : ''}`;
};

const setActiveSidebarPanel = (panel, { persist = true } = {}) => {
  activeSidebarPanel = sidebarPanels[panel] ? panel : 'tasks';
  if (persist) localStorage.setItem('hcz-active-sidebar-panel', activeSidebarPanel);
  if (sidebarTitle) sidebarTitle.textContent = sidebarPanels[activeSidebarPanel];
  for (const section of document.querySelectorAll('[data-panel]')) {
    section.classList.toggle('active', section.dataset.panel === activeSidebarPanel);
  }
  for (const button of document.querySelectorAll('[data-panel-target]')) {
    const active = button.dataset.panelTarget === activeSidebarPanel;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
};

const showReleaseNotice = (release) => {
  if (!release || (!release.updateAvailable && !release.updateRequired)) {
    releaseNotice.innerHTML = '';
    releaseNotice.className = 'notice update';
    return;
  }
  const portable = release.portableUrl
    ? `<a href="${escapeHtml(release.portableUrl)}" target="_blank" rel="noreferrer">下载免安装包</a>`
    : '';
  const installer = release.installerUrl
    ? `<a href="${escapeHtml(release.installerUrl)}" target="_blank" rel="noreferrer">下载安装包</a>`
    : '';
  const links = [portable, installer].filter(Boolean).join(' · ');
  releaseNotice.innerHTML = `
    ${release.updateRequired ? '当前版本过旧，请升级本地采集 Agent 后继续。' : '发现本地采集 Agent 新版本，建议升级。'}
    ${release.latestVersion ? `最新版本：${escapeHtml(release.latestVersion)}。` : ''}
    ${links ? `<span>${links}</span>` : ''}
  `;
  releaseNotice.className = `notice update show${release.updateRequired ? ' required' : ''}`;
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
};

const compactJson = (value, limit = 900) => {
  if (value === undefined || value === null || value === '') return '';
  const text = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;
};

const compactInline = (value, limit = 160) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const tailLength = Math.min(24, Math.floor(limit / 3));
  const headLength = Math.max(0, limit - tailLength - 5);
  return `${text.slice(0, headLength)} ... ${text.slice(-tailLength)}`;
};

const compactBlock = (value, limit = 1800) => {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  const tailLength = Math.min(240, Math.floor(limit / 4));
  const headLength = Math.max(0, limit - tailLength - 18);
  return `${text.slice(0, headLength)}\n\n...[truncated]\n\n${text.slice(-tailLength)}`;
};

const compactUrl = (url, limit = 120) => {
  const text = String(url || '').trim();
  return compactInline(text, text.startsWith('data:') ? Math.min(limit, 110) : limit);
};

const renderUrlLink = (url, emptyText = '暂无链接') => {
  if (!url) return emptyText;
  return `<a href="${escapeHtml(url)}" title="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(compactUrl(url))}</a>`;
};

const agentRunsForTask = (taskId) => agentRuns
  .filter((run) => run.taskId === taskId)
  .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));

const loadAgentRunDetail = async (runId, { renderAfter = true } = {}) => {
  if (!runId) return null;
  selectedAgentRunId = runId;
  localStorage.setItem('hcz-selected-agent-run-id', runId);
  if (!agentRunDetails.has(runId)) {
    agentRunDetails.set(runId, await requestJson(`/agent-runs/${encodeURIComponent(runId)}`));
  }
  if (renderAfter) render();
  return agentRunDetails.get(runId);
};

const copyTextToClipboard = async (text) => {
  if (!text) throw new Error('没有可复制的内容。');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('剪贴板不可用，请手动复制结果摘要。');
};

const copyWechatText = async (path, successMessage) => {
  const body = await requestJson(path);
  await copyTextToClipboard(body.text || '');
  return successMessage;
};

const renderLLMSettings = (settings = {}) => {
  if (!llmSettingsInitialized) {
    llmBaseUrl.value = settings.baseUrl || '';
    llmModel.value = settings.model || '';
    llmEnabled.checked = settings.enabled !== false && Boolean(settings.baseUrl || settings.model || settings.hasApiKey);
    llmSettingsInitialized = true;
  }
  llmState.textContent = settings.hasApiKey
    ? `已配置${settings.model ? ` · ${settings.model}` : ''}`
    : '未配置 key';
};

const renderFeedbackLearning = (learning = {}) => {
  feedbackLearning = learning;
  const topPositive = (learning.topPositiveTerms || [])
    .slice(0, 3)
    .map((item) => `${escapeHtml(item.term)} +${escapeHtml(item.weightDelta)}`)
    .join('，');
  const topNegative = (learning.topNegativeTerms || [])
    .slice(0, 3)
    .map((item) => `${escapeHtml(item.term)} ${escapeHtml(item.weightDelta)}`)
    .join('，');
  feedbackLearningState.innerHTML = [
    `已学习 ${escapeHtml(learning.termCount || 0)} 个词，${escapeHtml(learning.noticeCount || 0)} 条公告反馈。`,
    `正向 ${escapeHtml(learning.positiveCount || 0)}，负向 ${escapeHtml(learning.negativeCount || 0)}。`,
    topPositive ? `加权：${topPositive}` : '',
    topNegative ? `降权：${topNegative}` : '',
  ].filter(Boolean).join('<br>');
  clearFeedbackLearning.disabled = busy || !(learning.termCount || learning.noticeCount);
};

const renderPriorityBoard = (board = {}) => {
  priorityBoard = board;
  const items = board.items || [];
  if (!items.length) {
    priorityBoardState.innerHTML = '暂无需要优先处理的商机';
  } else {
    priorityBoardState.innerHTML = `
      <div class="muted">建议优先处理 ${escapeHtml(board.actionableCount || items.length)} 条，高优先级 ${escapeHtml(board.highCount || 0)} 条。</div>
      <ul class="priority-mini">
        ${items.slice(0, 3).map((item, index) => `
          <li>
            <strong>${index + 1}. ${escapeHtml(item.card?.title || '')}</strong>
            <span class="muted">${escapeHtml(item.sourceName || '')} · 优先级 ${escapeHtml(item.priorityScore ?? 0)}/100</span>
            <span class="muted">${escapeHtml(item.nextStep || '')}</span>
          </li>
        `).join('')}
      </ul>
    `;
  }
  copyPriorityReport.disabled = busy || !items.length;
};

const renderAgentTools = (state = {}) => {
  agentTools = state;
  const tools = state.tools || [];
  const servers = state.mcpServers || [];
  if (!tools.length && !servers.length) {
    agentToolsState.innerHTML = '暂无工具状态';
    return;
  }
  const readyCount = servers.filter((server) => server.status === 'ready').length;
  agentToolsState.innerHTML = [
    `<div class="muted">内置工具 ${escapeHtml(tools.length)} 个，MCP 就绪 ${escapeHtml(readyCount)}/${escapeHtml(servers.length)}。</div>`,
    servers.length ? `
      <ul class="priority-mini">
        ${servers.map((server) => `
          <li>
            <strong>${escapeHtml(server.label || server.id)}</strong>
            <span class="muted">${server.status === 'ready' ? '可用' : `fallback · 缺少 ${escapeHtml((server.missingEnv || []).join(', ') || '配置')}`}</span>
            <span class="muted">${escapeHtml(server.fallbackAdapter || '')}</span>
          </li>
        `).join('')}
      </ul>
    ` : '',
  ].filter(Boolean).join('');
};

const llmSettingsPayload = ({ includeBlankKey = false } = {}) => {
  const payload = {
    enabled: llmEnabled.checked,
    baseUrl: llmBaseUrl.value.trim(),
    model: llmModel.value.trim(),
  };
  const key = llmApiKey.value.trim();
  if (key || includeBlankKey) payload.apiKey = key;
  return payload;
};

const selectedTask = () => tasks.find((task) => task.id === selectedTaskId) || null;
const profileByName = (sourceName) => profiles.find((profile) => profile.sourceName === sourceName) || null;

const saveExpandedGroups = () => {
  localStorage.setItem('hcz-expanded-task-groups', JSON.stringify([...expandedGroups]));
};

const applyProfileDefaults = (sourceName, { force = false } = {}) => {
  const profile = profileByName(sourceName);
  if (!profile) return;
  customSourceName.value = '';
  if (force || !entryUrl.value.trim()) entryUrl.value = profile.entryUrl || '';
  if (force || !searchTerms.value.trim()) searchTerms.value = profile.defaultSearchTerms || '';
  if (force || !actionSteps.value.trim()) actionSteps.value = profile.defaultActionSteps || '';
};

const applyScheduleProfileDefaults = (sourceName, { force = false } = {}) => {
  const profile = profileByName(sourceName);
  if (!profile) return;
  scheduleCustomSourceName.value = '';
  if (force || !scheduleEntryUrl.value.trim()) scheduleEntryUrl.value = profile.entryUrl || '';
  if (force || !scheduleSearchTerms.value.trim()) scheduleSearchTerms.value = profile.defaultSearchTerms || '';
  if (force || !scheduleActionSteps.value.trim()) scheduleActionSteps.value = profile.defaultActionSteps || '';
};

const renderProfileOptions = () => {
  const current = siteSelect.value;
  const scheduleCurrent = scheduleSiteSelect.value;
  const options = [
    '<option value="">自定义站点</option>',
    ...profiles.map((profile) => (
      `<option value="${escapeHtml(profile.sourceName)}">${escapeHtml(profile.sourceName)}</option>`
    )),
  ].join('');
  siteSelect.innerHTML = options;
  scheduleSiteSelect.innerHTML = options;
  if (!siteSelectInitialized && profiles.length) {
    siteSelect.value = profiles[0].sourceName;
    siteSelectInitialized = true;
    applyProfileDefaults(siteSelect.value);
  } else {
    siteSelect.value = profiles.some((profile) => profile.sourceName === current) ? current : '';
  }
  if (!scheduleSiteInitialized && profiles.length) {
    scheduleSiteSelect.value = profiles[0].sourceName;
    scheduleTimes.value = scheduleTimes.value || '09:00,15:00';
    scheduleSiteInitialized = true;
    applyScheduleProfileDefaults(scheduleSiteSelect.value);
  } else {
    scheduleSiteSelect.value = profiles.some((profile) => profile.sourceName === scheduleCurrent) ? scheduleCurrent : '';
  }
};

const runModeLabel = (mode) => ({
  agent: 'Agent 自动发现',
  open_browser: '打开浏览器',
  create_task_only: '只创建任务',
}[mode] || mode || 'Agent 自动发现');

const renderSchedules = () => {
  scheduleState.textContent = schedules.length ? `${schedules.length} 个计划` : '暂无计划';
  if (!schedules.length) {
    scheduleList.innerHTML = '<div class="muted">暂无每日巡检计划。</div>';
    return;
  }
  scheduleList.innerHTML = schedules.map((schedule) => `
    <div class="task-item">
      <div class="task-title">
        <strong>${escapeHtml(schedule.sourceName || '未命名站点')}</strong>
        <span class="status ${schedule.enabled ? 'completed' : 'cancelled'}">${schedule.enabled ? '启用' : '停用'}</span>
      </div>
      <div class="muted">${escapeHtml((schedule.times || []).join(', ') || '未设置时间')} · ${escapeHtml(runModeLabel(schedule.runMode))}</div>
      <div class="muted">${escapeHtml(schedule.searchTerms || '未设置搜索词')}</div>
      ${schedule.lastRunAt ? `<div class="muted">上次：${escapeHtml(schedule.lastRunAt)} · ${escapeHtml(schedule.lastStatus || '')}</div>` : ''}
      <div class="settings-actions">
        <button type="button" data-schedule-action="run-now" data-schedule-id="${escapeHtml(schedule.id)}">立即运行</button>
        <button type="button" data-schedule-action="edit" data-schedule-id="${escapeHtml(schedule.id)}">编辑</button>
        <button type="button" data-schedule-action="delete" data-schedule-id="${escapeHtml(schedule.id)}">删除</button>
      </div>
    </div>
  `).join('');
  for (const button of scheduleList.querySelectorAll('button')) {
    button.disabled = busy;
  }
};

const renderList = () => {
  taskList.innerHTML = '';
  if (!tasks.length) {
    taskList.innerHTML = '<div class="muted">暂无本地任务，新建后开始采集。</div>';
    return;
  }
  const groups = groupTasks(tasks);
  for (const group of groups) {
    if (!knownGroups.has(group.sourceName)) knownGroups.add(group.sourceName);
    const section = document.createElement('section');
    section.className = 'task-group';
    const hasSelectedTask = group.tasks.some((task) => task.id === selectedTaskId);
    const open = hasSelectedTask || expandedGroups.has(group.sourceName);
    const completedCount = group.tasks.filter((task) => task.status === 'completed').length;
    const activeCount = group.tasks.filter((task) => ['pending', 'running', 'waiting_agent'].includes(task.status)).length;
    section.innerHTML = `
      <button class="group-toggle" data-group="${escapeHtml(group.sourceName)}" aria-expanded="${open ? 'true' : 'false'}">
        <span class="group-arrow">${open ? '▾' : '▸'}</span>
        <span class="group-name">${escapeHtml(group.sourceName)}</span>
        <span class="group-meta">${activeCount} 待办 · ${completedCount} 完成</span>
        <span class="group-count">${group.tasks.length}</span>
      </button>
      <div class="group-body"${open ? '' : ' hidden'}></div>
    `;
    const body = section.querySelector('.group-body');
    for (const task of group.tasks) {
      const button = document.createElement('button');
      button.className = `task-item${task.id === selectedTaskId ? ' selected' : ''}`;
      button.dataset.taskId = task.id;
      button.innerHTML = `
        <div class="task-title">
          <strong>${escapeHtml(task.searchTerms || task.ownerName || '本地采集')}</strong>
          <span class="status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
        </div>
        <div class="muted" title="${escapeHtml(task.entryUrl || '')}">${escapeHtml(task.entryUrl ? compactUrl(task.entryUrl) : '未提供入口 URL')}</div>
        <div class="muted">${escapeHtml(task.updatedAt || '')}</div>
      `;
      body.appendChild(button);
    }
    taskList.appendChild(section);
  }
};

const renderCandidates = (task) => {
  const candidates = task.lastCandidateBundle?.candidates || [];
  if (!candidates.length) return '<div class="value">暂无候选结果</div>';
  return `
    <ul class="candidate-list">
      ${candidates.map((candidate) => `
        <li>
          <strong>${escapeHtml(candidate.title)}</strong>
          <div class="muted">${escapeHtml(candidate.buyer_name || '采购方待确认')} · ${escapeHtml(candidate.published_at || '发布日期待确认')} · 截止 ${escapeHtml(candidate.deadline_at || '待确认')}</div>
          <div class="muted">${renderUrlLink(candidate.url)}</div>
        </li>
      `).join('')}
    </ul>
  `;
};

const actionLabel = (action) => ({
  send_to_group: '发群确认',
  deep_read_document: '查附件/详情',
  ignore: '可跳过',
  ask_boss: '人工判断',
  track_deadline: '跟踪截止',
}[action] || action || '待判断');

const feedbackLabel = (status) => ({
  valuable: '有价值',
  irrelevant: '不相关',
  ask_boss: '待老板',
  sent_to_group: '已发群',
  followed_up: '已跟进',
}[status] || '');

const renderDocumentSummaries = (card) => {
  const documents = card.documentSummaries || [];
  if (!documents.length && !card.deepReadAt) return '';
  return `
    <div class="deep-read-box">
      <div class="muted">${card.deepReadAt ? `已查清楚：${escapeHtml(card.deepReadAt)}` : '已执行深读'}</div>
      ${card.detailScreenshotPath ? `<div class="muted">截图：${escapeHtml(card.detailScreenshotPath)}</div>` : ''}
      ${documents.length ? `
        <ul>
          ${documents.map((document) => `
            <li>
              <strong>${escapeHtml(document.title || '附件')}</strong>
              ${document.warning ? `<div class="muted">${escapeHtml(document.warning)}</div>` : ''}
              ${document.textSnippet ? `<p>${escapeHtml(compactBlock(document.textSnippet, 700))}</p>` : ''}
              ${document.url ? `<div class="muted">${renderUrlLink(document.url)}</div>` : ''}
            </li>
          `).join('')}
        </ul>
      ` : ''}
    </div>
  `;
};

const renderOpportunityCards = (task) => {
  const cards = task.lastOpportunityCards || [];
  if (!cards.length) return '<div class="value">暂无商机卡片</div>';
  return `
    <div class="opportunity-list">
      ${cards.map((card, index) => `
        <article class="opportunity-card ${escapeHtml(card.recommendedAction || '')}">
          <div class="opportunity-head">
            <div>
              <strong>${escapeHtml(card.title)}</strong>
              <div class="muted">${escapeHtml(card.buyerName || '采购方待确认')} · ${escapeHtml(card.publishedAt || '发布日期待确认')} · 截止 ${escapeHtml(card.deadlineAt || '待确认')}</div>
            </div>
            <span class="score">${escapeHtml(card.relevanceScore ?? 0)}</span>
          </div>
          <div class="pill-row">
            <span class="pill">${escapeHtml(actionLabel(card.recommendedAction))}</span>
            ${(card.matchedTerms || []).slice(0, 6).map((term) => `<span class="pill soft">${escapeHtml(term)}</span>`).join('')}
          </div>
          <div class="card-actions">
            <button data-action="copy-card-wechat" data-card-index="${index}">复制群消息</button>
            <button data-action="deep-read" data-card-index="${index}"${card.url ? '' : ' disabled title="这条商机没有详情链接"'}>查清楚</button>
          </div>
          <div class="feedback-actions">
            <span class="feedback-state">${card.feedbackStatus ? `反馈：${escapeHtml(feedbackLabel(card.feedbackStatus))}` : '未反馈'}</span>
            ${[
              ['valuable', '有价值'],
              ['irrelevant', '不相关'],
              ['ask_boss', '待老板'],
              ['sent_to_group', '已发群'],
              ['followed_up', '已跟进'],
            ].map(([status, label]) => `
              <button
                class="mini${card.feedbackStatus === status ? ' selected' : ''}"
                data-action="feedback"
                data-card-index="${index}"
                data-feedback-status="${status}"
              >${label}</button>
            `).join('')}
          </div>
          <div class="card-grid">
            <div>
              <label>证据</label>
              <p>${escapeHtml(compactBlock(card.evidenceText || '暂无证据', 700))}</p>
            </div>
            <div>
              <label>需确认</label>
              <p>${escapeHtml((card.missingInfo || []).join('；') || '暂无')}</p>
            </div>
            <div>
              <label>风险/要求</label>
              <p>${escapeHtml([...(card.hardRequirements || []), ...(card.riskFlags || [])].slice(0, 4).join('；') || '暂无')}</p>
            </div>
            <div>
              <label>微信群摘要</label>
              <pre>${escapeHtml(compactBlock(card.wechatSummary || '', 900))}</pre>
            </div>
          </div>
          ${renderDocumentSummaries(card)}
          <div class="muted">${renderUrlLink(card.url)}</div>
        </article>
      `).join('')}
    </div>
  `;
};

const renderArtifacts = (task) => {
  const artifacts = task.lastArtifacts || [];
  if (!artifacts.length) return '暂无证据摘要';
  return artifacts
    .map((artifact) => compactInline(`${artifact.artifact_type || 'artifact'} · ${artifact.title || ''}${artifact.url ? ` · ${artifact.url}` : ''}`, 260))
    .join('\n');
};

const renderDiscoveredLinks = (task) => {
  const links = task.lastDiscoveredLinks || [];
  if (!links.length) return '<div class="value">暂无发现入口</div>';
  return `
    <ul class="candidate-list">
      ${links.slice(0, 8).map((link) => `
        <li>
          <strong>${escapeHtml(compactInline(link.title || link.url, 140))}</strong>
          <div class="muted">${escapeHtml(link.source || 'search')} · 分数 ${escapeHtml(link.score ?? 0)}</div>
          <div class="muted">${renderUrlLink(link.url)}</div>
        </li>
      `).join('')}
    </ul>
  `;
};

const renderAgentRunSteps = (detail) => {
  const steps = detail?.steps || [];
  if (!detail) {
    return '<div class="value">点击左侧某次运行查看详细步骤。</div>';
  }
  if (!steps.length) {
    return '<div class="value">这次运行还没有记录步骤。</div>';
  }
  return `
    <div class="agent-step-list">
      ${steps.map((step) => {
        const payload = [
          compactJson(step.observation) ? `观察：\n${compactJson(step.observation)}` : '',
          compactJson(step.result) ? `结果：\n${compactJson(step.result)}` : '',
          step.errorMessage ? `错误：${step.errorMessage}` : '',
        ].filter(Boolean).join('\n\n');
        return `
          <article class="agent-step ${escapeHtml(step.phase || '')}">
            <div class="agent-step-head">
              <span class="step-index">${escapeHtml(step.stepIndex || '')}</span>
              <div>
                <strong>${escapeHtml(phaseLabel(step.phase))} · ${escapeHtml(step.action || '')}</strong>
                <div class="muted">${escapeHtml(step.tool || 'agent')} · ${escapeHtml(step.createdAt || '')}</div>
              </div>
            </div>
            ${payload ? `<pre>${escapeHtml(payload)}</pre>` : ''}
          </article>
        `;
      }).join('')}
    </div>
  `;
};

const renderAgentRuns = (task) => {
  const runs = agentRunsForTask(task.id);
  if (!runs.length) {
    return '<div class="value">暂无 Agent 运行轨迹。点击“Agent 自动发现”后会记录每一步工具调用。</div>';
  }
  const activeRun = runs.some((run) => run.id === selectedAgentRunId)
    ? runs.find((run) => run.id === selectedAgentRunId)
    : runs[0];
  const detail = activeRun ? agentRunDetails.get(activeRun.id) : null;
  return `
    <div class="agent-run-board">
      <div class="agent-run-list">
        ${runs.slice(0, 6).map((run) => `
          <button
            type="button"
            class="agent-run-card${run.id === activeRun?.id ? ' selected' : ''}"
            data-agent-run-id="${escapeHtml(run.id)}"
          >
            <span class="status ${escapeHtml(run.status)}">${escapeHtml(agentRunStatusLabel(run.status))}</span>
            <strong>${escapeHtml(run.trigger || 'manual_agent_run')}</strong>
            <span class="muted">${escapeHtml(run.updatedAt || run.startedAt || '')}</span>
            ${run.resultSummary ? `<span class="muted">${escapeHtml(compactInline(run.resultSummary, 110))}</span>` : ''}
          </button>
        `).join('')}
      </div>
      <div class="agent-run-detail">
        ${activeRun ? `
          <div class="agent-run-summary">
            <div>
              <strong>${escapeHtml(activeRun.id)}</strong>
              <div class="muted">${escapeHtml(activeRun.sourceName || '')} · ${escapeHtml(agentRunStatusLabel(activeRun.status))}</div>
            </div>
            <button type="button" data-agent-run-id="${escapeHtml(activeRun.id)}">${detail ? '刷新轨迹' : '查看轨迹'}</button>
          </div>
          ${renderAgentRunSteps(detail)}
        ` : '<div class="value">暂无可查看的运行。</div>'}
      </div>
    </div>
  `;
};

const renderDetail = () => {
  const task = selectedTask();
  if (!task) {
    detail.className = 'empty';
    if (lastSelectedTask && selectedTaskId) {
      detail.innerHTML = `
        <div>
          <div>当前任务已不在列表中</div>
          <div class="muted">任务 ID：${escapeHtml(lastSelectedTask.id)} · ${escapeHtml(lastSelectedTask.sourceName || '')}</div>
          <div class="muted">${escapeHtml(compactBlock(lastSelectedTask.lastLog || lastSelectedTask.lastObservation || '可能已完成、取消或失败。', 700))}</div>
        </div>
      `;
      return;
    }
    detail.innerHTML = '请选择或新建一个本地采集任务';
    return;
  }
  lastSelectedTask = task;
  selectedTaskId = task.id;
  const entry = task.entryUrl
    ? renderUrlLink(task.entryUrl)
    : '未提供';
  const hasEntryUrl = Boolean(task.entryUrl);
  const noEntryWarning = hasEntryUrl
    ? ''
    : '<div class="notice bad show">该任务没有入口 URL，无法打开采集浏览器。请补充入口，或先在站点配置中完善 profile。</div>';
  detail.className = '';
  detail.innerHTML = `
    <div class="detail-top">
      <div class="topbar">
        <div>
          <h2>${escapeHtml(task.sourceName || '未命名站点')}</h2>
          <div class="muted">任务 ID：${escapeHtml(task.id)}${task.mode ? ` · ${task.mode === 'local' ? '本机任务' : '云端兼容任务'}` : ''}</div>
        </div>
        <span class="status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
      </div>
      ${noEntryWarning}
      <div class="actions">
        <button class="primary" data-action="agent"${hasEntryUrl ? '' : ' disabled title="任务缺少入口 URL"'}>Agent 自动发现</button>
        <button class="primary" data-action="open"${hasEntryUrl ? '' : ' disabled title="任务缺少入口 URL"'}>打开采集浏览器</button>
        <button data-action="continue"${hasEntryUrl ? '' : ' disabled title="任务缺少入口 URL"'}>我已完成登录/筛选，继续采集</button>
        <button data-action="copy-task-report">复制站点日报</button>
        <button data-action="copy-daily-report">复制今日汇总</button>
        <button data-action="copy-priority-report">复制重点清单</button>
        <button data-action="cancel">取消</button>
        <button class="danger" data-action="fail">失败</button>
      </div>
    </div>
    <div class="section">
      <div class="field">
        <label>入口 URL</label>
        <div class="value">${entry}</div>
      </div>
      <div class="field">
        <label>搜索词</label>
        <pre>${escapeHtml(task.searchTerms || '未提供')}</pre>
      </div>
      <div class="field">
        <label>操作提示</label>
        <pre>${escapeHtml(task.actionSteps || '打开站点后，如遇登录、验证码、短信或 CA，请人工完成；进入公告列表或详情页后点击继续采集。')}</pre>
      </div>
    </div>
    <div class="section">
      <div class="field">
        <label>Agent 运行轨迹</label>
        ${renderAgentRuns(task)}
      </div>
      <div class="field">
        <label>Agent 发现入口</label>
        ${renderDiscoveredLinks(task)}
      </div>
      <div class="field">
        <label>商机卡片</label>
        ${renderOpportunityCards(task)}
      </div>
      <div class="field">
        <label>原始候选结果</label>
        ${renderCandidates(task)}
      </div>
      <div class="field">
        <label>结果摘要</label>
        <pre>${escapeHtml(compactBlock(task.lastResultSummary || '暂无摘要'))}</pre>
      </div>
    </div>
    <div class="section">
      <div class="field">
        <label>最近截图</label>
        <div class="value">${escapeHtml(task.lastScreenshotPath || '暂无截图')}</div>
      </div>
      <div class="field">
        <label>证据摘要</label>
        <pre>${escapeHtml(renderArtifacts(task))}</pre>
      </div>
      <div class="field">
        <label>最近日志</label>
        <pre>${escapeHtml(compactBlock(task.lastLog || task.lastObservation || '暂无日志', 1600))}</pre>
      </div>
    </div>
  `;
  for (const button of detail.querySelectorAll('[data-action]')) {
    button.disabled = busy || button.hasAttribute('disabled');
  }
  for (const button of detail.querySelectorAll('[data-agent-run-id]')) {
    button.disabled = busy;
  }
};

const render = () => {
  if (!selectedTaskId && tasks[0]) selectedTaskId = tasks[0].id;
  setActiveSidebarPanel(activeSidebarPanel, { persist: false });
  renderProfileOptions();
  renderFeedbackLearning(feedbackLearning || {});
  renderPriorityBoard(priorityBoard || {});
  renderAgentTools(agentTools || {});
  renderSchedules();
  renderList();
  renderDetail();
};

const refresh = async () => {
  showNotice('');
  try {
    const health = await requestJson('/health');
    cloudState.textContent = health.cloudPaired
      ? `本机模式 · 云端上传已配置：${health.cloudOwnerName || health.cloudUrl || '云端'}`
      : '本机模式 · 可选配置云端上传';
    showReleaseNotice(health.latestRelease);
    const profileBody = await requestJson('/site-profiles');
    profiles = profileBody.profiles || [];
    renderLLMSettings(await requestJson('/settings/llm'));
    renderAgentTools(await requestJson('/agent-tools').catch(() => ({})));
    renderFeedbackLearning(await requestJson('/settings/feedback-learning'));
    renderPriorityBoard(await requestJson('/opportunities/priority-board?limit=8'));
    schedules = (await requestJson('/schedules')).schedules || [];
    const body = await requestJson('/tasks');
    tasks = body.tasks || [];
    if (!selectedTaskId && tasks[0]) selectedTaskId = tasks[0].id;
    agentRuns = (await requestJson('/agent-runs?limit=80').catch(() => ({ runs: [] }))).runs || [];
    const runsForSelected = selectedTaskId ? agentRunsForTask(selectedTaskId) : [];
    if (runsForSelected.length && !runsForSelected.some((run) => run.id === selectedAgentRunId)) {
      selectedAgentRunId = runsForSelected[0].id;
      localStorage.setItem('hcz-selected-agent-run-id', selectedAgentRunId);
    }
    if (selectedAgentRunId && !agentRunDetails.has(selectedAgentRunId)) {
      await loadAgentRunDetail(selectedAgentRunId, { renderAfter: false }).catch(() => null);
    }
    render();
  } catch (err) {
    showNotice(`刷新失败：${err && err.message ? err.message : err}`, true);
    cloudState.textContent = '本地服务异常';
    showReleaseNotice(null);
    tasks = [];
    render();
  }
};

const copyPriorityReportText = async () => {
  if (busy) return;
  busy = true;
  showNotice('');
  try {
    const message = await copyWechatText('/wechat/priority-report', '今日重点清单已复制。');
    showNotice(message);
  } catch (err) {
    showNotice(`复制重点清单失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

const clearLearning = async () => {
  if (busy) return;
  busy = true;
  showNotice('');
  try {
    renderFeedbackLearning(await requestJson('/settings/feedback-learning/clear', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    showNotice('本地反馈学习数据已清空。');
    await refresh();
  } catch (err) {
    showNotice(`清空学习数据失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

const createTask = async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  showNotice('');
  try {
    const sourceName = siteSelect.value || customSourceName.value.trim();
    if (!sourceName) throw new Error('请选择站点或填写自定义站点名。');
    const created = await requestJson('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        sourceName,
        searchTerms: searchTerms.value.trim(),
        entryUrl: entryUrl.value.trim(),
        actionSteps: actionSteps.value.trim(),
      }),
    });
    selectedTaskId = created.task?.id || '';
    if (sourceName) expandedGroups.add(sourceName);
    saveExpandedGroups();
    const selectedProfile = siteSelect.value;
    searchTerms.value = '';
    actionSteps.value = '';
    if (selectedProfile) applyProfileDefaults(selectedProfile);
    showNotice('本地采集任务已创建。');
    await refresh();
  } catch (err) {
    showNotice(`新建失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

const schedulePayload = (overrides = {}) => ({
  id: scheduleForm.dataset.scheduleId || '',
  sourceName: scheduleSiteSelect.value || scheduleCustomSourceName.value.trim(),
  searchTerms: scheduleSearchTerms.value.trim(),
  entryUrl: scheduleEntryUrl.value.trim(),
  actionSteps: scheduleActionSteps.value.trim(),
  times: scheduleTimes.value.trim(),
  runMode: scheduleRunMode.value,
  enabled: scheduleEnabled.checked,
  ...overrides,
});

const saveSchedule = async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  showNotice('');
  try {
    const payload = schedulePayload();
    if (!payload.sourceName) throw new Error('请选择站点或填写自定义站点名。');
    if (!payload.times) throw new Error('请填写每日巡检时间。');
    await requestJson('/schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    scheduleForm.dataset.scheduleId = '';
    showNotice('每日巡检计划已保存。');
    await refresh();
  } catch (err) {
    showNotice(`保存巡检计划失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

const editSchedule = (schedule) => {
  setActiveSidebarPanel('schedule');
  scheduleSiteSelect.value = profiles.some((profile) => profile.sourceName === schedule.sourceName) ? schedule.sourceName : '';
  scheduleCustomSourceName.value = scheduleSiteSelect.value ? '' : schedule.sourceName || '';
  scheduleTimes.value = (schedule.times || []).join(',');
  scheduleRunMode.value = schedule.runMode || 'agent';
  scheduleSearchTerms.value = schedule.searchTerms || '';
  scheduleEntryUrl.value = schedule.entryUrl || '';
  scheduleActionSteps.value = schedule.actionSteps || '';
  scheduleEnabled.checked = schedule.enabled !== false;
  scheduleForm.dataset.scheduleId = schedule.id || '';
  showNotice('已载入计划，修改后点击保存。');
};

const runScheduleListAction = async (action, scheduleId) => {
  const schedule = schedules.find((item) => item.id === scheduleId);
  if (!schedule) return;
  if (action === 'edit') {
    editSchedule(schedule);
    return;
  }
  if (busy) return;
  busy = true;
  showNotice('');
  try {
    if (action === 'run-now') {
      const result = await requestJson(`/schedules/${encodeURIComponent(scheduleId)}/run-now`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      selectedTaskId = result.task?.id || selectedTaskId;
      showNotice(result.result?.humanReason || '巡检计划已立即运行。');
    } else if (action === 'delete') {
      await requestJson(`/schedules/${encodeURIComponent(scheduleId)}/delete`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      showNotice('巡检计划已删除。');
    }
    await refresh();
  } catch (err) {
    showNotice(`巡检计划操作失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

const saveLLMSettings = async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  showNotice('');
  try {
    const settings = await requestJson('/settings/llm', {
      method: 'POST',
      body: JSON.stringify(llmSettingsPayload()),
    });
    llmApiKey.value = '';
    llmSettingsInitialized = false;
    renderLLMSettings(settings);
    showNotice('模型设置已保存。');
  } catch (err) {
    showNotice(`保存模型设置失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

const testLLMConnection = async () => {
  if (busy) return;
  busy = true;
  showNotice('');
  try {
    const result = await requestJson('/settings/llm/test', {
      method: 'POST',
      body: JSON.stringify(llmSettingsPayload()),
    });
    showNotice(result.message || (result.ok ? 'LLM 连接成功。' : 'LLM 连接失败。'), !result.ok);
  } catch (err) {
    showNotice(`测试连接失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

const runAction = async (action, { cardIndex = '', feedbackStatus = '' } = {}) => {
  const task = selectedTask();
  if (!task || busy) return;
  busy = true;
  render();
  showNotice('');
  let shouldRefresh = true;
  try {
    if (action === 'agent') {
      if (!task.entryUrl) throw new Error('任务缺少入口 URL，无法运行 Agent。');
      const result = await requestJson(`/tasks/${encodeURIComponent(task.id)}/agent-run`, { method: 'POST', body: JSON.stringify({}) });
      if (result.agentRunId) {
        selectedAgentRunId = result.agentRunId;
        localStorage.setItem('hcz-selected-agent-run-id', selectedAgentRunId);
        agentRunDetails.delete(selectedAgentRunId);
      }
      if (result.status === 'request_human') {
        showNotice(result.humanReason || 'Agent 已打开浏览器，需要人工继续处理。');
      } else {
        showNotice(result.resultSummary || 'Agent 已完成本地采集。');
      }
    } else if (action === 'open') {
      if (!task.entryUrl) throw new Error('任务缺少入口 URL，无法打开采集浏览器。');
      const result = await requestJson(`/tasks/${encodeURIComponent(task.id)}/run`, { method: 'POST', body: JSON.stringify({}) });
      showNotice(result.humanReason || '已打开采集浏览器。');
    } else if (action === 'continue') {
      if (!task.entryUrl) throw new Error('任务缺少入口 URL，无法继续采集。');
      const result = await requestJson(`/tasks/${encodeURIComponent(task.id)}/continue-run`, { method: 'POST', body: JSON.stringify({}) });
      if (result.status === 'request_human') {
        showNotice(result.humanReason || '本次采集还需要人工继续处理。');
      } else {
        showNotice(result.resultSummary || '已完成本地采集。');
      }
    } else if (action === 'deep-read') {
      const index = Number(cardIndex);
      if (!Number.isInteger(index) || index < 0) throw new Error('商机卡片索引无效。');
      const result = await requestJson(`/tasks/${encodeURIComponent(task.id)}/opportunities/${index}/deep-read`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (result.status === 'request_human') {
        showNotice(result.humanReason || '查清楚需要先处理登录、验证码或安全验证。');
      } else {
        showNotice(result.resultSummary || '已完成这条商机的深度研判。');
      }
    } else if (action === 'copy-card-wechat') {
      const index = Number(cardIndex);
      if (!Number.isInteger(index) || index < 0) throw new Error('商机卡片索引无效。');
      const message = await copyWechatText(
        `/tasks/${encodeURIComponent(task.id)}/opportunities/${index}/wechat-summary`,
        '单条群消息已复制。',
      );
      shouldRefresh = false;
      showNotice(message);
    } else if (action === 'copy-task-report') {
      const message = await copyWechatText(
        `/tasks/${encodeURIComponent(task.id)}/wechat-report`,
        '站点日报已复制。',
      );
      shouldRefresh = false;
      showNotice(message);
    } else if (action === 'copy-daily-report') {
      const message = await copyWechatText('/wechat/daily-report', '今日汇总已复制。');
      shouldRefresh = false;
      showNotice(message);
    } else if (action === 'copy-priority-report') {
      const message = await copyWechatText('/wechat/priority-report', '今日重点清单已复制。');
      shouldRefresh = false;
      showNotice(message);
    } else if (action === 'feedback') {
      const index = Number(cardIndex);
      if (!Number.isInteger(index) || index < 0) throw new Error('商机卡片索引无效。');
      if (!feedbackStatus) throw new Error('反馈状态无效。');
      const result = await requestJson(`/tasks/${encodeURIComponent(task.id)}/opportunities/${index}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ status: feedbackStatus }),
      });
      showNotice(`已标记反馈：${feedbackLabel(result.card?.feedbackStatus || feedbackStatus)}`);
    } else if (action === 'cancel') {
      await requestJson(`/tasks/${encodeURIComponent(task.id)}/cancel`, { method: 'POST', body: JSON.stringify({}) });
      showNotice('任务已取消。');
    } else if (action === 'fail') {
      await requestJson(`/tasks/${encodeURIComponent(task.id)}/continue`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'failed',
          observation: '员工在本地采集 Agent 标记任务失败。',
          log: '员工在本地采集 Agent 标记任务失败。',
        }),
      });
      showNotice('任务已标记失败。');
    }
    if (shouldRefresh) await refresh();
  } catch (err) {
    showNotice(`操作失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

taskList.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-group]');
  if (toggle) {
    const groupName = toggle.dataset.group || '';
    if (expandedGroups.has(groupName)) expandedGroups.delete(groupName);
    else expandedGroups.add(groupName);
    saveExpandedGroups();
    render();
    return;
  }
  const button = event.target.closest('[data-task-id]');
  if (!button) return;
  selectedTaskId = button.dataset.taskId || '';
  const runsForSelected = agentRunsForTask(selectedTaskId);
  selectedAgentRunId = runsForSelected[0]?.id || '';
  if (selectedAgentRunId) localStorage.setItem('hcz-selected-agent-run-id', selectedAgentRunId);
  render();
});

railNav.addEventListener('click', (event) => {
  const button = event.target.closest('[data-panel-target]');
  if (!button) return;
  setActiveSidebarPanel(button.dataset.panelTarget || 'tasks');
});

detail.addEventListener('click', (event) => {
  const runButton = event.target.closest('[data-agent-run-id]');
  if (runButton) {
    loadAgentRunDetail(runButton.dataset.agentRunId || '')
      .catch((err) => showNotice(`读取 Agent 轨迹失败：${err && err.message ? err.message : err}`, true));
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  runAction(button.dataset.action || '', {
    cardIndex: button.dataset.cardIndex || '',
    feedbackStatus: button.dataset.feedbackStatus || '',
  });
});

siteSelect.addEventListener('change', () => {
  applyProfileDefaults(siteSelect.value, { force: true });
});

scheduleSiteSelect.addEventListener('change', () => {
  applyScheduleProfileDefaults(scheduleSiteSelect.value, { force: true });
});

customSourceName.addEventListener('input', () => {
  if (customSourceName.value.trim()) siteSelect.value = '';
});

scheduleCustomSourceName.addEventListener('input', () => {
  if (scheduleCustomSourceName.value.trim()) scheduleSiteSelect.value = '';
});

scheduleList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-schedule-action]');
  if (!button) return;
  runScheduleListAction(button.dataset.scheduleAction || '', button.dataset.scheduleId || '');
});

createTaskForm.addEventListener('submit', createTask);
scheduleForm.addEventListener('submit', saveSchedule);
llmSettingsForm.addEventListener('submit', saveLLMSettings);
testLLM.addEventListener('click', testLLMConnection);
clearFeedbackLearning.addEventListener('click', clearLearning);
copyPriorityReport.addEventListener('click', copyPriorityReportText);
refreshButton.addEventListener('click', refresh);
setActiveSidebarPanel(activeSidebarPanel, { persist: false });
refresh();
