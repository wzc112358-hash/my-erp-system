import { pb } from '@/lib/pocketbase';

import type {
  ExpenseRecord,
  ExpenseRecordFormData,
  ExpenseRecordListParams,
} from '@/types/expense-record';

export const ExpenseRecordAPI = {
  list: async (params: ExpenseRecordListParams = {}) => {
    const result = await pb.collection('expense_records').getList<ExpenseRecord>(
      params.page || 1,
      params.per_page || 500,
      { expand: 'creator_user' }
    );

    let filtered = result.items;

    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter((i) =>
        i.no?.toLowerCase().includes(s) ||
        i.expense_type?.toLowerCase().includes(s) ||
        i.description?.toLowerCase().includes(s)
      );
    }

    const page = params.page || 1;
    const perPage = params.per_page || 10;
    const start = (page - 1) * perPage;

    return {
      ...result,
      items: filtered.slice(start, start + perPage),
      totalItems: filtered.length,
    };
  },

  getById: async (id: string) => {
    return pb.collection('expense_records').getOne<ExpenseRecord>(id, {
      expand: 'creator_user',
    });
  },

  create: async (data: ExpenseRecordFormData) => {
    const formData = new FormData();
    formData.append('no', data.no);
    formData.append('expense_type', data.expense_type);
    formData.append('description', data.description);
    if (data.payment_amount !== undefined) formData.append('payment_amount', String(data.payment_amount));
    formData.append('pay_date', data.pay_date);
    if (data.method) formData.append('method', data.method);
    if (data.remark) formData.append('remark', data.remark);
    if (data.purchasing_manager) formData.append('purchasing_manager', data.purchasing_manager);
    formData.append('creator_user', pb.authStore.record?.id || '');
    if (data.attachments !== undefined) {
      if (data.attachments.length === 0) {
            formData.append('attachments', '');
      } else {
            data.attachments.forEach((file) => {
                  formData.append('attachments', file);
            });
      }
      }
    return pb.collection('expense_records').create<ExpenseRecord>(formData);
  },

  update: async (id: string, data: Partial<ExpenseRecordFormData>) => {
    const formData = new FormData();
    if (data.no !== undefined) formData.append('no', data.no);
    if (data.expense_type !== undefined) formData.append('expense_type', data.expense_type);
    if (data.description !== undefined) formData.append('description', data.description);
    if (data.payment_amount !== undefined) formData.append('payment_amount', String(data.payment_amount));
    if (data.pay_date !== undefined) formData.append('pay_date', data.pay_date);
    if (data.method !== undefined) formData.append('method', data.method || '');
    if (data.remark !== undefined) formData.append('remark', data.remark);
    if (data.purchasing_manager !== undefined) formData.append('purchasing_manager', data.purchasing_manager || '');
    if (data.attachments !== undefined) {
      if (data.attachments.length === 0) {
            formData.append('attachments', '');
      } else {
            data.attachments.forEach((file) => {
                  formData.append('attachments', file);
            });
      }
      }
    return pb.collection('expense_records').update<ExpenseRecord>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('expense_records').delete(id);
  },
};
