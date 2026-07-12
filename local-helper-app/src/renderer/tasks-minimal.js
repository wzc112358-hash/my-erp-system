'use strict';

const params = new URLSearchParams(location.search);
const apiBase = (params.get('api') || ((location.protocol === 'http:' || location.protocol === 'https:')
  ? location.origin
  : 'http://127.0.0.1:17321')).replace(/\/+$/, '');

let tasks = [];
let profiles = [];
let selectedTaskId = params.get('taskId') || '';
let busy = false;
let cloudPaired = false;
let llmSettings = {};

const $ = (id) => document.getElementById(id);
const siteLauncher = $('siteLauncher');
const siteSelect = $('siteSelect');
const taskList = $('taskList');
const detail = $('detail');
const notice = $('notice');
const connectionState = $('connectionState');
const llmSettingsForm = $('llmSettingsForm');
const llmBaseUrl = $('llmBaseUrl');
const llmModel = $('llmModel');
const llmApiKey = $('llmApiKey');
const llmState = $('llmState');
const testLLM = $('testLLM');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const requestJson = async (path, options = {}) => {
  const { timeoutMs = 0, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(`${apiBase}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...fetchOptions,
      signal: controller?.signal,
    });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error || `请求失败 (${response.status})`);
    return body;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const selectedTask = () => tasks.find((task) => task.id === selectedTaskId) || null;
const profileFor = (sourceName) => profiles.find((profile) => profile.sourceName === sourceName) || null;
const statusLabel = (status) => ({
  pending: '等待开始',
  running: '采集中',
  waiting_agent: '等待人工验证',
  completed: '已完成',
  failed: '采集失败',
  cancelled: '已取消',
}[status] || '等待开始');
const reportStatusLabel = (status) => ({
  pending: '等待采集',
  needs_human: '需要人工协助',
  no_matches: '本次没有相关信息',
  has_matches: '发现相关信息',
  failed: '采集失败',
}[status] || '等待采集');

const showNotice = (message, bad = false) => {
  notice.textContent = message || '';
  notice.className = `toast${message ? ' show' : ''}${bad ? ' bad' : ''}`;
};

const setBusy = (value) => {
  busy = value;
  if (value) {
    for (const button of document.querySelectorAll('button')) button.disabled = true;
  }
};

const compact = (value, limit = 1300) => {
  const text = String(value || '').trim();
  return text.length > limit ? `${text.slice(0, limit)}\n...` : text;
};

const formatTime = (value) => {
  if (!value) return '时间待确认';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(parsed);
};

const copyText = async (text) => {
  if (!text) throw new Error('当前没有可复制的总结。');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', 'readonly');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('无法访问剪贴板，请手动复制。');
};

const renderProfiles = () => {
  const pilotOrder = ['国能E购', '易派克', '裕龙招投标网'];
  const pilotProfiles = profiles
    .filter((profile) => profile.pilot || pilotOrder.includes(profile.sourceName))
    .sort((left, right) => pilotOrder.indexOf(left.sourceName) - pilotOrder.indexOf(right.sourceName));
  const current = siteSelect.value;
  siteSelect.innerHTML = pilotProfiles
    .map((profile) => `<option value="${escapeHtml(profile.sourceName)}">${escapeHtml(profile.sourceName)}</option>`)
    .join('');
  if (pilotProfiles.some((profile) => profile.sourceName === current)) siteSelect.value = current;
};

const renderTaskList = () => {
  if (!tasks.length) {
    taskList.innerHTML = '<div class="section-help">还没有巡检记录</div>';
    return;
  }
  taskList.innerHTML = tasks.slice(0, 18).map((task) => {
    const report = task.collectionReport || {};
    const result = report.status === 'has_matches'
      ? `${report.selectedCount || 0} 条相关信息`
      : reportStatusLabel(report.status);
    return `
      <button class="task-row${task.id === selectedTaskId ? ' selected' : ''}" type="button" data-task-id="${escapeHtml(task.id)}">
        <strong>${escapeHtml(task.sourceName || '未命名站点')}</strong>
        <span class="status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
        <small>${escapeHtml(result)}，${escapeHtml(formatTime(task.updatedAt))}</small>
      </button>
    `;
  }).join('');
};

const renderResultItems = (items = []) => {
  if (!items.length) return '';
  return `<ul class="result-items">${items.map((item) => `
    <li class="result-item">
      <strong>${escapeHtml(item.title)}</strong>
      <div class="result-meta">${escapeHtml((item.matchedProducts || []).join('、') || '产品待确认')}，截止 ${escapeHtml(item.deadlineAt || '待确认')}</div>
      <div class="result-meta">${escapeHtml(item.judgment || '建议人工确认')}</div>
      ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">查看原公告</a>` : ''}
    </li>
  `).join('')}</ul>`;
};

const humanReasonFor = (task) => {
  const source = String(task.lastLog || task.lastObservation || '请在已打开的浏览器中完成登录或安全验证。')
    .replace(/\s+/g, ' ')
    .trim();
  const afterMarker = source.includes('需要人工处理：')
    ? source.split('需要人工处理：').slice(1).join('需要人工处理：')
    : source;
  const detected = afterMarker.includes('检测到') ? afterMarker.slice(afterMarker.indexOf('检测到')) : afterMarker;
  return compact(detected.split(/当前地址：|结果摘要：|页面观察：|发现入口：/)[0].trim(), 220);
};

const renderDetail = () => {
  const task = selectedTask();
  if (!task) {
    detail.className = 'empty-state';
    detail.innerHTML = '<h1>从左侧开始一次巡检</h1><p>选择国能 E 购、易派客或裕龙。系统会自动采集并只保留值得关注的信息。</p>';
    return;
  }

  const report = task.collectionReport || {};
  const reportReady = ['has_matches', 'no_matches'].includes(report.status);
  const waitingHuman = task.status === 'waiting_agent' || report.status === 'needs_human';
  const running = task.status === 'running';
  const candidates = task.lastCandidateBundle?.candidates || [];
  const primaryAction = waitingHuman
    ? '<button class="primary" type="button" data-action="continue">验证完成，继续采集</button>'
    : `<button class="primary" type="button" data-action="agent"${running ? ' disabled' : ''}>${running ? '正在采集' : task.status === 'pending' ? '开始采集' : '重新采集'}</button>`;

  detail.className = '';
  detail.innerHTML = `
    <header class="workspace-head">
      <div>
        <h1>${escapeHtml(task.sourceName || '未命名站点')}</h1>
        <p>${escapeHtml(reportStatusLabel(report.status))}</p>
      </div>
      <span class="status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
    </header>

    ${waitingHuman ? `
      <div class="human-callout">
        <strong>需要你完成验证</strong>
        <div>${escapeHtml(humanReasonFor(task))}</div>
      </div>
    ` : ''}

    <div class="primary-actions">
      ${primaryAction}
      <button type="button" data-action="copy"${reportReady ? '' : ' disabled'}>复制总结</button>
      <button type="button" data-action="upload"${reportReady && cloudPaired ? '' : ' disabled'} title="${cloudPaired ? '' : '尚未配置云端上传'}">上传云端</button>
    </div>

    <section class="result-panel" aria-labelledby="resultTitle">
      <div class="result-head">
        <div>
          <h2 id="resultTitle">${escapeHtml(reportStatusLabel(report.status))}</h2>
          <p>采集 ${escapeHtml(report.rawCount || 0)} 条，排除过期 ${escapeHtml(report.expiredCount || 0)} 条</p>
        </div>
        <div class="result-count" aria-label="保留条数">${escapeHtml(report.selectedCount || 0)}</div>
      </div>
      <pre class="summary">${escapeHtml(report.summary || '开始巡检后，筛选结果会显示在这里。')}</pre>
      ${renderResultItems(report.items || [])}
    </section>

    <details class="run-details">
      <summary>查看采集记录</summary>
      <div class="technical-grid">
        <div class="technical-block">
          <strong>搜索范围</strong>
          <pre>${escapeHtml(compact(task.searchTerms || '使用站点默认范围', 700))}</pre>
        </div>
        <div class="technical-block">
          <strong>入口</strong>
          <pre>${escapeHtml(task.entryUrl || '未设置')}</pre>
        </div>
        <div class="technical-block wide">
          <strong>最近日志</strong>
          <pre>${escapeHtml(compact(task.lastLog || task.lastObservation || '暂无日志'))}</pre>
        </div>
        <div class="technical-block wide">
          <strong>原始候选 (${escapeHtml(candidates.length)})</strong>
          <pre>${escapeHtml(compact(candidates.map((candidate, index) => `${index + 1}. ${candidate.title}`).join('\n') || '暂无候选'))}</pre>
        </div>
      </div>
    </details>
  `;
};

const renderLLMSettings = () => {
  llmBaseUrl.value = llmSettings.baseUrl || 'https://api.deepseek.com';
  llmModel.value = llmSettings.model || 'deepseek-v4-pro';
  llmState.textContent = llmSettings.hasApiKey
    ? `已配置 ${llmSettings.model || '模型'}`
    : '请填写 API Key';
  llmState.className = `settings-state${llmSettings.hasApiKey ? ' ok' : ''}`;
};

const render = () => {
  renderProfiles();
  renderTaskList();
  renderDetail();
  siteSelect.disabled = busy;
  for (const button of document.querySelectorAll('.nav-tab, #siteLauncher button, #llmSettingsForm button')) {
    button.disabled = busy;
  }
  for (const button of document.querySelectorAll('button')) {
    if (busy) button.disabled = true;
  }
};

const refresh = async () => {
  try {
    const [health, profileBody, taskBody, settings] = await Promise.all([
      requestJson('/health'),
      requestJson('/site-profiles'),
      requestJson('/tasks'),
      requestJson('/settings/llm'),
    ]);
    cloudPaired = Boolean(health.cloudPaired);
    connectionState.textContent = health.cloudPaired ? '本机服务正常，云端上传已连接' : '本机服务正常，云端上传未配置';
    profiles = profileBody.profiles || [];
    tasks = (taskBody.tasks || []).sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
    llmSettings = settings || {};
    if (!selectedTaskId && tasks[0]) selectedTaskId = tasks[0].id;
    renderLLMSettings();
    render();
  } catch (error) {
    connectionState.textContent = '无法连接本地服务';
    showNotice(`加载失败：${error.message || error}`, true);
  }
};

const runTaskAction = async (action) => {
  const task = selectedTask();
  if (!task || busy) return;
  setBusy(true);
  showNotice('');
  try {
    if (action === 'agent') {
      const result = await requestJson(`/tasks/${encodeURIComponent(task.id)}/agent-run`, { method: 'POST', body: '{}' });
      showNotice(result.status === 'request_human' ? (result.humanReason || '请完成浏览器验证。') : (result.resultSummary || '采集完成。'));
    } else if (action === 'continue') {
      const result = await requestJson(`/tasks/${encodeURIComponent(task.id)}/continue-run`, { method: 'POST', body: '{}' });
      showNotice(result.status === 'request_human' ? (result.humanReason || '仍需人工处理。') : (result.resultSummary || '继续采集完成。'));
    } else if (action === 'copy') {
      const report = await requestJson(`/tasks/${encodeURIComponent(task.id)}/collection-report`);
      await copyText(report.summary || '');
      showNotice('总结已复制。');
    } else if (action === 'upload') {
      const result = await requestJson(`/tasks/${encodeURIComponent(task.id)}/upload`, { method: 'POST', body: '{}' });
      showNotice(`已上传 ${result.report?.selectedCount || 0} 条相关信息。`);
    }
    await refresh();
  } catch (error) {
    showNotice(`操作失败：${error.message || error}`, true);
  } finally {
    setBusy(false);
    render();
  }
};

siteLauncher.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const profile = profileFor(siteSelect.value);
  if (!profile) return showNotice('请选择一个试点站点。', true);
  setBusy(true);
  showNotice('正在创建巡检并启动采集。');
  try {
    const created = await requestJson('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        sourceName: profile.sourceName,
        entryUrl: profile.entryUrl,
        searchTerms: profile.defaultSearchTerms,
        actionSteps: profile.defaultActionSteps,
      }),
    });
    selectedTaskId = created.task.id;
    await refresh();
    setBusy(false);
    await runTaskAction('agent');
  } catch (error) {
    showNotice(`启动失败：${error.message || error}`, true);
  } finally {
    setBusy(false);
    render();
  }
});

taskList.addEventListener('click', (event) => {
  const row = event.target.closest('[data-task-id]');
  if (!row) return;
  selectedTaskId = row.dataset.taskId || '';
  render();
});

detail.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled) runTaskAction(button.dataset.action || '');
});

document.querySelector('.nav-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-panel]');
  if (!tab) return;
  const panel = tab.dataset.panel;
  for (const item of document.querySelectorAll('.nav-tab')) item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
  $('tasksPanel').classList.toggle('active', panel === 'tasks');
  $('modelPanel').classList.toggle('active', panel === 'model');
});

llmSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  try {
    const payload = { enabled: true, baseUrl: llmBaseUrl.value.trim(), model: llmModel.value.trim() };
    if (llmApiKey.value.trim()) payload.apiKey = llmApiKey.value.trim();
    llmSettings = await requestJson('/settings/llm', { method: 'POST', body: JSON.stringify(payload) });
    llmApiKey.value = '';
    renderLLMSettings();
    showNotice('模型配置已保存。');
  } catch (error) {
    showNotice(`保存失败：${error.message || error}`, true);
  } finally {
    setBusy(false);
    render();
  }
});

testLLM.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  llmState.className = 'settings-state testing';
  llmState.textContent = '正在测试连接';
  try {
    const payload = { enabled: true, baseUrl: llmBaseUrl.value.trim(), model: llmModel.value.trim() };
    if (llmApiKey.value.trim()) payload.apiKey = llmApiKey.value.trim();
    const result = await requestJson('/settings/llm/test', { method: 'POST', body: JSON.stringify(payload), timeoutMs: 35_000 });
    llmState.className = `settings-state ${result.ok ? 'ok' : 'bad'}`;
    llmState.textContent = result.message || (result.ok ? '连接正常' : '连接失败');
    showNotice(result.message || '连接测试完成。', !result.ok);
  } catch (error) {
    llmState.className = 'settings-state bad';
    llmState.textContent = `连接失败：${error.message || error}`;
    showNotice(llmState.textContent, true);
  } finally {
    setBusy(false);
    render();
  }
});

refresh();
