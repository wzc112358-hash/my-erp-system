import { pb } from '@/lib/pocketbase';

import type { SalesNotification, SalesNotificationListParams, SalesNotificationListResult } from '@/types/sales-notification';

export const SalesNotificationAPI = {
  list: async (params: SalesNotificationListParams = {}): Promise<SalesNotificationListResult> => {
    const filters: string[] = [];
    
    if (params.is_read !== undefined) {
      filters.push(`is_read = ${params.is_read}`);
    }

    const result = await pb.collection('notifications_02').getList<SalesNotification>(
      params.page || 1,
      params.per_page || 10,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: 'purchase_contract',
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
    return pb.collection('notifications_02').getOne<SalesNotification>(id, {
      expand: 'purchase_contract',
    });
  },

  markAsRead: async (id: string) => {
    return pb.collection('notifications_02').update<SalesNotification>(id, {
      is_read: true,
    });
  },

  delete: async (id: string) => {
    return pb.collection('notifications_02').delete(id);
  },

  getUnreadCount: async (): Promise<number> => {
    const result = await pb.collection('notifications_02').getList<SalesNotification>(
      1,
      1,
      {
        filter: 'is_read = false',
      }
    );
    return result.totalItems;
  },
};
