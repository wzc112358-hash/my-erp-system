'use strict';

const params = new URLSearchParams(location.search);
const apiBase = (params.get('api') || 'http://127.0.0.1:17321').replace(/\/+$/, '');
let selectedTaskId = params.get('taskId') || '';
let tasks = [];
let busy = false;

const $ = (id) => document.getElementById(id);
const taskList = $('taskList');
const detail = $('detail');
const notice = $('notice');
const releaseNotice = $('releaseNotice');
const cloudState = $('cloudState');
const refreshButton = $('refresh');

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const statusLabel = (status) => ({
  pending: '待处理',
  running: '采集中',
  waiting_agent: '等待云端',
  cancelled: '已取消',
  completed: '已完成',
  failed: '失败',
}[status] || status || '未知');

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
    ${release.updateRequired ? '当前版本过旧，请升级本地助手后继续采集。' : '发现本地助手新版本，建议升级。'}
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

const selectedTask = () => tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null;

const renderList = () => {
  taskList.innerHTML = '';
  if (!tasks.length) {
    taskList.innerHTML = '<div class="muted">暂无云端任务</div>';
    return;
  }
  for (const task of tasks) {
    const button = document.createElement('button');
    button.className = `task-item${task.id === selectedTaskId ? ' selected' : ''}`;
    button.dataset.taskId = task.id;
    button.innerHTML = `
      <div class="task-title">
        <strong>${escapeHtml(task.sourceName || '未命名站点')}</strong>
        <span class="status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
      </div>
      <div class="muted">${escapeHtml(task.ownerName || '未分配负责人')}</div>
      <div class="muted">${escapeHtml(task.updatedAt || '')}</div>
    `;
    taskList.appendChild(button);
  }
};

const renderDetail = () => {
  const task = selectedTask();
  if (!task) {
    detail.className = 'empty';
    detail.innerHTML = '暂无可处理任务';
    return;
  }
  selectedTaskId = task.id;
  const entry = task.entryUrl
    ? `<a href="${escapeHtml(task.entryUrl)}">${escapeHtml(task.entryUrl)}</a>`
    : '未提供';
  detail.className = '';
  detail.innerHTML = `
    <div class="topbar">
      <div>
        <h2>${escapeHtml(task.sourceName || '未命名站点')}</h2>
        <div class="muted">任务 ID：${escapeHtml(task.id)}${task.ownerName ? ` · 负责人：${escapeHtml(task.ownerName)}` : ''}</div>
      </div>
      <span class="status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
    </div>
    <div class="actions">
      <button class="primary" data-action="open">打开采集浏览器</button>
      <button data-action="continue">我已完成登录/验证码，继续采集</button>
      <button data-action="cancel">取消</button>
      <button class="danger" data-action="fail">失败</button>
    </div>
    <div class="section">
      <div class="field">
        <label>入口 URL</label>
        <div class="value">${entry}</div>
      </div>
      <div class="field">
        <label>操作步骤</label>
        <pre>${escapeHtml(task.actionSteps || '未提供')}</pre>
      </div>
      <div class="field">
        <label>搜索词</label>
        <pre>${escapeHtml(task.searchTerms || '未提供')}</pre>
      </div>
    </div>
    <div class="section">
      <div class="field">
        <label>最近截图</label>
        <div class="value">${escapeHtml(task.lastScreenshotPath || '暂无截图')}</div>
      </div>
      <div class="field">
        <label>最近日志</label>
        <pre>${escapeHtml(task.lastLog || task.lastObservation || '暂无日志')}</pre>
      </div>
    </div>
  `;
  for (const button of detail.querySelectorAll('[data-action]')) {
    button.disabled = busy;
  }
};

const render = () => {
  if (!selectedTaskId && tasks[0]) selectedTaskId = tasks[0].id;
  renderList();
  renderDetail();
};

const refresh = async () => {
  showNotice('');
  try {
    const health = await requestJson('/health');
    cloudState.textContent = health.cloudPaired
      ? `已连接：${health.cloudOwnerName || health.cloudUrl || '云端'}`
      : '尚未配对云端';
    if (health.cloudPaired) {
      const heartbeat = await requestJson('/cloud/heartbeat', { method: 'POST', body: JSON.stringify({}) });
      showReleaseNotice(heartbeat.release || health.latestRelease);
      const body = await requestJson('/cloud/tasks');
      tasks = body.tasks || [];
    } else {
      showReleaseNotice(null);
      tasks = [];
    }
    render();
  } catch (err) {
    showNotice(`刷新失败：${err && err.message ? err.message : err}`, true);
    cloudState.textContent = '连接异常';
    showReleaseNotice(null);
    tasks = [];
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
      await requestJson(`/cloud/tasks/${encodeURIComponent(task.id)}/run`, { method: 'POST', body: JSON.stringify({}) });
      showNotice('已打开采集浏览器。');
    } else if (action === 'continue') {
      await requestJson(`/cloud/tasks/${encodeURIComponent(task.id)}/continue-run`, { method: 'POST', body: JSON.stringify({}) });
      showNotice('已提交继续采集。');
    } else if (action === 'cancel') {
      await requestJson(`/cloud/tasks/${encodeURIComponent(task.id)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: '员工在本地助手取消任务' }),
      });
      showNotice('任务已取消。');
    } else if (action === 'fail') {
      await requestJson(`/cloud/tasks/${encodeURIComponent(task.id)}/continue`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'failed',
          observation: '员工在本地助手标记任务失败。',
          log: '员工在本地助手标记任务失败。',
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

refreshButton.addEventListener('click', refresh);
refresh();
