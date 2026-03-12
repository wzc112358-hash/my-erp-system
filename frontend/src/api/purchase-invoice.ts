import { pb } from '@/lib/pocketbase';

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

    return pb.collection('purchase_invoices').getList<PurchaseInvoice>(
      params.page || 1,
      params.per_page || 10,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: 'purchase_contract',
      }
    );
  },

  getById: async (id: string) => {
    return pb.collection('purchase_invoices').getOne<PurchaseInvoice>(id, {
      expand: 'purchase_contract',
    });
  },

  create: async (data: PurchaseInvoiceFormData) => {
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
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('purchase_invoices').create<PurchaseInvoice>(formData);
  },

  update: async (id: string, data: Partial<PurchaseInvoiceFormData>) => {
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
