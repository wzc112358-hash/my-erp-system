import { pb } from '@/lib/pocketbase';

import type { SalesContract, SalesShipment, SaleInvoice, SaleReceipt } from '@/types/sales-contract';
import type { PurchaseContract, PurchaseArrival, PurchaseInvoice, PurchasePayment } from '@/types/purchase-contract';
import type { ContractListParams } from '@/types/progress';

export const ProgressAPI = {
  getSalesContracts: async (params: ContractListParams = {}) => {
    const { page = 1, per_page = 20, status, keyword } = params;

    const filters: string[] = [];
    if (status) {
      filters.push(pb.filter('status = {:status}', { status }));
    }
    if (keyword) {
      filters.push(pb.filter('(no ?~ {:keyword} || product_name ?~ {:keyword})', { keyword }));
    }

    return pb.collection('sales_contracts').getList<SalesContract>(page, per_page, {
      sort: '-sign_date',
      expand: 'customer',
      filter: filters.join(' && ') || undefined,
    });
  },

  getPurchaseContracts: async (params: ContractListParams = {}) => {
    const { page = 1, per_page = 20, status, keyword } = params;

    const filters: string[] = [];
    if (status) {
      filters.push(pb.filter('status = {:status}', { status }));
    }
    if (keyword) {
      filters.push(pb.filter('(no ?~ {:keyword} || product_name ?~ {:keyword})', { keyword }));
    }

    return pb.collection('purchase_contracts').getList<PurchaseContract>(page, per_page, {
      sort: '-sign_date',
      expand: 'supplier,sales_contract',
      filter: filters.join(' && ') || undefined,
    });
  },

  getSalesContractDetail: async (id: string) => {
    const [contract, shipments, invoices, receipts] = await Promise.all([
      pb.collection('sales_contracts').getOne<SalesContract>(id, {
        expand: 'customer,creator',
      }),
      pb.collection('sales_shipments').getFullList<SalesShipment>({
        filter: pb.filter('sales_contract = {:id}', { id }),
      }),
      pb.collection('sale_invoices').getFullList<SaleInvoice>({
        filter: pb.filter('sales_contract = {:id}', { id }),
      }),
      pb.collection('sale_receipts').getFullList<SaleReceipt>({
        filter: pb.filter('sales_contract = {:id}', { id }),
      }),
    ]);

    return {
      contract,
      shipments,
      invoices,
      receipts,
    };
  },

  getPurchaseContractDetail: async (id: string) => {
    const [contract, arrivals, invoices, payments] = await Promise.all([
      pb.collection('purchase_contracts').getOne<PurchaseContract>(id, {
        expand: 'supplier,sales_contract,creator',
      }),
      pb.collection('purchase_arrivals').getFullList<PurchaseArrival>({
        filter: pb.filter('purchase_contract = {:id}', { id }),
      }),
      pb.collection('purchase_invoices').getFullList<PurchaseInvoice>({
        filter: pb.filter('purchase_contract = {:id}', { id }),
      }),
      pb.collection('purchase_payments').getFullList<PurchasePayment>({
        filter: pb.filter('purchase_contract = {:id}', { id }),
      }),
    ]);

    return {
      contract,
      arrivals,
      invoices,
      payments,
    };
  },
};
