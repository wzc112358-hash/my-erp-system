import { extractCandidatesFromHtml } from '../domain/candidate.js';
import { enrichCandidateWithDetail } from '../domain/detail.js';

export const urlsForSource = (source) => {
  const urls = String(source.category_urls || '')
    .split(/[,，\n]+/)
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length > 0) return urls;
  return source.source_url ? [source.source_url] : [];
};

export const fetchHtml = async (url, fetchImpl = fetch) => {
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 ERP-Opportunity-Agent/0.2',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`source fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
};

export const collectHttpHtmlCandidates = async (source, options = {}) => {
  const fetchImpl = options.fetchImpl || fetch;
  const urls = urlsForSource(source);
  const candidates = [];
  const errors = [];

  for (const url of urls) {
    let html;
    try {
      html = await fetchHtml(url, fetchImpl);
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
      continue;
    }
    const listCandidates = extractCandidatesFromHtml({
      ...source,
      source_url: url,
    }, html);

    if (!options.enrichDetails) {
      candidates.push(...listCandidates);
      continue;
    }

    for (const candidate of listCandidates) {
      try {
        const detailHtml = await fetchHtml(candidate.url, fetchImpl);
        candidates.push(enrichCandidateWithDetail(candidate, detailHtml));
      } catch {
        candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0 && errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return candidates;
};
