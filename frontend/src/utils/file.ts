export const MAX_ATTACHMENT_FILE_SIZE_MB = 100;
export const MAX_ATTACHMENT_FILE_SIZE = MAX_ATTACHMENT_FILE_SIZE_MB * 1024 * 1024;

interface UploadFileLike {
  name?: string;
  url?: string;
  originFileObj?: File;
}

type AttachmentInput = File | string | UploadFileLike;

export const assertAttachmentFileSize = (
  attachments: readonly (File | string)[] | undefined,
): void => {
  const oversizedFile = attachments?.find(
    (attachment): attachment is File =>
      attachment instanceof File && attachment.size > MAX_ATTACHMENT_FILE_SIZE,
  );

  if (oversizedFile) {
    throw new Error(
      `附件“${oversizedFile.name}”超过 ${MAX_ATTACHMENT_FILE_SIZE_MB} MB，请压缩或拆分后重试`,
    );
  }
};

/**
 * 从 Ant Design Upload 组件的 fileList 中提取附件列表
 * 支持已有文件（字符串文件名）和新上传文件（File 对象）的混合列表
 */
export const extractAttachments = (fileList: AttachmentInput[] | undefined): (File | string)[] => {
  if (!fileList || !Array.isArray(fileList)) return [];
  const attachments = fileList
    .map((f) => {
      if (f instanceof File) return f;
      if (typeof f === 'string') return f;
      // 新上传的本地文件
      if (f.originFileObj instanceof File) return f.originFileObj;
      // 已有文件（从服务器加载，url 是文件名）
      if (typeof f.url === 'string' && f.url) return f.url;
      // 备用：使用 name 属性
      if (typeof f.name === 'string' && f.name) return f.name;
      return null;
    })
    .filter((item): item is File | string => item !== null);

  return attachments;
};
