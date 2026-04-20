import { pb } from '@/lib/pocketbase';

import type {
  PurchaseArrival,
  PurchaseArrivalFormData,
  PurchaseArrivalListParams,
} from '@/types/purchase-arrival';

export const PurchaseArrivalAPI = {
  list: async (params: PurchaseArrivalListParams = {}) => {
    const filters: string[] = [];
    if (params.purchase_contract)
      filters.push(`purchase_contract = "${params.purchase_contract}"`);
    if (params.search) {
      filters.push(
        `(tracking_contract_no ~ "${params.search}" || product_name ~ "${params.search}" || logistics_company ~ "${params.search}")`
      );
    }

    const result = await pb.collection('purchase_arrivals').getList<PurchaseArrival>(
      params.page || 1,
      params.per_page || 500,
      {
        filter: filters.length > 0 ? filters.join(' && ') : undefined,
        sort: '-created',
        expand: 'purchase_contract,sales_contract',
      }
    );

    if (params.contractNo) {
      const filtered = result.items.filter((item) =>
        item.expand?.purchase_contract?.no?.includes(params.contractNo || '')
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
    return pb.collection('purchase_arrivals').getOne<PurchaseArrival>(id, {
      expand: 'purchase_contract,sales_contract',
    });
  },

  create: async (data: PurchaseArrivalFormData) => {
    const formData = new FormData();
    formData.append('product_name', data.product_name);
    formData.append('purchase_contract', data.purchase_contract);
    if (data.sales_contract) formData.append('sales_contract', data.sales_contract);
    formData.append('tracking_contract_no', data.tracking_contract_no);
    formData.append('shipment_date', data.shipment_date);
    formData.append('quantity', String(data.quantity));
    formData.append('logistics_company', data.logistics_company);
    formData.append('shipment_address', data.shipment_address);
    formData.append('wether_transit', data.wether_transit);
    if (data.transit_warehouse) formData.append('transit_warehouse', data.transit_warehouse);
    formData.append('delivery_address', data.delivery_address);
    formData.append('freight_1', String(data.freight_1));
    if (data.freight_2 !== undefined) formData.append('freight_2', String(data.freight_2));
    formData.append('miscellaneous_expenses', String(data.miscellaneous_expenses));
    formData.append('freight_1_status', data.freight_1_status);
    if (data.freight_2_status) formData.append('freight_2_status', data.freight_2_status);
    if (data.freight_1_date) formData.append('freight_1_date', data.freight_1_date);
    if (data.freight_2_date) formData.append('freight_2_date', data.freight_2_date);
    formData.append('invoice_1_status', data.invoice_1_status);
    if (data.invoice_2_status) formData.append('invoice_2_status', data.invoice_2_status);
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
    return pb.collection('purchase_arrivals').create<PurchaseArrival>(formData);
  },

  update: async (id: string, data: Partial<PurchaseArrivalFormData>) => {
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
    return pb.collection('purchase_arrivals').update<PurchaseArrival>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('purchase_arrivals').delete(id);
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

export const SalesContractAPI = {
  getSalesOptions: async () => {
    const result = await pb.collection('sales_contracts').getList(1, 100, {});
    return result;
  },
};
