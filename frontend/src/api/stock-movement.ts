import { pb } from '@/lib/pocketbase';

import type {
  StockMovement,
  StockMovementFormData,
  StockMovementListParams,
} from '@/types/stock-movement';

export const StockMovementAPI = {
  list: async (params: StockMovementListParams = {}) => {
    const options: Record<string, unknown> = {
      expand: 'inventory',
      sort: '-created',
    };
    
    if (params.inventory) {
      options.filter = `inventory = "${params.inventory}"`;
    }
    
    const result = await pb.collection('stock_movements').getList<StockMovement>(
      params.page || 1,
      params.per_page || 500,
      options
    );

    const page = params.page || 1;
    const perPage = params.per_page || 10;
    const start = (page - 1) * perPage;

    return {
      ...result,
      items: result.items.slice(start, start + perPage),
      totalItems: result.items.length,
    };
  },

  getById: async (id: string) => {
    return pb.collection('stock_movements').getOne<StockMovement>(id, {
      expand: 'inventory',
    });
  },

  create: async (data: StockMovementFormData) => {
    const formData = new FormData();
    formData.append('inventory', data.inventory);
    formData.append('movement_type', data.movement_type);
    formData.append('quantity', String(data.quantity));
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
    return pb.collection('stock_movements').create<StockMovement>(formData);
  },

  delete: async (id: string) => {
    return pb.collection('stock_movements').delete(id);
  },
};
