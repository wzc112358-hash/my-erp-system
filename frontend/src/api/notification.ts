import { pb } from '@/lib/pocketbase';

import type { Notification, NotificationListParams, NotificationListResult } from '@/types/notification';

export const NotificationAPI = {
  list: async (params: NotificationListParams = {}): Promise<NotificationListResult> => {
    const filters: string[] = [];
    
    if (params.is_read !== undefined) {
      filters.push(`is_read = ${params.is_read}`);
    }

    if (pb.authStore.record) {
      filters.push(`recipient = "${pb.authStore.record.id}"`);
    }

    const result = await pb.collection('notifications').getList<Notification>(
      params.page || 1,
      params.per_page || 10,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: 'sales_contract',
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
    return pb.collection('notifications').getOne<Notification>(id, {
      expand: 'sales_contract',
    });
  },

  markAsRead: async (id: string) => {
    return pb.collection('notifications').update<Notification>(id, {
      is_read: true,
    });
  },

  delete: async (id: string) => {
    return pb.collection('notifications').delete(id);
  },

  getUnreadCount: async (): Promise<number> => {
    const userId = pb.authStore.record?.id;
    const filter = userId
      ? `is_read = false && recipient = "${userId}"`
      : 'is_read = false';
    const result = await pb.collection('notifications').getList<Notification>(
      1,
      1,
      {
        filter,
      }
    );
    return result.totalItems;
  },
};
