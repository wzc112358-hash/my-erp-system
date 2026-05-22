import { pb } from '@/lib/pocketbase';
import { createWithAttachments } from './helpers';

import type { 
  SalesContract, 
  SalesContractFormData, 
  SalesContractListParams,
  SalesShipment,
  SaleInvoice,
  SaleReceipt
} from '@/types/sales-contract';

export const SalesContractAPI = {
  list: async (params: SalesContractListParams = {}) => {
    const filters: string[] = [];

    if (params.search) {
      filters.push(`(no ~ "${params.search}" || product_name ~ "${params.search}")`);
    }
    if (params.status) {
      filters.push(`status = "${params.status}"`);
    }

    const result = await pb.collection('sales_contracts').getList<SalesContract>(
      params.page || 1,
      params.per_page || 10,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
      }
    );

    return result;
  },

  getById: async (id: string) => {
    return pb.collection('sales_contracts').getOne<SalesContract>(id, {
      expand: 'customer,creator,purchase_contract',
    });
  },

  create: async (data: SalesContractFormData) => {
    const attachments = data.attachments;

    const formData = new FormData();
    formData.append('no', data.no);
    formData.append('customer', data.customer);
    if (data.purchase_contract) {
      formData.append('purchase_contract', data.purchase_contract);
    }
    formData.append('product_name', data.product_name);
    formData.append('unit_price', String(data.unit_price));
    formData.append('total_quantity', String(data.total_quantity));
    formData.append('sign_date', data.sign_date);
    formData.append('creator_user', pb.authStore.record?.id || '');
    if (data.remark) formData.append('remark', data.remark);
    if (data.sales_manager) formData.append('sales_manager', data.sales_manager);
    if (data.is_price_excluding_tax !== undefined) formData.append('is_price_excluding_tax', String(data.is_price_excluding_tax));
    if (data.is_cross_border !== undefined) formData.append('is_cross_border', String(data.is_cross_border));

    return createWithAttachments<SalesContract>(
      'sales_contracts',
      formData,
      attachments,
    );
  },

  update: async (id: string, data: Partial<SalesContractFormData>) => {
    const formData = new FormData();
    if (data.no !== undefined) formData.append('no', data.no);
    if (data.customer !== undefined) formData.append('customer', data.customer);
    if (data.purchase_contract !== undefined) {
      if (data.purchase_contract) {
        formData.append('purchase_contract', data.purchase_contract);
      } else {
        formData.append('purchase_contract', '');
      }
    }
    if (data.product_name !== undefined) formData.append('product_name', data.product_name);
    if (data.unit_price !== undefined) formData.append('unit_price', String(data.unit_price));
    if (data.total_quantity !== undefined) formData.append('total_quantity', String(data.total_quantity));
    if (data.sign_date !== undefined) formData.append('sign_date', data.sign_date);
    if (data.remark !== undefined) formData.append('remark', data.remark);
    if (data.sales_manager !== undefined) formData.append('sales_manager', data.sales_manager || '');
    if (data.is_price_excluding_tax !== undefined) formData.append('is_price_excluding_tax', String(data.is_price_excluding_tax));
    if (data.is_cross_border !== undefined) formData.append('is_cross_border', String(data.is_cross_border));
    if (data.attachments !== undefined) {
      if (data.attachments.length === 0) {
            formData.append('attachments', '');
      } else {
            data.attachments.forEach((file) => {
                  formData.append('attachments', file);
            });
      }
      }
    
    return pb.collection('sales_contracts').update<SalesContract>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('sales_contracts').delete(id);
  },

  getShipments: async (contractId: string) => {
    return pb.collection('sales_shipments').getList<SalesShipment>(
      1,
      100,
      {
        filter: `sales_contract = "${contractId}"`,
      }
    );
  },

  getInvoices: async (contractId: string) => {
    return pb.collection('sale_invoices').getList<SaleInvoice>(
      1,
      100,
      {
        filter: `sales_contract = "${contractId}"`,
      }
    );
  },

  getReceipts: async (contractId: string) => {
    return pb.collection('sale_receipts').getList<SaleReceipt>(
      1,
      100,
      {
        filter: `sales_contract = "${contractId}"`,
      }
    );
  },
};
