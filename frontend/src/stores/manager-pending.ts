import { create } from 'zustand';
import { pb } from '@/lib/pocketbase';

interface ManagerPendingState {
  pendingCount: number;
  fetchPendingCount: () => Promise<void>;
  setPendingCount: (count: number) => void;
}

export const useManagerPendingStore = create<ManagerPendingState>((set) => ({
  pendingCount: 0,

  fetchPendingCount: async () => {
    try {
      const [salesInvoices, saleReceipts, purchaseArrivals, purchaseInvoices, purchasePayments] = await Promise.all([
        pb.collection('sale_invoices').getList(1, 1, { filter: 'manager_confirmed = "pending"' }),
        pb.collection('sale_receipts').getList(1, 1, { filter: 'manager_confirmed = "pending"' }),
        pb.collection('purchase_arrivals').getList(1, 1, { filter: 'manager_confirmed = "pending"' }),
        pb.collection('purchase_invoices').getList(1, 1, { filter: 'manager_confirmed = "pending"' }),
        pb.collection('purchase_payments').getList(1, 1, { filter: 'manager_confirmed = "pending"' }),
      ]);
      const total = salesInvoices.totalItems + saleReceipts.totalItems + purchaseArrivals.totalItems + purchaseInvoices.totalItems + purchasePayments.totalItems;
      set({ pendingCount: total });
    } catch {
      // silent
    }
  },

  setPendingCount: (count: number) => set({ pendingCount: count }),
}));
