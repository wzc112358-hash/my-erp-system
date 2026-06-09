export type ParsedDeepLink =
  | { type: 'task'; taskId: string; params: Record<string, string> }
  | { type: 'pair'; cloudUrl: string; code: string; params: Record<string, string> }
  | { type: 'unknown'; params: Record<string, string> };

const paramsFrom = (url: URL): Record<string, string> => Object.fromEntries(url.searchParams.entries());

export const parseDeepLink = (value = ''): ParsedDeepLink => {
  try {
    if (!value) return { type: 'unknown', params: {} };
    const url = new URL(value);
    if (url.protocol !== 'hcz-helper:') return { type: 'unknown', params: paramsFrom(url) };

    const params = paramsFrom(url);
    if (url.hostname === 'task') {
      const taskId = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!taskId) return { type: 'unknown', params };
      return { type: 'task', taskId, params };
    }

    if (url.hostname === 'pair') {
      const cloudUrl = params.cloudUrl || '';
      const code = params.code || '';
      if (!cloudUrl || !code) return { type: 'unknown', params };
      return { type: 'pair', cloudUrl, code, params };
    }

    return { type: 'unknown', params };
  } catch {
    return { type: 'unknown', params: {} };
  }
};
