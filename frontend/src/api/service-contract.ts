import { pb } from '@/lib/pocketbase';

import type {
  ServiceContract,
  ServiceContractFormData,
  ServiceContractListParams,
  ServiceOrder,
  ServiceOrderFormData,
} from '@/types/service-contract';

export const ServiceContractAPI = {
  list: async (params: ServiceContractListParams = {}) => {
    const result = await pb.collection('service_contracts').getList<ServiceContract>(
      params.page || 1,
      params.per_page || 500,
      { expand: 'customer' }
    );

    let filtered = result.items;

    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter((i) =>
        i.no?.toLowerCase().includes(s) || i.product_name?.toLowerCase().includes(s)
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
    return pb.collection('service_contracts').getOne<ServiceContract>(id, {
      expand: 'customer,creator_user',
    });
  },

  create: async (data: ServiceContractFormData) => {
    const formData = new FormData();
    formData.append('no', data.no);
    formData.append('customer', data.customer);
    formData.append('product_name', data.product_name);
    formData.append('sign_date', data.sign_date);
    if (data.remark) formData.append('remark', data.remark);
    if (data.sales_manager) formData.append('sales_manager', data.sales_manager);
    formData.append('creator_user', pb.authStore.record?.id || '');
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('service_contracts').create<ServiceContract>(formData);
  },

  update: async (id: string, data: Partial<ServiceContractFormData>) => {
    const formData = new FormData();
    if (data.no !== undefined) formData.append('no', data.no);
    if (data.customer !== undefined) formData.append('customer', data.customer);
    if (data.product_name !== undefined) formData.append('product_name', data.product_name);
    if (data.sign_date !== undefined) formData.append('sign_date', data.sign_date);
    if (data.remark !== undefined) formData.append('remark', data.remark);
    if (data.sales_manager !== undefined) formData.append('sales_manager', data.sales_manager || '');
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('service_contracts').update<ServiceContract>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('service_contracts').delete(id);
  },

  getOrders: async (contractId: string) => {
    return pb.collection('service_orders').getList<ServiceOrder>(1, 500, {
      filter: `service_contract = "${contractId}"`,
      expand: 'creator_user',
    });
  },

  createOrder: async (data: ServiceOrderFormData) => {
    const formData = new FormData();
    formData.append('service_contract', data.service_contract);
    formData.append('order_no', data.order_no);
    formData.append('unit_price', String(data.unit_price));
    formData.append('quantity', String(data.quantity));
    formData.append('receipt_amount', String(data.receipt_amount));
    formData.append('receipt_date', data.receipt_date);
    if (data.receipt_amount_rmb !== undefined) formData.append('receipt_amount_rmb', String(data.receipt_amount_rmb));
    if (data.receipt_rmb_date) formData.append('receipt_rmb_date', data.receipt_rmb_date);
    if (data.invoice_amount !== undefined) formData.append('invoice_amount', String(data.invoice_amount));
    if (data.invoice_date) formData.append('invoice_date', data.invoice_date);
    if (data.tax_date) formData.append('tax_date', data.tax_date);
    if (data.tax_amount !== undefined) formData.append('tax_amount', String(data.tax_amount));
    if (data.remark) formData.append('remark', data.remark);
    if (data.manager) formData.append('manager', data.manager);
    formData.append('creator_user', pb.authStore.record?.id || '');
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('service_orders').create<ServiceOrder>(formData);
  },

  updateOrder: async (id: string, data: Partial<ServiceOrderFormData>) => {
    const formData = new FormData();
    if (data.order_no !== undefined) formData.append('order_no', data.order_no);
    if (data.unit_price !== undefined) formData.append('unit_price', String(data.unit_price));
    if (data.quantity !== undefined) formData.append('quantity', String(data.quantity));
    if (data.receipt_amount !== undefined) formData.append('receipt_amount', String(data.receipt_amount));
    if (data.receipt_date !== undefined) formData.append('receipt_date', data.receipt_date);
    if (data.receipt_amount_rmb !== undefined) formData.append('receipt_amount_rmb', String(data.receipt_amount_rmb));
    if (data.receipt_rmb_date !== undefined) formData.append('receipt_rmb_date', data.receipt_rmb_date || '');
    if (data.invoice_amount !== undefined) formData.append('invoice_amount', String(data.invoice_amount));
    if (data.invoice_date !== undefined) formData.append('invoice_date', data.invoice_date || '');
    if (data.tax_date !== undefined) formData.append('tax_date', data.tax_date || '');
    if (data.tax_amount !== undefined) formData.append('tax_amount', String(data.tax_amount));
    if (data.remark !== undefined) formData.append('remark', data.remark);
    if (data.manager !== undefined) formData.append('manager', data.manager || '');
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('service_orders').update<ServiceOrder>(id, formData);
  },

  deleteOrder: async (id: string) => {
    return pb.collection('service_orders').delete(id);
  },
};
