'use strict';

const params = new URLSearchParams(location.search);
const apiBase = (params.get('api') || 'http://127.0.0.1:17321').replace(/\/+$/, '');
let selectedTaskId = params.get('taskId') || '';
let tasks = [];
let profiles = [];
let busy = false;
const expandedGroups = new Set();
const knownGroups = new Set();
let lastSelectedTask = null;

const $ = (id) => document.getElementById(id);
const taskList = $('taskList');
const detail = $('detail');
const notice = $('notice');
const releaseNotice = $('releaseNotice');
const cloudState = $('cloudState');
const refreshButton = $('refresh');
const createTaskForm = $('createTaskForm');
const siteSelect = $('siteSelect');
const customSourceName = $('customSourceName');
const searchTerms = $('searchTerms');
const entryUrl = $('entryUrl');

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

const selectedTask = () => tasks.find((task) => task.id === selectedTaskId) || null;

const renderProfileOptions = () => {
  const current = siteSelect.value;
  siteSelect.innerHTML = [
    '<option value="">自定义站点</option>',
    ...profiles.map((profile) => (
      `<option value="${escapeHtml(profile.sourceName)}">${escapeHtml(profile.sourceName)}</option>`
    )),
  ].join('');
  siteSelect.value = profiles.some((profile) => profile.sourceName === current) ? current : '';
};

const renderList = () => {
  taskList.innerHTML = '';
  if (!tasks.length) {
    taskList.innerHTML = '<div class="muted">暂无本地任务，新建后开始采集。</div>';
    return;
  }
  const groups = groupTasks(tasks);
  for (const group of groups) {
    if (!knownGroups.has(group.sourceName)) {
      knownGroups.add(group.sourceName);
      expandedGroups.add(group.sourceName);
    }
    const section = document.createElement('section');
    section.className = 'task-group';
    const open = expandedGroups.has(group.sourceName);
    section.innerHTML = `
      <button class="group-toggle" data-group="${escapeHtml(group.sourceName)}" aria-expanded="${open ? 'true' : 'false'}">
        <span>${escapeHtml(group.sourceName)}</span>
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
        <div class="muted">${escapeHtml(task.entryUrl || '未提供入口 URL')}</div>
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
          <div class="muted">${candidate.url ? `<a href="${escapeHtml(candidate.url)}" target="_blank" rel="noreferrer">${escapeHtml(candidate.url)}</a>` : '暂无链接'}</div>
        </li>
      `).join('')}
    </ul>
  `;
};

const renderArtifacts = (task) => {
  const artifacts = task.lastArtifacts || [];
  if (!artifacts.length) return '暂无证据摘要';
  return artifacts
    .map((artifact) => `${artifact.artifact_type || 'artifact'} · ${artifact.title || ''}${artifact.url ? ` · ${artifact.url}` : ''}`)
    .join('\n');
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
          <div class="muted">${escapeHtml(lastSelectedTask.lastLog || lastSelectedTask.lastObservation || '可能已完成、取消或失败。')}</div>
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
    ? `<a href="${escapeHtml(task.entryUrl)}" target="_blank" rel="noreferrer">${escapeHtml(task.entryUrl)}</a>`
    : '未提供';
  const hasEntryUrl = Boolean(task.entryUrl);
  const noEntryWarning = hasEntryUrl
    ? ''
    : '<div class="notice bad show">该任务没有入口 URL，无法打开采集浏览器。请补充入口，或先在站点配置中完善 profile。</div>';
  detail.className = '';
  detail.innerHTML = `
    <div class="topbar">
      <div>
        <h2>${escapeHtml(task.sourceName || '未命名站点')}</h2>
        <div class="muted">任务 ID：${escapeHtml(task.id)}${task.mode ? ` · ${task.mode === 'local' ? '本机任务' : '云端兼容任务'}` : ''}</div>
      </div>
      <span class="status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
    </div>
    ${noEntryWarning}
    <div class="actions">
      <button class="primary" data-action="open"${hasEntryUrl ? '' : ' disabled title="任务缺少入口 URL"'}>打开采集浏览器</button>
      <button data-action="continue"${hasEntryUrl ? '' : ' disabled title="任务缺少入口 URL"'}>我已完成登录/筛选，继续采集</button>
      <button data-action="cancel">取消</button>
      <button class="danger" data-action="fail">失败</button>
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
        <label>候选结果</label>
        ${renderCandidates(task)}
      </div>
      <div class="field">
        <label>结果摘要</label>
        <pre>${escapeHtml(task.lastResultSummary || '暂无摘要')}</pre>
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
        <pre>${escapeHtml(task.lastLog || task.lastObservation || '暂无日志')}</pre>
      </div>
    </div>
  `;
  for (const button of detail.querySelectorAll('[data-action]')) {
    button.disabled = busy || button.hasAttribute('disabled');
  }
};

const render = () => {
  if (!selectedTaskId && tasks[0]) selectedTaskId = tasks[0].id;
  renderProfileOptions();
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
    const body = await requestJson('/tasks');
    tasks = body.tasks || [];
    render();
  } catch (err) {
    showNotice(`刷新失败：${err && err.message ? err.message : err}`, true);
    cloudState.textContent = '本地服务异常';
    showReleaseNotice(null);
    tasks = [];
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
      }),
    });
    selectedTaskId = created.task?.id || '';
    searchTerms.value = '';
    showNotice('本地采集任务已创建。');
    await refresh();
  } catch (err) {
    showNotice(`新建失败：${err && err.message ? err.message : err}`, true);
  } finally {
    busy = false;
    render();
  }
};

const runAction = async (action) => {
  const task = selectedTask();
  if (!task || busy) return;
  busy = true;
  render();
  showNotice('');
  try {
    if (action === 'open') {
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
    await refresh();
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
    render();
    return;
  }
  const button = event.target.closest('[data-task-id]');
  if (!button) return;
  selectedTaskId = button.dataset.taskId || '';
  render();
});

detail.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  runAction(button.dataset.action || '');
});

siteSelect.addEventListener('change', () => {
  const profile = profiles.find((item) => item.sourceName === siteSelect.value);
  if (profile) {
    customSourceName.value = '';
    if (!entryUrl.value.trim()) entryUrl.value = profile.entryUrl || '';
  }
});

createTaskForm.addEventListener('submit', createTask);
refreshButton.addEventListener('click', refresh);
refresh();
