import { pb } from '@/lib/pocketbase';

import type { SaleInvoice, SaleInvoiceFormData, SaleInvoiceListParams } from '@/types/sales-contract';

export const SaleInvoiceAPI = {
  list: async (params: SaleInvoiceListParams = {}) => {
    const filters: string[] = [];
    if (params.sales_contract) {
      filters.push(`sales_contract = "${params.sales_contract}"`);
    }
    if (params.search) {
      filters.push(`(no ~ "${params.search}" || product_name ~ "${params.search}")`);
    }

    return pb.collection('sale_invoices').getList<SaleInvoice>(
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
    return pb.collection('sale_invoices').getOne<SaleInvoice>(id, {
      expand: 'sales_contract',
    });
  },

  create: async (data: SaleInvoiceFormData) => {
    const formData = new FormData();
    formData.append('no', data.no);
    formData.append('product_name', data.product_name);
    formData.append('sales_contract', data.sales_contract);
    formData.append('invoice_type', data.invoice_type);
    formData.append('product_amount', String(data.product_amount));
    formData.append('amount', String(data.amount));
    formData.append('issue_date', data.issue_date);
    if (data.remark) formData.append('remark', data.remark);
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('sale_invoices').create<SaleInvoice>(formData);
  },

  update: async (id: string, data: Partial<SaleInvoiceFormData>) => {
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
    return pb.collection('sale_invoices').update<SaleInvoice>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('sale_invoices').delete(id);
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
