import { create } from 'zustand';
import { NotificationAPI } from '@/api/notification';
import { SalesNotificationAPI } from '@/api/sales-notification';
import { useAuthStore } from './auth';

interface NotificationState {
  unreadCount: number;
  fetchUnreadCount: () => Promise<void>;
  decrementUnread: () => void;
  setUnreadCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,

  fetchUnreadCount: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    try {
      let count = 0;
      if (user.type === 'purchasing') {
        count = await NotificationAPI.getUnreadCount();
      } else if (user.type === 'sales') {
        count = await SalesNotificationAPI.getUnreadCount();
      }
      set({ unreadCount: count });
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  },

  decrementUnread: () => {
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) }));
  },

  setUnreadCount: (count: number) => {
    set({ unreadCount: count });
  },
}));
