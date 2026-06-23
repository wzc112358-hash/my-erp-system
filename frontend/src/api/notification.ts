import { pb } from '@/lib/pocketbase';

import type { Notification, NotificationListParams, NotificationListResult } from '@/types/notification';

/**
 * Factory for the notification collection API.
 *
 * 采购/销售两侧的通知表（notifications / notifications_02）结构几乎完全一致，
 * 仅 expand 的关联字段不同（sales_contract vs purchase_contract）。
 * 这里抽一个泛型工厂，两个侧各自传入 collection 名 + expand 关联名即可，
 * 消除此前两个 ~68 行几乎相同的 API 文件。
 *
 * 过滤逻辑与原来保持一致：recipient 同时支持「用户 id」和「角色字符串」
 * （"purchasing" / "sales"）两种取值，所以用 (recipient=userId || recipient=userType)。
 */
export const createNotificationApi = <T>(collectionName: string, expandRelation: string) => ({
  list: async (params: NotificationListParams = {}): Promise<{ items: T[]; totalItems: number; totalPages: number; page: number; perPage: number }> => {
    const filters: string[] = [];

    if (params.is_read !== undefined) {
      filters.push(`is_read = ${params.is_read}`);
    }

    if (pb.authStore.record) {
      const userId = pb.authStore.record.id;
      const userType = (pb.authStore.record as Record<string, unknown>).type || '';
      filters.push(`(recipient = "${userId}" || recipient = "${userType}")`);
    }

    const result = await pb.collection(collectionName).getList<T>(
      1,
      500,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: expandRelation,
      }
    );

    return {
      ...result,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      page: result.page,
      perPage: result.perPage,
    };
  },

  getById: async (id: string) => {
    return pb.collection(collectionName).getOne<T>(id, {
      expand: expandRelation,
    });
  },

  markAsRead: async (id: string) => {
    return pb.collection(collectionName).update<T>(id, {
      is_read: true,
    });
  },

  delete: async (id: string) => {
    return pb.collection(collectionName).delete(id);
  },

  getUnreadCount: async (): Promise<number> => {
    const userId = pb.authStore.record?.id;
    const filter = userId
      ? `is_read = false && recipient = "${userId}"`
      : 'is_read = false';
    const result = await pb.collection(collectionName).getList<T>(
      1,
      1,
      {
        filter,
      }
    );
    return result.totalItems;
  },
});

// 采购侧通知（notifications 表，expand sales_contract）
export const NotificationAPI = createNotificationApi<Notification>('notifications', 'sales_contract');
export type { Notification, NotificationListParams, NotificationListResult };
