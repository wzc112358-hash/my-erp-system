import { pb } from '@/lib/pocketbase';

import type { Customer, CustomerFormData, CustomerListParams, SalesContract } from '@/types/customer';

export const CustomerAPI = {
  list: async (params: CustomerListParams = {}) => {
    const filters: string[] = [];
    
    if (params.search) {
      filters.push(`name ~ "${params.search}"`);
    }
    if (params.region) {
      filters.push(`region = "${params.region}"`);
    }
    
    const result = await pb.collection('customers').getList<Customer>(
      1,
      500,
      {
        filter: filters.join(' && '),
      }
    );
    return result;
  },

  create: async (data: CustomerFormData) => {
    try {
      return await pb.collection('customers').create<Customer>(data);
    } catch (error: unknown) {
      const e = error as { response?: { data?: Record<string, { message: string }>; status: number } };
      console.error('Create customer full error:', JSON.stringify(e, null, 2));
      if (e.response?.data) {
        const messages = Object.entries(e.response.data)
          .map(([key, val]) => `${key}: ${val.message}`)
          .join(', ');
        throw new Error(messages);
      }
      throw error;
    }
  },

  update: async (id: string, data: Partial<CustomerFormData>) => {
    try {
      return await pb.collection('customers').update<Customer>(id, data);
    } catch (error: unknown) {
      const e = error as { response?: { data?: Record<string, { message: string }> } };
      console.error('Update customer error:', e);
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
    return pb.collection('customers').delete(id);
  },

  getById: async (id: string) => {
    return pb.collection('customers').getOne<Customer>(id, {
      expand: 'creator',
    });
  },

  getContracts: async (customerId: string) => {
    return pb.collection('sales_contracts').getList<SalesContract>(
      1,
      100,
      {
        filter: `customer = "${customerId}"`,
        expand: 'customer',
      }
    );
  },
};
