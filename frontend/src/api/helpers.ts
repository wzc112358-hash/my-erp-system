import { pb } from '@/lib/pocketbase';

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
