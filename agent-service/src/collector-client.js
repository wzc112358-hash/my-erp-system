const normalizeBaseUrl = (value = '') => String(value || '').replace(/\/+$/, '');

export const normalizeCollectorBundle = (bundle = {}, defaults = {}) => (
  (bundle.candidates || bundle.items || []).map((item) => ({
    sourceId: bundle.source_id || item.source_id || item.metadata?.source_id || defaults.sourceId || '',
    sourceName: bundle.source_name || item.source_name || defaults.sourceName || '',
    ownerName: bundle.owner_name || item.owner_name || defaults.ownerName || '',
    title: item.title || '',
    url: item.url || '',
    publishDate: item.published_at || '',
    deadlineDate: item.deadline_at || '',
    buyerName: item.buyer_name || '',
    content: item.raw_text || item.title || '',
    attachmentUrls: item.attachments || [],
  }))
);

export const collectUrlWithCollector = async ({
  collectorUrl = process.env.COLLECTOR_SERVICE_URL || '',
  url,
  sourceName = '测试公开源',
  ownerName = '未分配',
  mode = 'http_html',
  fetchImpl = fetch,
} = {}) => {
  const baseUrl = normalizeBaseUrl(collectorUrl);
  if (!baseUrl) throw new Error('COLLECTOR_SERVICE_URL is required');
  const response = await fetchImpl(`${baseUrl}/collect/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      source_name: sourceName,
      owner_name: ownerName,
      mode,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`collector-service ${response.status} ${response.statusText}: ${text}`);
  }
  const bundle = await response.json();
  if (bundle.status === 'failed') {
    throw new Error(`collector-service failed: ${bundle.error || 'unknown error'}`);
  }
  return normalizeCollectorBundle(bundle, {
    sourceName,
    ownerName,
  });
};

export const collectSourceWithCollector = async ({
  collectorUrl = process.env.COLLECTOR_SERVICE_URL || '',
  source = {},
  mode = 'http_html',
  fetchImpl = fetch,
} = {}) => {
  const baseUrl = normalizeBaseUrl(collectorUrl);
  if (!baseUrl) throw new Error('COLLECTOR_SERVICE_URL is required');
  const response = await fetchImpl(`${baseUrl}/collect/source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, mode }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`collector-service ${response.status} ${response.statusText}: ${text}`);
  }
  const bundle = await response.json();
  if (bundle.status === 'failed') {
    throw new Error(`collector-service failed: ${bundle.error || 'unknown error'}`);
  }
  return normalizeCollectorBundle(bundle, {
    sourceId: source.id || '',
    sourceName: source.source_name || '',
    ownerName: source.owner_name || '',
  });
};
