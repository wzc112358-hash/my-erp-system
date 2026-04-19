import { pb } from '@/lib/pocketbase';
import { getUsdToCnyRate } from '@/lib/exchange-rate';

import type {
  ComparisonSalesContract,
  ComparisonPurchaseContract,
  ProgressComparison,
  ProfitAnalysis,
  ProgressDetailType,
  ProgressShipmentPerContract,
  ProgressPaymentPerContract,
  ProgressInvoicePerContract,
  OverviewContract,
  SaleReceipt,
  PurchasePayment,
  SalesShipmentRecord,
  SaleInvoiceRecord,
  SaleReceiptRecord,
  PurchaseArrivalRecord,
  PurchaseInvoiceRecord,
  PurchasePaymentRecord,
  ContractDetailData,
  FlowContractOption,
} from '@/types/comparison';

interface PurchaseArrivalItem {
  id: string;
  purchase_contract: string;
  shipment_date: string;
}

interface PurchaseInvoiceItem {
  id: string;
  purchase_contract: string;
  no: string;
}

interface SaleInvoiceItem {
  id: string;
  sales_contract: string;
  no: string;
  issue_date: string;
}

export const ComparisonAPI = {
  getSalesContracts: async () => {
    const result = await pb.collection('sales_contracts').getList(
      1,
      500,
      {}
    );
    return result;
  },

  getAllContractsForOverview: async () => {
    const [salesResult, purchaseResult, saleInvoicesResult, purchaseInvoicesResult, saleReceiptsResult, purchasePaymentsResult, purchaseArrivalsResult] = await Promise.all([
      pb.collection('sales_contracts').getList(1, 500, {
        expand: 'customer',
      }),
      pb.collection('purchase_contracts').getList(1, 500, {
        expand: 'supplier',
      }),
      pb.collection('sale_invoices').getList(1, 500, {}),
      pb.collection('purchase_invoices').getList(1, 500, {}),
      pb.collection('sale_receipts').getList(1, 500, {}),
      pb.collection('purchase_payments').getList(1, 500, {}),
      pb.collection('purchase_arrivals').getList(1, 500, {}),
    ]);

    const salesContracts = salesResult.items as unknown as ComparisonSalesContract[];
    const purchaseContracts = purchaseResult.items as unknown as ComparisonPurchaseContract[];
    const saleInvoices = saleInvoicesResult.items as unknown as SaleInvoiceItem[];
    const purchaseInvoices = purchaseInvoicesResult.items as unknown as PurchaseInvoiceItem[];
    const saleReceipts = saleReceiptsResult.items as unknown as SaleReceipt[];
    const purchasePayments = purchasePaymentsResult.items as unknown as PurchasePayment[];
    const purchaseArrivals = purchaseArrivalsResult.items as unknown as PurchaseArrivalItem[];

    const saleInvoiceMap = new Map<string, { no: string; issueDate: string }>();
    const saleReceiptsMap = new Map<string, string>();
    const purchaseInvoiceMap = new Map<string, string>();
    const purchasePaymentsMap = new Map<string, string>();
    const purchaseArrivalsMap = new Map<string, string>();

    saleInvoices.forEach(inv => {
      if (inv.sales_contract) {
        const existing = saleInvoiceMap.get(inv.sales_contract);
        if (!existing || inv.issue_date > existing.issueDate) {
          saleInvoiceMap.set(inv.sales_contract, { no: inv.no, issueDate: inv.issue_date });
        }
      }
    });

    saleReceipts.forEach(receipt => {
      if (receipt.sales_contract && (!saleReceiptsMap.get(receipt.sales_contract) || receipt.receive_date > saleReceiptsMap.get(receipt.sales_contract)!)) {
        saleReceiptsMap.set(receipt.sales_contract, receipt.receive_date);
      }
    });

    purchaseInvoices.forEach(inv => {
      if (inv.purchase_contract) {
        purchaseInvoiceMap.set(inv.purchase_contract, inv.no);
      }
    });

    purchasePayments.forEach(payment => {
      if (payment.purchase_contract && (!purchasePaymentsMap.get(payment.purchase_contract) || payment.pay_date > purchasePaymentsMap.get(payment.purchase_contract)!)) {
        purchasePaymentsMap.set(payment.purchase_contract, payment.pay_date);
      }
    });

    purchaseArrivals.forEach(arrival => {
      if (arrival.purchase_contract && (!purchaseArrivalsMap.get(arrival.purchase_contract) || arrival.shipment_date > purchaseArrivalsMap.get(arrival.purchase_contract)!)) {
        purchaseArrivalsMap.set(arrival.purchase_contract, arrival.shipment_date);
      }
    });

    const purchaseArrivalsAllDatesMap = new Map<string, string[]>();
    purchaseArrivals.forEach(arrival => {
      if (arrival.purchase_contract) {
        const existing = purchaseArrivalsAllDatesMap.get(arrival.purchase_contract) || [];
        existing.push(arrival.shipment_date);
        purchaseArrivalsAllDatesMap.set(arrival.purchase_contract, existing);
      }
    });

    const purchasePaymentsAllDatesMap = new Map<string, string[]>();
    purchasePayments.forEach(payment => {
      if (payment.purchase_contract) {
        const existing = purchasePaymentsAllDatesMap.get(payment.purchase_contract) || [];
        existing.push(payment.pay_date);
        purchasePaymentsAllDatesMap.set(payment.purchase_contract, existing);
      }
    });

    const overviewSalesContracts: OverviewContract[] = salesContracts.map(sc => {
      const associatedPurchases = purchaseContracts.filter(pc => pc.sales_contract === sc.id);
      const purchaseIds = associatedPurchases.map(pc => pc.id);
      const purchaseNos = associatedPurchases.map(pc => pc.no);
      
      const allShipmentDates: string[] = [];
      const allPaymentDates: string[] = [];
      purchaseIds.forEach(pid => {
        const shipmentDates = purchaseArrivalsAllDatesMap.get(pid) || [];
        const paymentDates = purchasePaymentsAllDatesMap.get(pid) || [];
        allShipmentDates.push(...shipmentDates);
        allPaymentDates.push(...paymentDates);
      });

      return {
        id: sc.id,
        type: 'sales' as const,
        no: sc.no,
        productName: sc.product_name,
        quantity: sc.total_quantity,
        totalAmount: sc.total_amount,
        paymentDate: saleReceiptsMap.get(sc.id) || undefined,
        invoiceNo: saleInvoiceMap.get(sc.id)?.no || undefined,
        invoiceIssueDate: saleInvoiceMap.get(sc.id)?.issueDate || undefined,
        created: sc.created_at || '',
        customerName: sc.expand?.customer?.name || sc.customer_name || '-',
        associatedPurchaseIds: purchaseIds,
        purchaseSummary: purchaseIds.length > 0 ? {
          purchaseIds,
          purchaseNos,
          shipmentDates: allShipmentDates,
          paymentDates: allPaymentDates,
        } : undefined,
      };
    });

    const overviewPurchaseContracts: OverviewContract[] = purchaseContracts.map(pc => ({
      id: pc.id,
      type: 'purchase' as const,
      no: pc.no,
      productName: pc.product_name,
      quantity: pc.total_quantity,
      totalAmount: pc.total_amount,
      paymentDate: purchasePaymentsMap.get(pc.id) || undefined,
      shipmentDate: purchaseArrivalsMap.get(pc.id) || undefined,
      created: pc.created_at || '',
      supplierName: pc.expand?.supplier?.name || pc.supplier_name || '-',
      associatedSalesIds: [pc.sales_contract].filter(Boolean),
    }));

    const associatedPurchaseIds = new Set(
      purchaseContracts.filter(pc => pc.sales_contract).map(pc => pc.id)
    );

    const standalonePurchaseContracts: OverviewContract[] = purchaseContracts
      .filter(pc => !associatedPurchaseIds.has(pc.id))
      .map(pc => ({
        id: pc.id,
        type: 'purchase' as const,
        no: pc.no,
        productName: pc.product_name,
        quantity: pc.total_quantity,
        totalAmount: pc.total_amount,
        paymentDate: purchasePaymentsMap.get(pc.id) || undefined,
        shipmentDate: purchaseArrivalsMap.get(pc.id) || undefined,
        created: pc.created_at || '',
        supplierName: pc.expand?.supplier?.name || pc.supplier_name || '-',
        associatedSalesIds: [],
      }));

    return {
      salesContracts: overviewSalesContracts,
      purchaseContracts: overviewPurchaseContracts,
      standalonePurchaseContracts,
    };
  },

  getComparisonData: async (salesContractId: string) => {
    const rate = await getUsdToCnyRate();
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

    const purchaseTotalAmount = purchaseContracts.reduce((sum, pc) => {
      const amountCny = pc.is_cross_border ? pc.total_amount * rate : pc.total_amount;
      return sum + amountCny;
    }, 0);
    const purchaseTotalQuantity = purchaseContracts.reduce((sum, pc) => sum + pc.total_quantity, 0);
    const isQuantityMatched = Math.abs(salesContract.total_quantity - purchaseTotalQuantity) < 0.01;

    const salesAmountCny = salesContract.is_cross_border ? salesContract.total_amount * rate : salesContract.total_amount;
    const freightCny = totalFreight;
    const miscCny = totalMiscellaneous;

    const profit: ProfitAnalysis = {
      unit_profit:
        purchaseContracts.length > 0
          ? (salesContract.is_price_excluding_tax
            ? salesAmountCny / salesContract.total_quantity * 1.13 - (purchaseContracts[0].is_cross_border ? purchaseContracts[0].unit_price * rate : purchaseContracts[0].unit_price)
            : salesAmountCny / salesContract.total_quantity - (purchaseContracts[0].is_cross_border ? purchaseContracts[0].unit_price * rate : purchaseContracts[0].unit_price))
          : 0,
      total_profit: salesContract.is_price_excluding_tax
        ? salesAmountCny - purchaseTotalAmount / 1.13 - freightCny - miscCny
        : salesAmountCny / 1.13 - purchaseTotalAmount / 1.13 - freightCny - miscCny,
      sales_amount: salesAmountCny,
      purchase_amount: purchaseTotalAmount,
      sales_quantity: salesContract.total_quantity,
      purchase_quantity: purchaseTotalQuantity,
      total_freight: freightCny,
      total_miscellaneous: miscCny,
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
    const purchaseContractsResult = await pb.collection('purchase_contracts').getList(1, 100, {
      filter: `sales_contract="${salesContractId}"`,
    }).catch(() => ({ items: [], totalItems: 0, totalPages: 1 }));

    const purchaseContracts = purchaseContractsResult.items;
    const purchaseContractIds = purchaseContracts.map((pc: { id: string }) => pc.id);

    const filterForPurchase = purchaseContractIds.length > 0
      ? purchaseContractIds.map((id: string) => `purchase_contract="${id}"`).join(' || ')
      : '1=0';

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
        }).catch(() => ({ items: [], totalItems: 0, totalPages: 1 }));
        
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

  getContractDetail: async (salesContractId: string): Promise<ContractDetailData> => {
    const rate = await getUsdToCnyRate();
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

    const [salesShipmentsResult, purchaseArrivalsResult, saleReceiptsResult, purchasePaymentsResult, saleInvoicesResult, purchaseInvoicesResult] =
      await Promise.all([
        pb.collection('sales_shipments').getList<SalesShipmentRecord>(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }),
        pb.collection('purchase_arrivals').getList<PurchaseArrivalRecord>(1, 100, {
          filter: filterForPurchase,
        }),
        pb.collection('sale_receipts').getList<SaleReceiptRecord>(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }),
        pb.collection('purchase_payments').getList<PurchasePaymentRecord>(1, 100, {
          filter: filterForPurchase,
        }),
        pb.collection('sale_invoices').getList<SaleInvoiceRecord>(1, 100, {
          filter: `sales_contract="${salesContractId}"`,
        }),
        pb.collection('purchase_invoices').getList<PurchaseInvoiceRecord>(1, 100, {
          filter: filterForPurchase,
        }),
      ]);

    const salesShipments = salesShipmentsResult.items as unknown as SalesShipmentRecord[];
    const purchaseArrivals = purchaseArrivalsResult.items as unknown as PurchaseArrivalRecord[];
    const saleReceipts = saleReceiptsResult.items as unknown as SaleReceiptRecord[];
    const purchasePayments = purchasePaymentsResult.items as unknown as PurchasePaymentRecord[];
    const saleInvoices = saleInvoicesResult.items as unknown as SaleInvoiceRecord[];
    const purchaseInvoices = purchaseInvoicesResult.items as unknown as PurchaseInvoiceRecord[];

    const purchaseTotalAmount = purchaseContracts.reduce((sum, pc) => {
      const amountCny = pc.is_cross_border ? pc.total_amount * rate : pc.total_amount;
      return sum + amountCny;
    }, 0);
    const purchaseTotalQuantity = purchaseContracts.reduce((sum, pc) => sum + pc.total_quantity, 0);
    const isQuantityMatched = Math.abs(salesContract.total_quantity - purchaseTotalQuantity) < 0.01;

    let totalFreight = 0;
    let totalMiscellaneous = 0;
    const arrivalsRaw = purchaseArrivalsResult.items as unknown as {
      freight_1: number;
      freight_2?: number;
      miscellaneous_expenses: number;
      purchase_contract: string;
    }[];
    arrivalsRaw.forEach((a) => {
      const pc = purchaseContracts.find(p => p.id === a.purchase_contract);
      const crossRate = pc?.is_cross_border ? rate : 1;
      totalFreight += ((a.freight_1 || 0) + (a.freight_2 || 0)) * crossRate;
      totalMiscellaneous += (a.miscellaneous_expenses || 0) * crossRate;
    });

    const salesAmountCny = salesContract.is_cross_border ? salesContract.total_amount * rate : salesContract.total_amount;

    const profit: ProfitAnalysis = {
      unit_profit: purchaseContracts.length > 0
        ? (salesContract.is_price_excluding_tax
          ? salesAmountCny / salesContract.total_quantity * 1.13 - (purchaseContracts[0].is_cross_border ? purchaseContracts[0].unit_price * rate : purchaseContracts[0].unit_price)
          : salesAmountCny / salesContract.total_quantity - (purchaseContracts[0].is_cross_border ? purchaseContracts[0].unit_price * rate : purchaseContracts[0].unit_price))
        : 0,
      total_profit: salesContract.is_price_excluding_tax
        ? salesAmountCny - purchaseTotalAmount / 1.13 - totalFreight - totalMiscellaneous
        : salesAmountCny / 1.13 - purchaseTotalAmount / 1.13 - totalFreight - totalMiscellaneous,
      sales_amount: salesAmountCny,
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
      sales_shipments: salesShipments,
      sale_invoices: saleInvoices,
      sale_receipts: saleReceipts,
      purchase_arrivals: purchaseArrivals,
      purchase_invoices: purchaseInvoices,
      purchase_payments: purchasePayments,
      profit,
    };
  },

  getPurchaseContractDetail: async (purchaseContractId: string): Promise<ContractDetailData> => {
    const rate = await getUsdToCnyRate();
    const purchaseContract = await pb.collection('purchase_contracts').getOne<ComparisonPurchaseContract>(purchaseContractId, {
      expand: 'supplier',
    });

    const filterForPurchase = `purchase_contract="${purchaseContractId}"`;

    const [purchaseArrivalsResult, purchasePaymentsResult, purchaseInvoicesResult] =
      await Promise.all([
        pb.collection('purchase_arrivals').getList<PurchaseArrivalRecord>(1, 100, {
          filter: filterForPurchase,
        }),
        pb.collection('purchase_payments').getList<PurchasePaymentRecord>(1, 100, {
          filter: filterForPurchase,
        }),
        pb.collection('purchase_invoices').getList<PurchaseInvoiceRecord>(1, 100, {
          filter: filterForPurchase,
        }),
      ]);

    const purchaseArrivals = purchaseArrivalsResult.items as unknown as PurchaseArrivalRecord[];
    const purchasePayments = purchasePaymentsResult.items as unknown as PurchasePaymentRecord[];
    const purchaseInvoices = purchaseInvoicesResult.items as unknown as PurchaseInvoiceRecord[];

    const purchaseTotalAmount = purchaseContract.is_cross_border ? purchaseContract.total_amount * rate : purchaseContract.total_amount;

    let totalFreight = 0;
    let totalMiscellaneous = 0;
    const arrivalsRaw = purchaseArrivalsResult.items as unknown as {
      freight_1: number;
      freight_2?: number;
      miscellaneous_expenses: number;
    }[];
    arrivalsRaw.forEach((a) => {
      const crossRate = purchaseContract.is_cross_border ? rate : 1;
      totalFreight += ((a.freight_1 || 0) + (a.freight_2 || 0)) * crossRate;
      totalMiscellaneous += (a.miscellaneous_expenses || 0) * crossRate;
    });

    const profit: ProfitAnalysis = {
      unit_profit: 0,
      total_profit: -purchaseTotalAmount / 1.13 - totalFreight - totalMiscellaneous,
      sales_amount: 0,
      purchase_amount: purchaseTotalAmount,
      sales_quantity: 0,
      purchase_quantity: purchaseContract.total_quantity,
      total_freight: totalFreight,
      total_miscellaneous: totalMiscellaneous,
      is_quantity_matched: true,
    };

    return {
      purchase_contracts: [purchaseContract],
      sales_shipments: [],
      sale_invoices: [],
      sale_receipts: [],
      purchase_arrivals: purchaseArrivals,
      purchase_invoices: purchaseInvoices,
      purchase_payments: purchasePayments,
      profit,
    };
  },

  getUncompletedContracts: async (): Promise<FlowContractOption[]> => {
    const salesResult = await pb.collection('sales_contracts').getList<ComparisonSalesContract>(1, 500, {
      sort: '-created_at',
      expand: 'customer',
    });

    const salesIds = salesResult.items.map((sc) => sc.id);
    const salesFilter = salesIds.length > 0
      ? salesIds.map((id) => `sales_contract="${id}"`).join(' || ')
      : '1=0';

    const purchaseResult = await pb.collection('purchase_contracts').getList(1, 500, {
      filter: salesIds.length > 0 ? salesIds.map((id) => `sales_contract="${id}"`).join(' || ') : '1=0',
    });

    const purchaseIds = (purchaseResult.items as unknown as { id: string }[]).map((pc) => pc.id);
    const purchaseFilter = purchaseIds.length > 0
      ? purchaseIds.map((id) => `purchase_contract="${id}"`).join(' || ')
      : '1=0';

    const [
      saleInvoices, saleReceipts,
      purchaseArrivals, purchaseInvoices, purchasePayments,
    ] = await Promise.all([
      pb.collection('sale_invoices').getList(1, 500, { filter: salesFilter }),
      pb.collection('sale_receipts').getList(1, 500, { filter: salesFilter }),
      pb.collection('purchase_arrivals').getList(1, 500, { filter: purchaseFilter }),
      pb.collection('purchase_invoices').getList(1, 500, { filter: purchaseFilter }),
      pb.collection('purchase_payments').getList(1, 500, { filter: purchaseFilter }),
    ]);

    const getRelatedPcIds = (scId: string): string[] =>
      (purchaseResult.items as unknown as { id: string; sales_contract?: string }[])
        .filter((pc) => pc.sales_contract === scId).map((pc) => pc.id);

    const countPending = (scId: string): number => {
      let count = 0;
      const relatedPcIds = getRelatedPcIds(scId);
      const countSales = (list: { sales_contract?: string; manager_confirmed?: string }[]) => {
        list.forEach((r) => { if (r.sales_contract === scId && r.manager_confirmed === 'pending') count++; });
      };
      const countPurchase = (list: { purchase_contract?: string; manager_confirmed?: string }[]) => {
        list.forEach((r) => { if (relatedPcIds.includes(r.purchase_contract || '') && r.manager_confirmed === 'pending') count++; });
      };
      countSales(saleInvoices.items as unknown as { sales_contract: string; manager_confirmed: string }[]);
      countSales(saleReceipts.items as unknown as { sales_contract: string; manager_confirmed: string }[]);
      countPurchase(purchaseArrivals.items as unknown as { purchase_contract: string; manager_confirmed: string }[]);
      countPurchase(purchaseInvoices.items as unknown as { purchase_contract: string; manager_confirmed: string }[]);
      countPurchase(purchasePayments.items as unknown as { purchase_contract: string; manager_confirmed: string }[]);
      return count;
    };

    const hasPending = (scId: string): boolean => countPending(scId) > 0;

    const allPurchaseCompleted = (scId: string): boolean => {
      const related = (purchaseResult.items as unknown as { id: string; sales_contract?: string; status?: string }[])
        .filter((pc) => pc.sales_contract === scId);
      return related.length === 0 || related.every((pc) => pc.status === 'completed');
    };

    const getLastConfirmedTime = (scId: string): number | null => {
      const times: number[] = [];
      const pcIds = getRelatedPcIds(scId);

      type SubRec = { updated?: string; manager_confirmed?: string; sales_contract?: string; purchase_contract?: string };

      const allRecs: SubRec[] = [
        ...(saleInvoices.items as unknown as SubRec[]),
        ...(saleReceipts.items as unknown as SubRec[]),
        ...(purchaseArrivals.items as unknown as SubRec[]),
        ...(purchaseInvoices.items as unknown as SubRec[]),
        ...(purchasePayments.items as unknown as SubRec[]),
      ];

      for (const r of allRecs) {
        const isSales = r.sales_contract === scId;
        const isPurchase = !!r.purchase_contract && pcIds.includes(r.purchase_contract);
        if ((isSales || isPurchase) && r.manager_confirmed && r.manager_confirmed !== 'pending' && r.updated) {
          times.push(new Date(r.updated).getTime());
        }
      }

      return times.length > 0 ? Math.max(...times) : null;
    };

    const salesOptions = salesResult.items
      .filter((sc) => {
        if (sc.status !== 'completed') return true;
        if (hasPending(sc.id)) return true;
        if (!allPurchaseCompleted(sc.id)) return true;
        const lastTime = getLastConfirmedTime(sc.id);
        if (lastTime === null) return false;
        return (Date.now() - lastTime) < 24 * 60 * 60 * 1000;
      })
      .map((sc) => ({
        id: sc.id,
        no: sc.no,
        productName: sc.product_name,
        quantity: sc.total_quantity,
        signDate: sc.sign_date || '',
        type: 'sales' as const,
        status: sc.status,
        created: sc.created_at || '',
        pendingCount: countPending(sc.id),
      }));

    const standalonePurchases = await pb.collection('purchase_contracts').getList(1, 500, {
      filter: 'sales_contract = "" || sales_contract = null',
      sort: '-created_at',
    });

    const purchaseOptions = (standalonePurchases.items as unknown as { id: string; no: string; product_name: string; total_quantity: number; sign_date?: string; status?: string; created_at?: string }[])
      .filter((pc) => pc.status !== 'completed')
      .map((pc) => ({
        id: pc.id,
        no: pc.no,
        productName: pc.product_name,
        quantity: pc.total_quantity,
        signDate: pc.sign_date || '',
        type: 'purchase' as const,
        status: pc.status || 'executing',
        created: pc.created_at || '',
        pendingCount: 0,
      }));

    return [...salesOptions, ...purchaseOptions]
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  },
};
