import { pb } from '@/lib/pocketbase';

import type { Supplier, SupplierFormData, SupplierListParams, PurchaseContract } from '@/types/supplier';

export const SupplierAPI = {
  list: async (params: SupplierListParams = {}) => {
    const filters: string[] = [];
    
    if (params.search) {
      filters.push(`name ~ "${params.search}"`);
    }
    if (params.region) {
      filters.push(`region = "${params.region}"`);
    }
    
    return pb.collection('suppliers').getList<Supplier>(
      params.page || 1,
      params.per_page || 10,
      {
        filter: filters.join(' && '),
      }
    );
  },

  create: async (data: SupplierFormData) => {
    console.log('Creating supplier with data:', JSON.stringify(data, null, 2));
    try {
      return await pb.collection('suppliers').create<Supplier>(data);
    } catch (error: unknown) {
      const e = error as { response?: { data?: Record<string, { message: string }>; status: number } };
      console.error('Create supplier full error:', JSON.stringify(e, null, 2));
      if (e.response?.data) {
        const messages = Object.entries(e.response.data)
          .map(([key, val]) => `${key}: ${val.message}`)
          .join(', ');
        throw new Error(messages);
      }
      throw error;
    }
  },

  update: async (id: string, data: Partial<SupplierFormData>) => {
    console.log('Updating supplier:', id, 'with data:', JSON.stringify(data, null, 2));
    console.log('PB Auth valid:', pb.authStore.isValid);
    console.log('PB Auth token:', pb.authStore.token ? 'exists' : 'none');
    try {
      return await pb.collection('suppliers').update<Supplier>(id, data);
    } catch (error: unknown) {
      const e = error as { response?: { data?: Record<string, { message: string }> } };
      console.error('Update supplier error:', e);
      if (e.response?.data) {
        const messages = Object.entries(e.response.data)
          .map(([key, val]) => `${key}: ${val.message}`)
          .join(', ');
        throw new Error(messages);
      }
      throw error;
    }
  },

  delete: async (id: string) => {
    console.log('Deleting supplier:', id);
    console.log('PB Auth valid:', pb.authStore.isValid);
    console.log('PB Auth token:', pb.authStore.token ? 'exists' : 'none');
    return pb.collection('suppliers').delete(id);
  },

  getById: async (id: string) => {
    return pb.collection('suppliers').getOne<Supplier>(id, {
      expand: 'creator',
    });
  },

  getContracts: async (supplierId: string) => {
    return pb.collection('purchase_contracts').getList<PurchaseContract>(
      1,
      100,
      {
        filter: `supplier = "${supplierId}"`,
        expand: 'supplier,sales_contract',
      }
    );
  },
};
