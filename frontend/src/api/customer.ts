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
    
    return pb.collection('customers').getList<Customer>(
      params.page || 1,
      params.per_page || 10,
      {
        filter: filters.join(' && '),
      }
    );
  },

  create: async (data: CustomerFormData) => {
    console.log('Creating customer with data:', JSON.stringify(data, null, 2));
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
    console.log('Updating customer:', id, 'with data:', JSON.stringify(data, null, 2));
    console.log('PB Auth valid:', pb.authStore.isValid);
    console.log('PB Auth token:', pb.authStore.token ? 'exists' : 'none');
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
    console.log('Deleting customer:', id);
    console.log('PB Auth valid:', pb.authStore.isValid);
    console.log('PB Auth token:', pb.authStore.token ? 'exists' : 'none');
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
