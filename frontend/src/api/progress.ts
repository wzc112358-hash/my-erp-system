import { pb } from '@/lib/pocketbase';

import type { SalesContract, SalesShipment, SaleInvoice, SaleReceipt } from '@/types/sales-contract';
import type { PurchaseContract, PurchaseArrival, PurchaseInvoice, PurchasePayment } from '@/types/purchase-contract';
import type { ContractListParams } from '@/types/progress';

export const ProgressAPI = {
  getSalesContracts: async (params: ContractListParams = {}) => {
    const { page = 1, per_page = 20, status, keyword } = params;

    const filters: string[] = [];
    if (status) {
      filters.push(`status="${status}"`);
    }
    if (keyword) {
      filters.push(`(no ?~ "${keyword}" || product_name ?~ "${keyword}")`);
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
      filters.push(`status="${status}"`);
    }
    if (keyword) {
      filters.push(`(no ?~ "${keyword}" || product_name ?~ "${keyword}")`);
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
      pb.collection('sales_shipments').getList<SalesShipment>(1, 100, {
        filter: `sales_contract="${id}"`,
      }),
      pb.collection('sale_invoices').getList<SaleInvoice>(1, 100, {
        filter: `sales_contract="${id}"`,
      }),
      pb.collection('sale_receipts').getList<SaleReceipt>(1, 100, {
        filter: `sales_contract="${id}"`,
      }).catch(() => ({ items: [], totalItems: 0 })),
    ]);

    return {
      contract,
      shipments: shipments.items,
      invoices: invoices.items,
      receipts: receipts.items,
    };
  },

  getPurchaseContractDetail: async (id: string) => {
    const [contract, arrivals, invoices, payments] = await Promise.all([
      pb.collection('purchase_contracts').getOne<PurchaseContract>(id, {
        expand: 'supplier,sales_contract,creator',
      }),
      pb.collection('purchase_arrivals').getList<PurchaseArrival>(1, 100, {
        filter: `purchase_contract="${id}"`,
      }),
      pb.collection('purchase_invoices').getList<PurchaseInvoice>(1, 100, {
        filter: `purchase_contract="${id}"`,
      }),
      pb.collection('purchase_payments').getList<PurchasePayment>(1, 100, {
        filter: `purchase_contract="${id}"`,
      }).catch(() => ({ items: [], totalItems: 0 })),
    ]);

    return {
      contract,
      arrivals: arrivals.items,
      invoices: invoices.items,
      payments: payments.items,
    };
  },
};
