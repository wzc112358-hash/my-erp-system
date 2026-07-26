import { pb } from '@/lib/pocketbase';
import { createWithAttachments } from './helpers';

import type {
  BiddingRecord,
  BiddingRecordFormData,
  BiddingRecordListParams,
} from '@/types/bidding-record';

export const BiddingRecordAPI = {
  list: async (params: BiddingRecordListParams = {}) => {
    const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    const filters: string[] = [];
    if (params.search) {
      const search = escape(params.search.trim());
      filters.push(`(bidding_company ~ "${search}" || bidding_no ~ "${search}" || product_name ~ "${search}")`);
    }
    if (params.bid_result) filters.push(`bid_result = "${escape(params.bid_result)}"`);
    return pb.collection('bidding_records').getList<BiddingRecord>(
      params.page || 1,
      params.per_page || 10,
      {
        expand: 'sales_contract,creator_user',
        sort: '-created',
        filter: filters.join(' && '),
      },
    );
  },

  getById: async (id: string) => {
    return pb.collection('bidding_records').getOne<BiddingRecord>(id, {
      expand: 'sales_contract,creator_user',
    });
  },

  create: async (data: BiddingRecordFormData) => {
    const attachments = data.attachments?.filter((item): item is File | string => (
      item instanceof File || typeof item === 'string'
    ));
    const formData = new FormData();
    formData.append('bidding_company', data.bidding_company);
    formData.append('bidding_no', data.bidding_no);
    formData.append('product_name', data.product_name);
    if (data.quantity !== undefined) formData.append('quantity', String(data.quantity));
    if (data.quantity_unit) formData.append('quantity_unit', data.quantity_unit);
    if (data.specification) formData.append('specification', data.specification);
    if (data.purity) formData.append('purity', data.purity);
    if (data.packaging) formData.append('packaging', data.packaging);
    if (data.quoted_unit_price !== undefined) formData.append('quoted_unit_price', String(data.quoted_unit_price));
    if (data.quoted_total_amount !== undefined) formData.append('quoted_total_amount', String(data.quoted_total_amount));
    if (data.currency) formData.append('currency', data.currency);
    formData.append('creator_user', pb.authStore.record?.id || '');
    if (data.tender_fee !== undefined) formData.append('tender_fee', String(data.tender_fee));
    if (data.tender_fee_date) formData.append('tender_fee_date', String(data.tender_fee_date));
    if (data.bid_bond !== undefined) formData.append('bid_bond', String(data.bid_bond));
    if (data.bid_bond_date) formData.append('bid_bond_date', String(data.bid_bond_date));
    if (data.open_date) formData.append('open_date', String(data.open_date));
    if (data.bid_result) formData.append('bid_result', data.bid_result);
    if (data.bond_return_date) formData.append('bond_return_date', String(data.bond_return_date));
    if (data.bond_return_amount !== undefined) formData.append('bond_return_amount', String(data.bond_return_amount));
    if (data.agency_fee !== undefined) formData.append('agency_fee', String(data.agency_fee));
    if (data.winning_unit_price !== undefined) formData.append('winning_unit_price', String(data.winning_unit_price));
    if (data.winning_total_amount !== undefined) formData.append('winning_total_amount', String(data.winning_total_amount));
    if (data.winning_supplier) formData.append('winning_supplier', data.winning_supplier);
    if (data.brand) formData.append('brand', data.brand);
    if (data.loss_reason) formData.append('loss_reason', data.loss_reason);
    if (data.qualification_snapshot?.length) formData.append('qualification_snapshot', JSON.stringify(data.qualification_snapshot));
    if (data.source_notice_id) formData.append('source_notice_id', data.source_notice_id);
    if (data.source_notice_fingerprint) formData.append('source_notice_fingerprint', data.source_notice_fingerprint);
    if (data.source_notice_title) formData.append('source_notice_title', data.source_notice_title);
    if (data.source_notice_url) formData.append('source_notice_url', data.source_notice_url);
    if (data.source_name) formData.append('source_name', data.source_name);
    if (data.sales_contract) formData.append('sales_contract', data.sales_contract);
    if (data.remark) formData.append('remark', data.remark);
    if (data.tender_fee_invoice && data.tender_fee_invoice.length > 0) {
      data.tender_fee_invoice.forEach((file) => {
        if (file instanceof File) formData.append('tender_fee_invoice', file);
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
    if (data.quantity_unit !== undefined) formData.append('quantity_unit', data.quantity_unit || '');
    if (data.specification !== undefined) formData.append('specification', data.specification || '');
    if (data.purity !== undefined) formData.append('purity', data.purity || '');
    if (data.packaging !== undefined) formData.append('packaging', data.packaging || '');
    if (data.quoted_unit_price !== undefined) formData.append('quoted_unit_price', String(data.quoted_unit_price));
    if (data.quoted_total_amount !== undefined) formData.append('quoted_total_amount', String(data.quoted_total_amount));
    if (data.currency !== undefined) formData.append('currency', data.currency || '');
    if (data.tender_fee !== undefined) formData.append('tender_fee', String(data.tender_fee));
    if (data.tender_fee_date !== undefined) formData.append('tender_fee_date', data.tender_fee_date ? String(data.tender_fee_date) : '');
    if (data.bid_bond !== undefined) formData.append('bid_bond', String(data.bid_bond));
    if (data.bid_bond_date !== undefined) formData.append('bid_bond_date', data.bid_bond_date ? String(data.bid_bond_date) : '');
    if (data.open_date !== undefined) formData.append('open_date', data.open_date ? String(data.open_date) : '');
    if (data.bid_result !== undefined) formData.append('bid_result', data.bid_result);
    if (data.bond_return_date !== undefined) formData.append('bond_return_date', data.bond_return_date ? String(data.bond_return_date) : '');
    if (data.bond_return_amount !== undefined) formData.append('bond_return_amount', String(data.bond_return_amount));
    if (data.agency_fee !== undefined) formData.append('agency_fee', String(data.agency_fee));
    if (data.winning_unit_price !== undefined) formData.append('winning_unit_price', String(data.winning_unit_price));
    if (data.winning_total_amount !== undefined) formData.append('winning_total_amount', String(data.winning_total_amount));
    if (data.winning_supplier !== undefined) formData.append('winning_supplier', data.winning_supplier || '');
    if (data.brand !== undefined) formData.append('brand', data.brand || '');
    if (data.loss_reason !== undefined) formData.append('loss_reason', data.loss_reason || '');
    if (data.qualification_snapshot !== undefined) formData.append('qualification_snapshot', JSON.stringify(data.qualification_snapshot || []));
    if (data.source_notice_id !== undefined) formData.append('source_notice_id', data.source_notice_id || '');
    if (data.source_notice_fingerprint !== undefined) formData.append('source_notice_fingerprint', data.source_notice_fingerprint || '');
    if (data.source_notice_title !== undefined) formData.append('source_notice_title', data.source_notice_title || '');
    if (data.source_notice_url !== undefined) formData.append('source_notice_url', data.source_notice_url || '');
    if (data.source_name !== undefined) formData.append('source_name', data.source_name || '');
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
        if (file instanceof File) formData.append('tender_fee_invoice', file);
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
