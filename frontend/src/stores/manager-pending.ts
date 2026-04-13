import { create } from 'zustand';
import { ComparisonAPI } from '@/api/comparison';

interface ManagerPendingState {
  pendingCount: number;
  fetchPendingCount: () => Promise<void>;
  setPendingCount: (count: number) => void;
}

export const useManagerPendingStore = create<ManagerPendingState>((set) => ({
  pendingCount: 0,

  fetchPendingCount: async () => {
    try {
      const options = await ComparisonAPI.getUncompletedContracts();
      const total = options.reduce((sum, opt) => sum + (opt.pendingCount ?? 0), 0);
      set({ pendingCount: total });
    } catch {
      // silent
    }
  },

  setPendingCount: (count: number) => set({ pendingCount: count }),
}));
