import { pb } from '@/lib/pocketbase';
import { createWithAttachments } from './helpers';

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
      1,
      500,
      options
    );

    return {
      ...result,
      items: result.items,
      totalItems: result.items.length,
    };
  },

  getById: async (id: string) => {
    return pb.collection('stock_movements').getOne<StockMovement>(id, {
      expand: 'inventory',
    });
  },

  create: async (data: StockMovementFormData) => {
    const attachments = data.attachments;
    const formData = new FormData();
    formData.append('inventory', data.inventory);
    formData.append('movement_type', data.movement_type);
    formData.append('quantity', String(data.quantity));
    if (data.remark) formData.append('remark', data.remark);
    return createWithAttachments<StockMovement>('stock_movements', formData, attachments);
  },

  delete: async (id: string) => {
    return pb.collection('stock_movements').delete(id);
  },

  update: async (id: string, data: StockMovementFormData) => {
    const formData = new FormData();
    formData.append('inventory', data.inventory);
    formData.append('movement_type', data.movement_type);
    formData.append('quantity', String(data.quantity));
    if (data.remark) formData.append('remark', data.remark);
    return pb.collection('stock_movements').update<StockMovement>(id, formData);
  },
};
