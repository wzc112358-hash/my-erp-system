import { pb } from '@/lib/pocketbase';
import { createWithAttachments } from './helpers';

import type {
  BiddingRecord,
  BiddingRecordFormData,
  BiddingRecordListParams,
} from '@/types/bidding-record';

export const BiddingRecordAPI = {
  list: async (params: BiddingRecordListParams = {}) => {
    const result = await pb.collection('bidding_records').getList<BiddingRecord>(
      1,
      500,
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

    return {
      ...result,
      items: filtered,
      totalItems: filtered.length,
    };
  },

  getById: async (id: string) => {
    return pb.collection('bidding_records').getOne<BiddingRecord>(id, {
      expand: 'sales_contract,creator_user',
    });
  },

  create: async (data: BiddingRecordFormData) => {
    const attachments = data.attachments;
    const formData = new FormData();
    formData.append('bidding_company', data.bidding_company);
    formData.append('bidding_no', data.bidding_no);
    formData.append('product_name', data.product_name);
    if (data.quantity !== undefined) formData.append('quantity', String(data.quantity));
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
    return createWithAttachments<BiddingRecord>('bidding_records', formData, attachments);
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
    if (data.attachments && Array.isArray(data.attachments)) {
      data.attachments.forEach((attachment) => {
        if (attachment instanceof File) {
          formData.append('attachments', attachment);
        } else if (typeof attachment === 'string') {
          formData.append('attachments', attachment);
        }
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
