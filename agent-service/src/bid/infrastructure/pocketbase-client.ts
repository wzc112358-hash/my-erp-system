export type PocketBaseRecord = Record<string, unknown> & { id: string };

type RequestOptions = RequestInit & { token?: string };

const errorText = async (response: Response) => {
  const body = await response.text().catch(() => '');
  return body ? `${response.status} ${response.statusText}: ${body}` : `${response.status} ${response.statusText}`;
};

const escapeFilterValue = (value: string) => value
  .replaceAll('\\', '\\\\')
  .replaceAll('"', '\\"');

const TOKEN_REFRESH_SKEW_MS = 60_000;
const OPAQUE_TOKEN_TTL_MS = 5 * 60_000;

const tokenExpiresAt = (token: string) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8')) as { exp?: unknown };
    const seconds = Number(payload.exp || 0);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 0;
  } catch {
    return 0;
  }
};

export class PocketBaseClient {
  readonly baseUrl: string;
  readonly identity: string;
  readonly password: string;
  private token = '';
  private tokenExpiresAt = 0;
  private authenticationRequest: Promise<string> | null = null;

  constructor({ baseUrl, identity, password }: { baseUrl: string; identity: string; password: string }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.identity = identity;
    this.password = password;
  }

  async authenticate() {
    if (this.token && this.tokenExpiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) return this.token;
    if (this.authenticationRequest) return this.authenticationRequest;
    if (!this.identity || !this.password) throw new Error('PocketBase superuser credentials are required');
    this.authenticationRequest = (async () => {
      const result = await this.request<{ token: string }>('/api/collections/_superusers/auth-with-password', {
        method: 'POST',
        body: JSON.stringify({ identity: this.identity, password: this.password }),
      });
      this.token = result.token;
      this.tokenExpiresAt = tokenExpiresAt(result.token) || Date.now() + OPAQUE_TOKEN_TTL_MS;
      return this.token;
    })();
    try {
      return await this.authenticationRequest;
    } finally {
      this.authenticationRequest = null;
    }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(await errorText(response));
    if (response.status === 204) return null as T;
    return response.json() as Promise<T>;
  }

  async authenticatedRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.authenticate();
    try {
      return await this.request<T>(path, { ...options, token });
    } catch (error) {
      if (!String(error).includes('401')) throw error;
      this.token = '';
      this.tokenExpiresAt = 0;
      return this.request<T>(path, { ...options, token: await this.authenticate() });
    }
  }

  async listAll<T extends PocketBaseRecord>(collection: string, {
    filter,
    sort,
    perPage = 200,
  }: { filter?: string; sort?: string; perPage?: number } = {}): Promise<T[]> {
    const items: T[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (filter) params.set('filter', filter);
      if (sort) params.set('sort', sort);
      const result = await this.authenticatedRequest<{ items?: T[]; totalPages?: number }>(
        `/api/collections/${encodeURIComponent(collection)}/records?${params}`,
      );
      items.push(...(result.items || []));
      totalPages = Number(result.totalPages || 1);
      page += 1;
    } while (page <= totalPages);
    return items;
  }

  async create<T extends PocketBaseRecord>(collection: string, data: Record<string, unknown>): Promise<T> {
    return this.authenticatedRequest<T>(`/api/collections/${encodeURIComponent(collection)}/records`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update<T extends PocketBaseRecord>(collection: string, id: string, data: Record<string, unknown>): Promise<T> {
    return this.authenticatedRequest<T>(
      `/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    );
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.authenticatedRequest<void>(
      `/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  }
}

export const pocketBaseEqualsAny = (field: string, values: string[]) => values
  .map((value) => `${field} = "${escapeFilterValue(value)}"`)
  .join(' || ');

export const asPocketBaseDate = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+08:00` : raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};
