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
