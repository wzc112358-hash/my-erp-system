import { pb } from '@/lib/pocketbase';

import type { SaleReceipt, SaleReceiptFormData, SaleReceiptListParams } from '@/types';

export const ReceiptAPI = {
  list: async (params: SaleReceiptListParams = {}) => {
    const filters: string[] = [];
    if (params.sales_contract) {
      filters.push(`sales_contract = "${params.sales_contract}"`);
    }
    if (params.search) {
      filters.push(`product_name ~ "${params.search}"`);
    }

    return pb.collection('sale_receipts').getList<SaleReceipt>(
      params.page || 1,
      params.per_page || 10,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: 'sales_contract',
      }
    );
  },

  getById: async (id: string) => {
    return pb.collection('sale_receipts').getOne<SaleReceipt>(id, {
      expand: 'sales_contract',
    });
  },

  create: async (data: SaleReceiptFormData) => {
    const formData = new FormData();
    formData.append('product_name', data.product_name);
    formData.append('sales_contract', data.sales_contract);
    formData.append('amount', String(data.amount));
    formData.append('product_amount', String(data.product_amount));
    formData.append('receipt_date', data.receipt_date);
    if (data.method) formData.append('method', data.method);
    if (data.account) formData.append('account', data.account);
    if (data.remark) formData.append('remark', data.remark);
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('sale_receipts').create<SaleReceipt>(formData);
  },

  update: async (id: string, data: Partial<SaleReceiptFormData>) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'attachments') {
        formData.append(key, String(value));
      }
    });
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('sale_receipts').update<SaleReceipt>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('sale_receipts').delete(id);
  },
};

export const SalesContractAPI = {
  getOptions: async () => {
    const result = await pb.collection('sales_contracts').getList(1, 100, {
      filter: 'status = "executing"',
    });
    return result;
  },
};
