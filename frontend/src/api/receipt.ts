import { pb } from '@/lib/pocketbase';
import { createWithAttachments } from './helpers';

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

    const result = await pb.collection('sale_receipts').getList<SaleReceipt>(
      1,
      500,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: 'sales_contract',
      }
    );
    return result;
  },

  getById: async (id: string) => {
    return pb.collection('sale_receipts').getOne<SaleReceipt>(id, {
      expand: 'sales_contract',
    });
  },

  create: async (data: SaleReceiptFormData) => {
    const attachments = data.attachments;
    const formData = new FormData();
    formData.append('product_name', data.product_name);
    formData.append('sales_contract', data.sales_contract);
    formData.append('amount', String(data.amount));
    formData.append('product_amount', String(data.product_amount));
    formData.append('receive_date', data.receive_date);
    if (data.is_tax_included !== undefined) formData.append('is_tax_included', String(data.is_tax_included));
    if (data.method) formData.append('method', data.method);
    if (data.account) formData.append('account', data.account);
    if (data.remark) formData.append('remark', data.remark);
    return createWithAttachments<SaleReceipt>('sale_receipts', formData, attachments);
  },

  update: async (id: string, data: Partial<SaleReceiptFormData>) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'attachments') {
        formData.append(key, String(value));
      }
    });
    if (data.attachments && Array.isArray(data.attachments)) {
      data.attachments.forEach((attachment) => {
        if (attachment instanceof File) {
          formData.append('attachments', attachment);
        } else if (typeof attachment === 'string') {
          formData.append('attachments', attachment);
        }
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
