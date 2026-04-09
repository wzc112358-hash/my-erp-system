import { pb } from '@/lib/pocketbase';

import type {
  PurchaseContract,
  PurchaseContractFormData,
  PurchaseContractListParams,
  PurchaseArrival,
  PurchaseInvoice,
  PurchasePayment,
  PurchasePaymentFormData,
  PurchasePaymentListParams,
} from '@/types/purchase-contract';

export const PurchaseContractAPI = {
  list: async (params: PurchaseContractListParams = {}) => {
    const result = await pb.collection('purchase_contracts').getList<PurchaseContract>(
      params.page || 1,
      params.per_page || 500,
      {}
    );

    let filtered = result.items;

    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.no?.toLowerCase().includes(s) || i.product_name?.toLowerCase().includes(s)
      );
    }

    if (params.status) {
      filtered = filtered.filter((i) => i.status === params.status);
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
    return pb.collection('purchase_contracts').getOne<PurchaseContract>(id, {
      expand: 'supplier,sales_contract,creator',
    });
  },

  create: async (data: PurchaseContractFormData) => {
    const formData = new FormData();
    formData.append('no', data.no);
    formData.append('supplier', data.supplier);
    if (data.sales_contract) {
      formData.append('sales_contract', data.sales_contract);
    }
    formData.append('product_name', data.product_name);
    formData.append('unit_price', String(data.unit_price));
    formData.append('total_quantity', String(data.total_quantity));
    formData.append('sign_date', data.sign_date);
    formData.append('creator_user', pb.authStore.record?.id || '');
    if (data.remark) formData.append('remark', data.remark);
    if (data.purchasing_manager) formData.append('purchasing_manager', data.purchasing_manager);
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('purchase_contracts').create<PurchaseContract>(formData);
  },

  update: async (id: string, data: Partial<PurchaseContractFormData>) => {
    const formData = new FormData();
    if (data.no !== undefined) formData.append('no', data.no);
    if (data.supplier !== undefined) formData.append('supplier', data.supplier);
    if (data.sales_contract !== undefined)
      formData.append('sales_contract', data.sales_contract);
    if (data.product_name !== undefined)
      formData.append('product_name', data.product_name);
    if (data.unit_price !== undefined)
      formData.append('unit_price', String(data.unit_price));
    if (data.total_quantity !== undefined)
      formData.append('total_quantity', String(data.total_quantity));
    if (data.sign_date !== undefined) formData.append('sign_date', data.sign_date);
    if (data.remark !== undefined) formData.append('remark', data.remark);
    if (data.purchasing_manager !== undefined) formData.append('purchasing_manager', data.purchasing_manager || '');
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }

    return pb.collection('purchase_contracts').update<PurchaseContract>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('purchase_contracts').delete(id);
  },

  getArrivals: async (contractId: string) => {
    return pb.collection('purchase_arrivals').getList<PurchaseArrival>(
      1,
      100,
      {
        filter: `purchase_contract = "${contractId}"`,
      }
    );
  },

  getInvoices: async (contractId: string) => {
    return pb.collection('purchase_invoices').getList<PurchaseInvoice>(
      1,
      100,
      {
        filter: `purchase_contract = "${contractId}"`,
      }
    );
  },

  getPayments: async (contractId: string) => {
    return pb.collection('purchase_payments').getList<PurchasePayment>(
      1,
      100,
      {
        filter: `purchase_contract = "${contractId}"`,
      }
    );
  },
};

export const PaymentAPI = {
  list: async (params: PurchasePaymentListParams = {}) => {
    const filters: string[] = [];
    if (params.purchase_contract) {
      filters.push(`purchase_contract = "${params.purchase_contract}"`);
    }
    if (params.search) {
      filters.push(`product_name ~ "${params.search}"`);
    }

    return pb.collection('purchase_payments').getList<PurchasePayment>(
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
    return pb.collection('purchase_payments').getOne<PurchasePayment>(id, {
      expand: 'purchase_contract',
    });
  },

  create: async (data: PurchasePaymentFormData) => {
    const formData = new FormData();
    formData.append('no', data.no);
    formData.append('product_name', data.product_name);
    formData.append('purchase_contract', data.purchase_contract);
    formData.append('amount', String(data.amount));
    formData.append('product_amount', String(data.product_amount));
    formData.append('pay_date', data.pay_date);
    if (data.method) formData.append('method', data.method);
    if (data.remark) formData.append('remark', data.remark);
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('purchase_payments').create<PurchasePayment>(formData);
  },

  update: async (id: string, data: Partial<PurchasePaymentFormData>) => {
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
    return pb.collection('purchase_payments').update<PurchasePayment>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('purchase_payments').delete(id);
  },
};
