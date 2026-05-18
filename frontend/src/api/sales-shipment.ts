import { pb } from '@/lib/pocketbase';
import { createWithAttachments } from './helpers';

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
      1,
      500,
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
      return {
        ...result,
        items: filtered,
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
    const attachments = data.attachments;
    const formData = new FormData();
    formData.append('product_name', data.product_name);
    formData.append('sales_contract', data.sales_contract);
    formData.append('tracking_contract_no', data.tracking_contract_no);
    formData.append('date', data.date);
    formData.append('quantity', String(data.quantity));
    formData.append('logistics_company', data.logistics_company);
    formData.append('delivery_address', data.delivery_address);
    if (data.remark) formData.append('remark', data.remark);
    return createWithAttachments<SalesShipment>('sales_shipments', formData, attachments);
  },

  update: async (id: string, data: Partial<SalesShipmentFormData>) => {
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
