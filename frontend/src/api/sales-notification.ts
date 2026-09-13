import { createNotificationApi } from './notification';

import type { SalesNotification } from '@/types/sales-notification';

// 销售侧通知（notifications_02 表，expand purchase_contract）。
// 复用 notification.ts 的工厂，仅集合名与 expand 关联名不同。
// 物理表 notifications_02 专供销售人员；名称保持不变以兼容历史通知和访问规则。
export const SalesNotificationAPI = createNotificationApi<SalesNotification>('notifications_02', 'purchase_contract');
