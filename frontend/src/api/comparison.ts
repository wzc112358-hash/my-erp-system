import { pb } from '@/lib/pocketbase';

import type {
  ComparisonSalesContract,
  ComparisonPurchaseContract,
  ProgressComparison,
  ProfitAnalysis,
  ProgressDetailType,
  ProgressShipmentPerContract,
  ProgressPaymentPerContract,
  ProgressInvoicePerContract,
} from '@/types/comparison';

export const ComparisonAPI = {
  getSalesContracts: async () => {
    const result = await pb.collection('sales_contracts').getList(
      1,
      500,
      {}
    );
    return result;
  },

  getComparisonData: async (salesContractId: string) => {
    const [salesContract, purchaseContractsResult] = await Promise.all([
      pb.collection('sales_contracts').getOne<ComparisonSalesContract>(salesContractId, {
        expand: 'customer',
      }),
      pb.collection('purchase_contracts').getList<ComparisonPurchaseContract>(1, 100, {
        filter: `sales_contract="${salesContractId}"`,
        expand: 'supplier',
      }),
    ]);

    const purchaseContracts = purchaseContractsResult.items;
    const purchaseContractIds = purchaseContracts.map((pc) => pc.id);

    const filterForPurchase = purchaseContractIds.length > 0
      ? purchaseContractIds.map((id) => `purchase_contract="${id}"`).join(' || ')
      : '1=0';

    const [salesShipments, purchaseArrivals, saleReceipts, purchasePayments, saleInvoices, purchaseInvoices] =
      await Promise.all([
        pb.collection('sales_shipments').getList(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }),
        pb.collection('purchase_arrivals').getList(1, 100, {
          filter: filterForPurchase,
        }),
        pb.collection('sale_receipts').getList(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }),
        pb.collection('purchase_payments').getList(1, 100, {
          filter: filterForPurchase,
        }),
        pb.collection('sale_invoices').getList(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }),
        pb.collection('purchase_invoices').getList(1, 100, {
          filter: filterForPurchase,
        }),
      ]);

    const salesShipmentsList = salesShipments.items as unknown as { quantity: number }[];
    const purchaseArrivalsList = purchaseArrivals.items as unknown as {
      quantity: number;
      purchase_contract: string;
      freight_1: number;
      freight_2?: number;
      miscellaneous_expenses: number;
    }[];
    const saleReceiptsList = saleReceipts.items as unknown as { amount: number }[];
    const purchasePaymentsList = purchasePayments.items as unknown as { amount: number; purchase_contract: string }[];
    const saleInvoicesList = saleInvoices.items as unknown as { amount: number }[];
    const purchaseInvoicesList = purchaseInvoices.items as unknown as { amount: number; purchase_contract: string }[];

    const salesShipped = salesShipmentsList.reduce((sum, s) => sum + s.quantity, 0);
    const salesReceipted = saleReceiptsList.reduce((sum, r) => sum + r.amount, 0);
    const salesInvoiced = saleInvoicesList.reduce((sum, i) => sum + i.amount, 0);

    let totalFreight = 0;
    let totalMiscellaneous = 0;

    const shipmentPerContract: ProgressShipmentPerContract[] = purchaseContracts.map((pc) => {
      const arrivals = purchaseArrivalsList.filter((a) => a.purchase_contract === pc.id);
      const quantity = arrivals.reduce((sum, a) => sum + a.quantity, 0);
      const freight1 = arrivals.reduce((sum, a) => sum + (a.freight_1 || 0), 0);
      const freight2 = arrivals.reduce((sum, a) => sum + (a.freight_2 || 0), 0);
      const misc = arrivals.reduce((sum, a) => sum + (a.miscellaneous_expenses || 0), 0);
      
      if (pc.id === purchaseContracts[0]?.id) {
        totalFreight = freight1 + freight2;
        totalMiscellaneous = misc;
      } else {
        totalFreight += freight1 + freight2;
        totalMiscellaneous += misc;
      }

      const salesPercentage = salesShipped > 0 ? (salesShipped / (salesContract.total_quantity || 1)) * 100 : 0;
      const purchasePercentage = pc.total_quantity > 0 ? (quantity / pc.total_quantity) * 100 : 0;

      return {
        purchase_contract_id: pc.id,
        purchase_contract_no: pc.no,
        sales_executed_quantity: salesShipped,
        sales_total_quantity: salesContract.total_quantity || 0,
        purchase_executed_quantity: quantity,
        purchase_total_quantity: pc.total_quantity,
        sales_percentage: salesPercentage,
        purchase_percentage: purchasePercentage,
      };
    });

    const paymentPerContract: ProgressPaymentPerContract[] = purchaseContracts.map((pc) => {
      const payments = purchasePaymentsList.filter((p) => p.purchase_contract === pc.id);
      const amount = payments.reduce((sum, p) => sum + p.amount, 0);
      
      const salesPercentage = salesReceipted > 0 ? (salesReceipted / (salesContract.total_amount || 1)) * 100 : 0;
      const purchasePercentage = pc.total_amount > 0 ? (amount / pc.total_amount) * 100 : 0;

      return {
        purchase_contract_id: pc.id,
        purchase_contract_no: pc.no,
        sales_received_amount: salesReceipted,
        sales_total_amount: salesContract.total_amount || 0,
        purchase_paid_amount: amount,
        purchase_total_amount: pc.total_amount,
        sales_percentage: salesPercentage,
        purchase_percentage: purchasePercentage,
      };
    });

    const invoicePerContract: ProgressInvoicePerContract[] = purchaseContracts.map((pc) => {
      const invoices = purchaseInvoicesList.filter((i) => i.purchase_contract === pc.id);
      const amount = invoices.reduce((sum, i) => sum + i.amount, 0);
      
      const salesPercentage = salesInvoiced > 0 ? (salesInvoiced / (salesContract.total_amount || 1)) * 100 : 0;
      const purchasePercentage = pc.total_amount > 0 ? (amount / pc.total_amount) * 100 : 0;

      return {
        purchase_contract_id: pc.id,
        purchase_contract_no: pc.no,
        sales_invoiced_amount: salesInvoiced,
        sales_total_amount: salesContract.total_amount || 0,
        purchase_invoiced_amount: amount,
        purchase_total_amount: pc.total_amount,
        sales_percentage: salesPercentage,
        purchase_percentage: purchasePercentage,
      };
    });

    const purchaseArrived = purchaseArrivalsList.reduce((sum, a) => sum + a.quantity, 0);
    const purchasePaid = purchasePaymentsList.reduce((sum, p) => sum + p.amount, 0);
    const purchaseInvoiced = purchaseInvoicesList.reduce((sum, i) => sum + i.amount, 0);

    const progress: ProgressComparison = {
      shipment: {
        sales_quantity: salesShipped,
        purchase_quantity: purchaseArrived,
        percentage: salesShipped > 0 ? (purchaseArrived / salesShipped) * 100 : 0,
      },
      shipment_per_contract: shipmentPerContract,
      payment: {
        sales_amount: salesReceipted,
        purchase_amount: purchasePaid,
        percentage: salesReceipted > 0 ? (purchasePaid / salesReceipted) * 100 : 0,
      },
      payment_per_contract: paymentPerContract,
      invoice: {
        sales_amount: salesInvoiced,
        purchase_amount: purchaseInvoiced,
        percentage: salesInvoiced > 0 ? (purchaseInvoiced / salesInvoiced) * 100 : 0,
      },
      invoice_per_contract: invoicePerContract,
    };

    const purchaseTotalAmount = purchaseContracts.reduce((sum, pc) => sum + pc.total_amount, 0);
    const purchaseTotalQuantity = purchaseContracts.reduce((sum, pc) => sum + pc.total_quantity, 0);
    const isQuantityMatched = Math.abs(salesContract.total_quantity - purchaseTotalQuantity) < 0.01;

    const profit: ProfitAnalysis = {
      unit_profit:
        purchaseContracts.length > 0
          ? salesContract.unit_price - purchaseContracts[0].unit_price
          : 0,
      total_profit: salesContract.total_amount - purchaseTotalAmount - totalFreight - totalMiscellaneous,
      sales_amount: salesContract.total_amount,
      purchase_amount: purchaseTotalAmount,
      sales_quantity: salesContract.total_quantity,
      purchase_quantity: purchaseTotalQuantity,
      total_freight: totalFreight,
      total_miscellaneous: totalMiscellaneous,
      is_quantity_matched: isQuantityMatched,
    };

    return {
      sales_contract: salesContract,
      purchase_contracts: purchaseContracts,
      progress,
      profit,
    };
  },

  getProgressDetail: async (salesContractId: string, type: ProgressDetailType) => {
    console.log('getProgressDetail called:', salesContractId, type);
    
    const purchaseContractsResult = await pb.collection('purchase_contracts').getList(1, 100, {
      filter: `sales_contract="${salesContractId}"`,
    }).catch(() => ({ items: [], totalItems: 0, totalPages: 1 }));

    const purchaseContracts = purchaseContractsResult.items;
    const purchaseContractIds = purchaseContracts.map((pc: { id: string }) => pc.id);

    const filterForPurchase = purchaseContractIds.length > 0
      ? purchaseContractIds.map((id: string) => `purchase_contract="${id}"`).join(' || ')
      : '1=0';

    console.log('filterForPurchase:', filterForPurchase);

    switch (type) {
      case 'shipment': {
        const salesShipments = await pb.collection('sales_shipments').getList(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }).catch(() => ({ items: [], totalItems: 0, totalPages: 1 }));
        
        const purchaseArrivals = await pb.collection('purchase_arrivals').getList(1, 100, {
          filter: filterForPurchase,
        }).catch(() => ({ items: [], totalItems: 0, totalPages: 1 }));
        
        return { sales: salesShipments.items, purchase: purchaseArrivals.items };
      }
      case 'payment': {
        const saleReceipts = await pb.collection('sale_receipts').getList(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }).catch((e) => {
          console.error('sale_receipts error:', e);
          return { items: [], totalItems: 0, totalPages: 1 };
        });
        
        const purchasePayments = await pb.collection('purchase_payments').getList(1, 100, {
          filter: filterForPurchase,
        }).catch(() => ({ items: [], totalItems: 0, totalPages: 1 }));
        
        return { sales: saleReceipts.items, purchase: purchasePayments.items };
      }
      case 'invoice': {
        const saleInvoices = await pb.collection('sale_invoices').getList(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }).catch(() => ({ items: [], totalItems: 0, totalPages: 1 }));
        
        const purchaseInvoices = await pb.collection('purchase_invoices').getList(1, 100, {
          filter: filterForPurchase,
        }).catch(() => ({ items: [], totalItems: 0, totalPages: 1 }));
        
        return { sales: saleInvoices.items, purchase: purchaseInvoices.items };
      }
      default:
        return { sales: [], purchase: [] };
    }
  },
};
