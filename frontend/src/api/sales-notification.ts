import { createNotificationApi } from './notification';

import type { SalesNotification } from '@/types/sales-notification';

// 销售侧通知（notifications_02 表，expand purchase_contract）。
// 复用 notification.ts 的工厂，仅集合名与 expand 关联名不同。
export const SalesNotificationAPI = createNotificationApi<SalesNotification>('notifications_02', 'purchase_contract');
