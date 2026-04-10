import { pb } from '@/lib/pocketbase';

import type {
  BiddingRecord,
  BiddingRecordFormData,
  BiddingRecordListParams,
} from '@/types/bidding-record';

export const BiddingRecordAPI = {
  list: async (params: BiddingRecordListParams = {}) => {
    const result = await pb.collection('bidding_records').getList<BiddingRecord>(
      params.page || 1,
      params.per_page || 500,
      { expand: 'sales_contract,creator_user' }
    );

    let filtered = result.items;

    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter((i) =>
        i.bidding_company?.toLowerCase().includes(s) ||
        i.bidding_no?.toLowerCase().includes(s) ||
        i.product_name?.toLowerCase().includes(s)
      );
    }

    if (params.bid_result) {
      filtered = filtered.filter((i) => i.bid_result === params.bid_result);
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
    return pb.collection('bidding_records').getOne<BiddingRecord>(id, {
      expand: 'sales_contract,creator_user',
    });
  },

  create: async (data: BiddingRecordFormData) => {
    const formData = new FormData();
    formData.append('bidding_company', data.bidding_company);
    formData.append('bidding_no', data.bidding_no);
    formData.append('product_name', data.product_name);
    formData.append('quantity', String(data.quantity));
    formData.append('creator_user', pb.authStore.record?.id || '');
    if (data.tender_fee !== undefined) formData.append('tender_fee', String(data.tender_fee));
    if (data.tender_fee_date) formData.append('tender_fee_date', data.tender_fee_date);
    if (data.bid_bond !== undefined) formData.append('bid_bond', String(data.bid_bond));
    if (data.bid_bond_date) formData.append('bid_bond_date', data.bid_bond_date);
    if (data.open_date) formData.append('open_date', data.open_date);
    if (data.bid_result) formData.append('bid_result', data.bid_result);
    if (data.bond_return_date) formData.append('bond_return_date', data.bond_return_date);
    if (data.bond_return_amount !== undefined) formData.append('bond_return_amount', String(data.bond_return_amount));
    if (data.agency_fee !== undefined) formData.append('agency_fee', String(data.agency_fee));
    if (data.sales_contract) formData.append('sales_contract', data.sales_contract);
    if (data.remark) formData.append('remark', data.remark);
    if (data.tender_fee_invoice && data.tender_fee_invoice.length > 0) {
      data.tender_fee_invoice.forEach((file) => {
        formData.append('tender_fee_invoice', file);
      });
    }
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('bidding_records').create<BiddingRecord>(formData);
  },

  update: async (id: string, data: Partial<BiddingRecordFormData>) => {
    const formData = new FormData();
    if (data.bidding_company !== undefined) formData.append('bidding_company', data.bidding_company);
    if (data.bidding_no !== undefined) formData.append('bidding_no', data.bidding_no);
    if (data.product_name !== undefined) formData.append('product_name', data.product_name);
    if (data.quantity !== undefined) formData.append('quantity', String(data.quantity));
    if (data.tender_fee !== undefined) formData.append('tender_fee', String(data.tender_fee));
    if (data.tender_fee_date !== undefined) formData.append('tender_fee_date', data.tender_fee_date || '');
    if (data.bid_bond !== undefined) formData.append('bid_bond', String(data.bid_bond));
    if (data.bid_bond_date !== undefined) formData.append('bid_bond_date', data.bid_bond_date || '');
    if (data.open_date !== undefined) formData.append('open_date', data.open_date || '');
    if (data.bid_result !== undefined) formData.append('bid_result', data.bid_result);
    if (data.bond_return_date !== undefined) formData.append('bond_return_date', data.bond_return_date || '');
    if (data.bond_return_amount !== undefined) formData.append('bond_return_amount', String(data.bond_return_amount));
    if (data.agency_fee !== undefined) formData.append('agency_fee', String(data.agency_fee));
    if (data.sales_contract !== undefined) {
      if (data.sales_contract) {
        formData.append('sales_contract', data.sales_contract);
      } else {
        formData.append('sales_contract', '');
      }
    }
    if (data.remark !== undefined) formData.append('remark', data.remark);
    if (data.tender_fee_invoice && data.tender_fee_invoice.length > 0) {
      data.tender_fee_invoice.forEach((file) => {
        formData.append('tender_fee_invoice', file);
      });
    }
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }
    return pb.collection('bidding_records').update<BiddingRecord>(id, formData);
  },

  delete: async (id: string) => {
    return pb.collection('bidding_records').delete(id);
  },

  getBySalesContract: async (contractId: string) => {
    return pb.collection('bidding_records').getList<BiddingRecord>(1, 100, {
      filter: `sales_contract = "${contractId}"`,
    });
  },
};
