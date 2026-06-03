// 配对界面脚本（渲染层，无 node 集成）。纯逻辑见 src/pairing.ts（已单测），此处只做 UI 绑定。
'use strict';

const DEFAULT_CLOUD_URL = 'https://agent.henghuacheng.cn';
const params = new URLSearchParams(location.search);
const apiBase = (params.get('api') || 'http://127.0.0.1:17321').replace(/\/+$/, '');

const $ = (id) => document.getElementById(id);
const cloudUrlInput = $('cloudUrl');
const codeInput = $('code');
const deviceNameInput = $('deviceName');
const errBox = $('err');
const statusBox = $('status');
const submitBtn = $('submit');

const setStatus = (kind, message) => {
  statusBox.className = `status ${kind}`;
  statusBox.textContent = message;
};

const validate = () => {
  const cloudUrl = (cloudUrlInput.value || '').trim() || DEFAULT_CLOUD_URL;
  const code = (codeInput.value || '').trim();
  if (!/^https?:\/\/.+/i.test(cloudUrl)) return { error: '云端地址需以 http:// 或 https:// 开头' };
  if (!code) return { error: '请输入配对码' };
  const deviceName = (deviceNameInput.value || '').trim() || 'Windows 本地助手';
  return {
    payload: {
      cloudUrl: cloudUrl.replace(/\/+$/, ''),
      code,
      deviceName,
      deviceFingerprint: deviceName,
    },
  };
};

const refreshHealth = async () => {
  try {
    const res = await fetch(`${apiBase}/health`);
    const health = await res.json();
    if (health.cloudPaired) {
      setStatus('ok', `已连接云端：${health.cloudUrl || ''}${health.cloudOwnerName ? ` · 负责人 ${health.cloudOwnerName}` : ''}`);
      if (health.cloudUrl) cloudUrlInput.value = health.cloudUrl;
    }
  } catch {
    // 本地服务未就绪时忽略，不阻塞配对。
  }
};

submitBtn.addEventListener('click', async () => {
  errBox.textContent = '';
  const { error, payload } = validate();
  if (error) {
    errBox.textContent = error;
    return;
  }
  submitBtn.disabled = true;
  setStatus('', '');
  try {
    const res = await fetch(`${apiBase}/cloud/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(body.error || `配对失败（${res.status}）`);
    const owner = body.device?.ownerName || body.device?.owner_name || '';
    setStatus('ok', `配对成功${owner ? ` · 负责人 ${owner}` : ''}，本机已连接云端任务通道。`);
  } catch (err) {
    setStatus('bad', `配对失败：${err && err.message ? err.message : err}`);
  } finally {
    submitBtn.disabled = false;
  }
});

cloudUrlInput.value = DEFAULT_CLOUD_URL;
refreshHealth();
