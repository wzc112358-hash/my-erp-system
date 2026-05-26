const daysUntil = (dateString, now) => {
  if (!dateString) return null;
  const target = new Date(`${dateString}T23:59:59+08:00`).getTime();
  return Math.ceil((target - now.getTime()) / 86400000);
};

export const buildGroupSummary = (items, now = new Date()) => {
  const byOwner = new Map();

  for (const item of items) {
    if (!['likely_related', 'needs_manual_review'].includes(item.classification?.relevance)) continue;
    const owner = item.ownerName || '未分配';
    const current = byOwner.get(owner) || { related: 0, urgent: 0 };
    current.related += 1;
    const remaining = daysUntil(item.deadlineDate, now);
    if (remaining !== null && remaining <= 3) current.urgent += 1;
    byOwner.set(owner, current);
  }

  if (byOwner.size === 0) {
    return '今日招投标监测已完成：暂无新增疑似相关商机。正式处理请进入 ERP 商机池。';
  }

  const lines = ['今日招投标监测摘要：'];
  for (const [owner, count] of byOwner.entries()) {
    lines.push(`${owner}：${count.related} 条疑似相关，${count.urgent} 条需 3 日内确认`);
  }
  lines.push('正式处理请进入 ERP 商机池。');
  return lines.join('\n');
};
