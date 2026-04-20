import { pb } from '@/lib/pocketbase';

import type { SalesShipment, SalesShipmentFormData, SalesShipmentListParams } from '@/types/sales-shipment';
import { SalesContractAPI as SCAPI } from './sales-contract';

export const SalesShipmentAPI = {
  list: async (params: SalesShipmentListParams = {}) => {
    const filters: string[] = [];
    if (params.sales_contract) filters.push(`sales_contract = "${params.sales_contract}"`);
    if (params.search) {
      filters.push(`(tracking_contract_no ~ "${params.search}" || product_name ~ "${params.search}" || logistics_company ~ "${params.search}")`);
    }

    const result = await pb.collection('sales_shipments').getList<SalesShipment>(
      params.page || 1,
      params.per_page || 500,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: 'sales_contract',
      }
    );

    if (params.contractNo) {
      const filtered = result.items.filter(
        (item) => item.expand?.sales_contract?.no?.includes(params.contractNo || '')
      );
      const start = ((params.page || 1) - 1) * (params.per_page || 10);
      const paginated = filtered.slice(start, start + (params.per_page || 10));
      return {
        ...result,
        items: paginated,
        totalItems: filtered.length,
      };
    }

    return result;
  },

  getById: async (id: string) => {
    return pb.collection('sales_shipments').getOne<SalesShipment>(id, {
      expand: 'sales_contract',
    });
  },

  create: async (data: SalesShipmentFormData) => {
    const formData = new FormData();
    formData.append('product_name', data.product_name);
    formData.append('sales_contract', data.sales_contract);
    formData.append('tracking_contract_no', data.tracking_contract_no);
    formData.append('date', data.date);
    formData.append('quantity', String(data.quantity));
    formData.append('logistics_company', data.logistics_company);
    formData.append('delivery_address', data.delivery_address);
    if (data.remark) formData.append('remark', data.remark);
    if (data.attachments !== undefined) {
      if (data.attachments.length === 0) {
            formData.append('attachments', '');
      } else {
            data.attachments.forEach((file) => {
                  formData.append('attachments', file);
            });
      }
      }
    return pb.collection('sales_shipments').create<SalesShipment>(formData);
  },

  update: async (id: string, data: Partial<SalesShipmentFormData>) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'attachments') {
        formData.append(key, String(value));
      }
    });
    if (data.attachments !== undefined) {
      if (data.attachments.length === 0) {
            formData.append('attachments', '');
      } else {
            data.attachments.forEach((file) => {
                  formData.append('attachments', file);
            });
      }
      }
    return pb.collection('sales_shipments').update<SalesShipment>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('sales_shipments').delete(id);
  },
};

export const SalesContractAPI = {
  getOptions: async () => {
    const result = await SCAPI.list({ per_page: 100 });
    return result;
  },
};
