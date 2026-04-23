import { pb } from '@/lib/pocketbase';

import type {
  Inventory,
  InventoryFormData,
  InventoryListParams,
} from '@/types/inventory';

export const InventoryAPI = {
  list: async (params: InventoryListParams = {}) => {
    const result = await pb.collection('inventory').getList<Inventory>(
      params.page || 1,
      params.per_page || 500,
    );

    let filtered = result.items;

    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter((i) =>
        i.product_name?.toLowerCase().includes(s) ||
        i.remark?.toLowerCase().includes(s)
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
    return pb.collection('inventory').getOne<Inventory>(id);
  },

  create: async (data: InventoryFormData) => {
    const formData = new FormData();
    formData.append('product_name', data.product_name);
    formData.append('remaining_quantity', '0');
    formData.append('total_in_quantity', '0');
    formData.append('total_out_quantity', '0');
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
    return pb.collection('inventory').create<Inventory>(formData);
  },

  update: async (id: string, data: Partial<InventoryFormData>) => {
    const formData = new FormData();
    if (data.product_name !== undefined) formData.append('product_name', data.product_name);
    if (data.remark !== undefined) formData.append('remark', data.remark || '');
    if (data.attachments !== undefined) {
      if (data.attachments.length === 0) {
        formData.append('attachments', '');
      } else {
        data.attachments.forEach((file) => {
          formData.append('attachments', file);
        });
      }
    }
    return pb.collection('inventory').update<Inventory>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('inventory').delete(id);
  },
};
