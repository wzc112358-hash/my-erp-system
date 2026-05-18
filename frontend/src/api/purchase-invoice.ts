import { pb } from '@/lib/pocketbase';
import { createWithAttachments } from './helpers';

import type { PurchaseInvoice, PurchaseInvoiceFormData, PurchaseInvoiceListParams } from '@/types/purchase-contract';

export const PurchaseInvoiceAPI = {
  list: async (params: PurchaseInvoiceListParams = {}) => {
    const filters: string[] = [];
    if (params.purchase_contract) {
      filters.push(`purchase_contract = "${params.purchase_contract}"`);
    }
    if (params.search) {
      filters.push(`(no ~ "${params.search}" || product_name ~ "${params.search}")`);
    }

    const result = await pb.collection('purchase_invoices').getList<PurchaseInvoice>(
      1,
      500,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: 'purchase_contract',
      }
    );
    return result;
  },

  getById: async (id: string) => {
    return pb.collection('purchase_invoices').getOne<PurchaseInvoice>(id, {
      expand: 'purchase_contract',
    });
  },

  create: async (data: PurchaseInvoiceFormData) => {
    const attachments = data.attachments;
    const formData = new FormData();
    formData.append('no', data.no);
    formData.append('product_name', data.product_name);
    formData.append('purchase_contract', data.purchase_contract);
    formData.append('invoice_type', data.invoice_type);
    formData.append('product_amount', String(data.product_amount));
    formData.append('amount', String(data.amount));
    formData.append('receive_date', data.receive_date);
    if (data.code) formData.append('code', data.code);
    if (data.supplier) formData.append('supplier', data.supplier);
    if (data.tax_rate) formData.append('tax_rate', String(data.tax_rate));
    if (data.tax_amount) formData.append('tax_amount', String(data.tax_amount));
    if (data.remark) formData.append('remark', data.remark);
    return createWithAttachments<PurchaseInvoice>('purchase_invoices', formData, attachments);
  },

  update: async (id: string, data: Partial<PurchaseInvoiceFormData>) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'attachments') {
        formData.append(key, String(value));
      }
    });
    // Preserve or update attachments
    if (data.attachments && Array.isArray(data.attachments)) {
      data.attachments.forEach((attachment) => {
        if (attachment instanceof File) {
          formData.append('attachments', attachment);
        } else if (typeof attachment === 'string') {
          formData.append('attachments', attachment);
        }
      });
    }
    return pb.collection('purchase_invoices').update<PurchaseInvoice>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('purchase_invoices').delete(id);
  },
};

export const PurchaseContractAPI = {
  getOptions: async () => {
    const result = await pb.collection('purchase_contracts').getList(1, 100, {
      filter: 'status = "executing"',
    });
    return result;
  },
};
