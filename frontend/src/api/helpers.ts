import { pb } from '@/lib/pocketbase';

/**
 * PocketBase rejects filter expressions with 90+ OR conditions with a 400
 * error (verified empirically: 89 works, 90 fails). Keep batches comfortably
 * below that limit when querying records by a list of ids/relations.
 */
export const PB_FILTER_BATCH_SIZE = 80;

/**
 * Splits ids into batches, builds `field="id1" || field="id2" ...` filters
 * (one per batch), runs fetchBatch in parallel and merges the results.
 * Use this instead of a single giant OR filter whenever the id list can
 * exceed ~89 entries (e.g. report export with 90+ selected contracts).
 */
export async function fetchAllByFieldBatches<T>(
  ids: string[],
  field: string,
  fetchBatch: (filter: string) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += PB_FILTER_BATCH_SIZE) {
    batches.push(ids.slice(i, i + PB_FILTER_BATCH_SIZE));
  }
  const results = await Promise.all(
    batches.map((batch) => fetchBatch(batch.map((id) => `${field}="${id}"`).join(' || '))),
  );
  return results.flat();
}

/**
 * Create a record in two steps:
 * 1. Create without attachments (fast, minimal SQLite lock time)
 * 2. Update with attachments (separate transaction)
 * This prevents large file uploads from blocking other users' writes.
 */
export const createWithAttachments = async <T>(
  collectionName: string,
  formDataWithoutFiles: FormData,
  attachments: (File | string)[] | undefined,
): Promise<T> => {
  const record = await pb.collection(collectionName).create<T>(formDataWithoutFiles);

  const files = (attachments || []).filter((f) => f instanceof File);
  if (files.length > 0) {
    const fileFormData = new FormData();
    files.forEach((file) => fileFormData.append('attachments', file as File));
    return await pb.collection(collectionName).update<T>((record as { id: string }).id, fileFormData);
  }

  return record;
};

/**
 * Build a FormData from a plain object, skipping undefined values and the
 * `attachments` key (which is handled separately). Existing business API files
 * each hand-write a long `formData.append(...)` chain; this helper lets new
 * modules avoid that boilerplate. Values are stringified (FormData is text-only).
 *
 * NOTE: existing API files are intentionally NOT migrated to this helper in this
 * pass — behavior preservation over consistency. Use it for new code.
 */
export const buildFormData = (
  data: Record<string, unknown>,
  options: { skipKeys?: string[] } = {},
): FormData => {
  const skipKeys = new Set(['attachments', ...(options.skipKeys ?? [])]);
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || skipKeys.has(key)) continue;
    formData.append(key, String(value));
  }
  return formData;
};

interface AppError {
  name?: string;
  message?: string;
  cause?: { name?: string };
}

/**
 * Returns true if an error is a request-abort/cancel (PocketBase auto-cancel,
 * AbortController, etc.). Matches the inline check duplicated across pages
 * (e.g. NotificationList). Used by handleApiError to silently swallow aborts.
 */
export const isAbortedError = (err: unknown): boolean => {
  const error = err as AppError;
  return (
    error.name === 'AbortError' ||
    error.name === 'CanceledError' ||
    !!error.message?.includes('aborted') ||
    !!error.message?.includes('autocancelled') ||
    error.cause?.name === 'AbortError'
  );
};

/**
 * Shared API error handler: silently swallows aborted requests, otherwise logs
 * the error and surfaces a user-facing message via the provided `notify` fn
 * (e.g. Ant Design's `App.useApp().message.error`). Returns true if the error
 * was handled-and-swallowed (abort), false otherwise.
 *
 * Usage in a component:
 *   const { message } = App.useApp();
 *   catch (err) { handleApiError(err, '加载通知列表失败', (m) => message.error(m)); }
 */
export const handleApiError = (
  err: unknown,
  userMessage: string,
  notify: (msg: string) => void,
  context?: string,
): boolean => {
  if (isAbortedError(err)) {
    return true; // silent
  }
  console.error(context ? `[${context}]` : 'API error:', err);
  notify(userMessage);
  return false;
};

interface PbErrorShape {
  message?: string;
  response?: {
    message?: string;
    data?: Record<string, unknown>;
  };
}

/**
 * Extracts a human-readable reason from a PocketBase ClientResponseError.
 * Field-level validation errors live in response.data as
 * `{ fieldName: { message: "..." } }` (e.g. overage guards from Go hooks),
 * so plain `err.message` ("Failed to create record.") hides the real cause.
 * Falls back through response.message → err.message → fallback.
 */
export const getPbErrorMessage = (err: unknown, fallback = '操作失败'): string => {
  const e = err as PbErrorShape;
  const data = e?.response?.data;
  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      if (value && typeof value === 'object' && typeof (value as { message?: string }).message === 'string') {
        return (value as { message: string }).message;
      }
    }
    if (typeof (data as { message?: string }).message === 'string') {
      return (data as { message: string }).message;
    }
  }
  const respMsg = e?.response?.message;
  if (typeof respMsg === 'string' && respMsg && respMsg !== 'Failed to create record.' && respMsg !== 'Failed to update record.') {
    return respMsg;
  }
  const msg = e?.message;
  if (typeof msg === 'string' && msg && msg !== 'Failed to create record.' && msg !== 'Failed to update record.') {
    return msg;
  }
  return fallback;
};
