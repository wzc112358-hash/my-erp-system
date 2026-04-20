/**
 * 从 Ant Design Upload 组件的 fileList 中提取附件列表
 * 支持已有文件（字符串文件名）和新上传文件（File 对象）的混合列表
 */
export const extractAttachments = (fileList: any[] | undefined): (File | string)[] => {
  if (!fileList || !Array.isArray(fileList)) return [];
  return fileList
    .map((f) => {
      // 新上传的本地文件
      if (f.originFileObj instanceof File) return f.originFileObj;
      // 已有文件（从服务器加载，url 是文件名）
      if (typeof f.url === 'string' && f.url) return f.url;
      // 备用：使用 name 属性
      if (typeof f.name === 'string' && f.name) return f.name;
      return null;
    })
    .filter((item): item is File | string => item !== null);
};
