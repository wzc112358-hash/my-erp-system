import { pb } from '@/lib/pocketbase';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import { fetchAllByFieldBatches } from '@/api/helpers';
import { buildContractRelationIndex } from '@/lib/contract-relations';
import { calculateBusinessDealFinancials } from '@/lib/business-deal-financials';
import { DEFAULT_PROFIT_TAX_RATE } from '@/lib/contract-profit';
import { invoiceNeedsManagerAction, summarizeUnverifiedPurchaseInvoices } from '@/lib/invoice-workflow';

import type {
  ComparisonSalesContract,
  ComparisonPurchaseContract,
  ProfitAnalysis,
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
  BusinessDeal,
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
  amount?: number;
  is_verified?: string;
}

interface SaleInvoiceItem {
  id: string;
  sales_contract: string;
  no: string;
  issue_date: string;
}

const contractProgress = (completedAmount: number, totalAmount: number) => {
  if (totalAmount <= 0) return 0;
  return Math.min(100, Math.max(0, (completedAmount / totalAmount) * 100));
};

const getPurchaseRecords = <T>(collectionName: string, purchaseIds: string[]) => (
  fetchAllByFieldBatches<T>(purchaseIds, 'purchase_contract', (filter) => (
    pb.collection(collectionName).getFullList<T>({ filter })
  ))
);

const getBusinessDealForContract = async (
  contractType: 'sales' | 'purchase',
  contractId: string,
) => {
  const field = contractType === 'sales' ? 'sales_contracts' : 'purchase_contracts';
  const result = await pb.collection('business_deals').getList<BusinessDeal>(1, 1, {
    filter: pb.filter(`${field}.id ?= {:contractId}`, { contractId }),
  });
  return result.items[0];
};

const loadSalesContracts = (ids: string[]) => Promise.all(ids.map((id) => (
  pb.collection('sales_contracts').getOne<ComparisonSalesContract>(id, { expand: 'customer' })
)));

const loadPurchaseContracts = (ids: string[]) => Promise.all(ids.map((id) => (
  pb.collection('purchase_contracts').getOne<ComparisonPurchaseContract>(id, { expand: 'supplier' })
)));

const getOverallContractDetail = async (
  contractType: 'sales' | 'purchase',
  contractId: string,
): Promise<ContractDetailData> => {
  const [rate, businessDeal] = await Promise.all([
    getUsdToCnyRate(),
    getBusinessDealForContract(contractType, contractId),
  ]);
  const salesIds = businessDeal?.sales_contracts || (contractType === 'sales' ? [contractId] : []);
  const purchaseIds = businessDeal?.purchase_contracts || (contractType === 'purchase' ? [contractId] : []);
  const [salesContracts, purchaseContracts] = await Promise.all([
    loadSalesContracts(salesIds),
    loadPurchaseContracts(purchaseIds),
  ]);

  const [salesShipments, purchaseArrivals, saleReceipts, purchasePayments, saleInvoices, purchaseInvoices] = await Promise.all([
    fetchAllByFieldBatches<SalesShipmentRecord>(salesIds, 'sales_contract', (filter) => (
      pb.collection('sales_shipments').getFullList<SalesShipmentRecord>({ filter })
    )),
    getPurchaseRecords<PurchaseArrivalRecord>('purchase_arrivals', purchaseIds),
    fetchAllByFieldBatches<SaleReceiptRecord>(salesIds, 'sales_contract', (filter) => (
      pb.collection('sale_receipts').getFullList<SaleReceiptRecord>({ filter })
    )),
    getPurchaseRecords<PurchasePaymentRecord>('purchase_payments', purchaseIds),
    fetchAllByFieldBatches<SaleInvoiceRecord>(salesIds, 'sales_contract', (filter) => (
      pb.collection('sale_invoices').getFullList<SaleInvoiceRecord>({ filter })
    )),
    getPurchaseRecords<PurchaseInvoiceRecord>('purchase_invoices', purchaseIds),
  ]);

  const taxRate = businessDeal?.tax_rate ?? DEFAULT_PROFIT_TAX_RATE;
  const financials = calculateBusinessDealFinancials({
    salesContracts,
    purchaseContracts,
    salesShipments,
    purchaseArrivals,
    purchasePayments,
    exchangeRate: rate,
    taxRate,
  });
  const profit: ProfitAnalysis = {
    unit_profit: financials.unitProfit,
    total_profit: financials.profit.operatingProfit,
    sales_amount: financials.profit.salesAmountIncTax,
    purchase_amount: financials.profit.purchaseAmountIncTax,
    sales_amount_ex_tax: financials.profit.salesAmountExTax,
    purchase_amount_ex_tax: financials.profit.purchaseAmountExTax,
    sales_quantity: financials.salesQuantity,
    purchase_quantity: financials.purchaseQuantity,
    total_freight: financials.costs.freight,
    total_miscellaneous: financials.costs.miscellaneous,
    total_tariff: financials.costs.tariff,
    total_value_added_tax: financials.costs.valueAddedTax,
    is_quantity_matched: financials.quantityMatched,
    tax_rate: taxRate,
    tax_amount: financials.profit.taxAmount,
    after_tax_profit: financials.profit.netProfit,
    sales_receivable_amount: financials.salesReceivableAmount,
    purchase_paid_amount: financials.purchasePaidAmount,
    realized_sales_quantity: financials.realizedSalesQuantity,
    realized_purchase_quantity: financials.realizedPurchaseQuantity,
    realized_sales_amount: financials.realizedProfit.salesAmountIncTax,
    realized_purchase_amount: financials.realizedProfit.purchaseAmountIncTax,
    realized_freight: financials.costs.freight,
    realized_miscellaneous: financials.costs.miscellaneous,
    realized_operating_profit: financials.realizedProfit.operatingProfit,
    realized_tax: financials.realizedProfit.taxAmount,
    realized_net_profit: financials.realizedProfit.netProfit,
  };

  const selectedSales = contractType === 'sales'
    ? salesContracts.find((contract) => contract.id === contractId)
    : salesContracts[0];
  return {
    business_deal: businessDeal,
    sales_contract: selectedSales,
    sales_contracts: salesContracts,
    purchase_contracts: purchaseContracts,
    sales_shipments: salesShipments,
    sale_invoices: saleInvoices,
    sale_receipts: saleReceipts,
    purchase_arrivals: purchaseArrivals,
    purchase_invoices: purchaseInvoices,
    purchase_payments: purchasePayments,
    profit,
  };
};

export const ComparisonAPI = {
  getSalesContracts: async () => {
    const items = await pb.collection('sales_contracts').getFullList();
    return { page: 1, perPage: items.length, totalItems: items.length, totalPages: 1, items };
  },

  getAllContractsForOverview: async () => {
    const [salesItems, purchaseItems, businessDealItems, saleInvoiceItems, purchaseInvoiceItems, saleReceiptItems, purchasePaymentItems, purchaseArrivalItems] = await Promise.all([
      pb.collection('sales_contracts').getFullList({
        expand: 'customer',
      }),
      pb.collection('purchase_contracts').getFullList({
        expand: 'supplier',
      }),
      pb.collection('business_deals').getFullList<BusinessDeal>({ sort: 'deal_date' }),
      pb.collection('sale_invoices').getFullList(),
      pb.collection('purchase_invoices').getFullList(),
      pb.collection('sale_receipts').getFullList(),
      pb.collection('purchase_payments').getFullList(),
      pb.collection('purchase_arrivals').getFullList(),
    ]);

    const salesResult = { items: salesItems };
    const purchaseResult = { items: purchaseItems };
    const saleInvoicesResult = { items: saleInvoiceItems };
    const purchaseInvoicesResult = { items: purchaseInvoiceItems };
    const saleReceiptsResult = { items: saleReceiptItems };
    const purchasePaymentsResult = { items: purchasePaymentItems };
    const purchaseArrivalsResult = { items: purchaseArrivalItems };

    const salesContracts = salesResult.items as unknown as ComparisonSalesContract[];
    const purchaseContracts = purchaseResult.items as unknown as ComparisonPurchaseContract[];
    const businessDeals = businessDealItems as BusinessDeal[];
    const saleInvoices = saleInvoicesResult.items as unknown as SaleInvoiceItem[];
    const purchaseInvoices = purchaseInvoicesResult.items as unknown as PurchaseInvoiceItem[];
    const saleReceipts = saleReceiptsResult.items as unknown as SaleReceipt[];
    const purchasePayments = purchasePaymentsResult.items as unknown as PurchasePayment[];
    const purchaseArrivals = purchaseArrivalsResult.items as unknown as PurchaseArrivalItem[];
    const relationIndex = buildContractRelationIndex(salesContracts, purchaseContracts, businessDeals);

    const saleInvoiceMap = new Map<string, { no: string; issueDate: string }>();
    const saleReceiptsMap = new Map<string, string>();
    const purchaseInvoiceMap = new Map<string, string>();
    const unverifiedPurchaseInvoiceMap = summarizeUnverifiedPurchaseInvoices(purchaseInvoices);
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

    // 计算每个销售合同的待确认节点数量
    const pendingCountMap = new Map<string, number>();
    
    // 销售子信息中的待确认
    (saleInvoicesResult.items as unknown as { sales_contract: string; manager_confirmed: string }[]).forEach(inv => {
      if (invoiceNeedsManagerAction(inv, false)) {
        pendingCountMap.set(inv.sales_contract, (pendingCountMap.get(inv.sales_contract) || 0) + 1);
      }
    });
    (saleReceiptsResult.items as unknown as { sales_contract: string; manager_confirmed: string }[]).forEach(receipt => {
      if (receipt.manager_confirmed === 'pending') {
        pendingCountMap.set(receipt.sales_contract, (pendingCountMap.get(receipt.sales_contract) || 0) + 1);
      }
    });
    
    // 采购子信息中的待确认（需要关联到销售合同）
    const addPurchasePending = (purchaseId: string) => {
      (relationIndex.salesIdsByPurchase.get(purchaseId) || []).forEach((salesId) => {
        pendingCountMap.set(salesId, (pendingCountMap.get(salesId) || 0) + 1);
      });
    };

    (purchaseArrivalsResult.items as unknown as { purchase_contract: string; manager_confirmed: string }[]).forEach(arrival => {
      if (arrival.manager_confirmed === 'pending') {
        addPurchasePending(arrival.purchase_contract);
      }
    });
    (purchaseInvoicesResult.items as unknown as { purchase_contract: string; manager_confirmed: string; is_verified?: string }[]).forEach(inv => {
      if (invoiceNeedsManagerAction(inv, true)) {
        addPurchasePending(inv.purchase_contract);
      }
    });
    (purchasePaymentsResult.items as unknown as { purchase_contract: string; manager_confirmed: string }[]).forEach(payment => {
      if (payment.manager_confirmed === 'pending') {
        addPurchasePending(payment.purchase_contract);
      }
    });

    const overviewSalesContracts: OverviewContract[] = salesContracts.map(sc => {
      const purchaseIds = relationIndex.purchaseIdsBySales.get(sc.id) || [];
      const associatedPurchases = purchaseIds
        .map((purchaseId) => purchaseContracts.find((contract) => contract.id === purchaseId))
        .filter((contract): contract is ComparisonPurchaseContract => Boolean(contract));
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
        isCrossBorder: sc.is_cross_border,
        paymentDate: saleReceiptsMap.get(sc.id) || undefined,
        invoiceNo: saleInvoiceMap.get(sc.id)?.no || undefined,
        invoiceIssueDate: saleInvoiceMap.get(sc.id)?.issueDate || undefined,
        signDate: sc.sign_date || '',
        created: sc.created_at || sc.created || '',
        status: sc.status,
        invoiceProgress: contractProgress(sc.invoiced_amount, sc.total_amount),
        settlementProgress: contractProgress(sc.receipted_amount, sc.total_amount),
        executionProgress: sc.execution_percent ?? 0,
        customerName: sc.expand?.customer?.name || sc.customer_name || '-',
        associatedPurchaseIds: purchaseIds,
        purchaseSummary: purchaseIds.length > 0 ? {
          purchaseIds,
          purchaseNos,
          shipmentDates: allShipmentDates,
          paymentDates: allPaymentDates,
        } : undefined,
        pendingCount: pendingCountMap.get(sc.id) || 0,
        outstandingAmount: Math.max(
          0,
          Number.isFinite(Number(sc.debt_amount))
            ? Number(sc.debt_amount)
            : (Number(sc.executed_quantity) || 0) * (Number(sc.unit_price) || 0) - (Number(sc.receipted_amount) || 0),
        ),
        businessDealId: relationIndex.dealIdBySales.get(sc.id),
        businessDealDate: relationIndex.dealsById.get(relationIndex.dealIdBySales.get(sc.id) || '')?.deal_date,
      };
    });

    const overviewPurchaseContracts: OverviewContract[] = purchaseContracts.map(pc => {
      const unverifiedInvoices = unverifiedPurchaseInvoiceMap.get(pc.id);
      return {
        id: pc.id,
        type: 'purchase' as const,
        no: pc.no,
        productName: pc.product_name,
        quantity: pc.total_quantity,
        totalAmount: pc.total_amount,
        isCrossBorder: pc.is_cross_border,
        paymentDate: purchasePaymentsMap.get(pc.id) || undefined,
        shipmentDate: purchaseArrivalsMap.get(pc.id) || undefined,
        signDate: pc.sign_date || '',
        created: pc.created_at || pc.created || '',
        status: pc.status,
        invoiceProgress: contractProgress(pc.invoiced_amount, pc.total_amount),
        settlementProgress: contractProgress(pc.paid_amount, pc.total_amount),
        executionProgress: pc.execution_percent ?? 0,
        supplierName: pc.expand?.supplier?.name || pc.supplier_name || '-',
        associatedSalesIds: relationIndex.salesIdsByPurchase.get(pc.id) || [],
        unverifiedInvoiceCount: unverifiedInvoices?.count || 0,
        unverifiedInvoiceAmount: unverifiedInvoices?.amount || 0,
        businessDealId: relationIndex.dealIdByPurchase.get(pc.id),
        businessDealDate: relationIndex.dealsById.get(relationIndex.dealIdByPurchase.get(pc.id) || '')?.deal_date,
      };
    });

    const associatedPurchaseIds = new Set(
      relationIndex.edges.map((edge) => edge.purchaseId)
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
        isCrossBorder: pc.is_cross_border,
        paymentDate: purchasePaymentsMap.get(pc.id) || undefined,
        shipmentDate: purchaseArrivalsMap.get(pc.id) || undefined,
        signDate: pc.sign_date || '',
        created: pc.created_at || pc.created || '',
        status: pc.status,
        invoiceProgress: contractProgress(pc.invoiced_amount, pc.total_amount),
        settlementProgress: contractProgress(pc.paid_amount, pc.total_amount),
        supplierName: pc.expand?.supplier?.name || pc.supplier_name || '-',
        associatedSalesIds: [],
      }));

    return {
      salesContracts: overviewSalesContracts,
      purchaseContracts: overviewPurchaseContracts,
      standalonePurchaseContracts,
      businessDeals,
    };
  },

  linkPurchaseToSales: async (purchaseContractId: string, salesContractId: string) => {
    return pb.send<{ success: boolean }>('/api/erp/contracts/link', {
      method: 'POST',
      body: { purchaseId: purchaseContractId, salesId: salesContractId },
    });
  },

  getContractDetail: async (salesContractId: string): Promise<ContractDetailData> => {
    return getOverallContractDetail('sales', salesContractId);
  },

  getPurchaseContractDetail: async (purchaseContractId: string): Promise<ContractDetailData> => {
    return getOverallContractDetail('purchase', purchaseContractId);
  },

  getUncompletedContracts: async (): Promise<FlowContractOption[]> => {
    const [salesItems, allPurchaseContracts, businessDeals] = await Promise.all([
      pb.collection('sales_contracts').getFullList<ComparisonSalesContract>({
        sort: '-created_at',
        expand: 'customer',
      }),
      pb.collection('purchase_contracts').getFullList<ComparisonPurchaseContract>({
        sort: '-created_at',
      }),
      pb.collection('business_deals').getFullList<BusinessDeal>(),
    ]);
    const salesResult = { items: salesItems };
    const salesIds = salesItems.map((sc) => sc.id);
    const relationIndex = buildContractRelationIndex(salesItems, allPurchaseContracts, businessDeals);
    const relatedPurchaseIds = new Set(relationIndex.edges.map((edge) => edge.purchaseId));
    const purchaseItems = allPurchaseContracts.filter((contract) => relatedPurchaseIds.has(contract.id));
    const purchaseIds = purchaseItems.map((contract) => contract.id);

    // 分批 OR 查询：PocketBase filter 超过 89 个 OR 条件会返回 400
    const [saleInvoiceItems, saleReceiptItems, purchaseArrivalItems, purchaseInvoiceItems, purchasePaymentItems] = await Promise.all([
      fetchAllByFieldBatches<{ sales_contract?: string; manager_confirmed?: string; updated?: string }>(salesIds, 'sales_contract', async (filter) => {
        return pb.collection('sale_invoices').getFullList({ filter });
      }),
      fetchAllByFieldBatches<{ sales_contract?: string; manager_confirmed?: string; updated?: string }>(salesIds, 'sales_contract', async (filter) => {
        return pb.collection('sale_receipts').getFullList({ filter });
      }),
      getPurchaseRecords<{ purchase_contract?: string; manager_confirmed?: string; updated?: string }>('purchase_arrivals', purchaseIds),
      getPurchaseRecords<{ purchase_contract?: string; manager_confirmed?: string; is_verified?: string; updated?: string }>('purchase_invoices', purchaseIds),
      getPurchaseRecords<{ purchase_contract?: string; manager_confirmed?: string; updated?: string }>('purchase_payments', purchaseIds),
    ]);

    const saleInvoices = { items: saleInvoiceItems };
    const saleReceipts = { items: saleReceiptItems };
    const purchaseArrivals = { items: purchaseArrivalItems };
    const purchaseInvoices = { items: purchaseInvoiceItems };
    const purchasePayments = { items: purchasePaymentItems };

    const getRelatedPcIds = (scId: string): string[] =>
      relationIndex.purchaseIdsBySales.get(scId) || [];

    const countPending = (scId: string): number => {
      let count = 0;
      const relatedPcIds = getRelatedPcIds(scId);
      const countSales = (list: { sales_contract?: string; manager_confirmed?: string }[]) => {
        list.forEach((r) => { if (r.sales_contract === scId && r.manager_confirmed === 'pending') count++; });
      };
      const countPurchase = (list: { purchase_contract?: string; manager_confirmed?: string }[]) => {
        list.forEach((r) => { if (relatedPcIds.includes(r.purchase_contract || '') && r.manager_confirmed === 'pending') count++; });
      };
      (saleInvoices.items as unknown as { sales_contract: string; manager_confirmed: string }[])
        .forEach((invoice) => { if (invoice.sales_contract === scId && invoiceNeedsManagerAction(invoice, false)) count++; });
      countSales(saleReceipts.items as unknown as { sales_contract: string; manager_confirmed: string }[]);
      countPurchase(purchaseArrivals.items as unknown as { purchase_contract: string; manager_confirmed: string }[]);
      (purchaseInvoices.items as unknown as { purchase_contract: string; manager_confirmed: string; is_verified?: string }[])
        .forEach((invoice) => { if (relatedPcIds.includes(invoice.purchase_contract) && invoiceNeedsManagerAction(invoice, true)) count++; });
      countPurchase(purchasePayments.items as unknown as { purchase_contract: string; manager_confirmed: string }[]);
      return count;
    };

    const hasPending = (scId: string): boolean => countPending(scId) > 0;

    const allPurchaseCompleted = (scId: string): boolean => {
      const relatedIds = relationIndex.purchaseIdsBySales.get(scId) || [];
      const related = purchaseItems.filter((contract) => relatedIds.includes(contract.id));
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

    const standalonePurchases = {
      items: allPurchaseContracts.filter((contract) => (
        (relationIndex.salesIdsByPurchase.get(contract.id) || []).length === 0
      )),
    };

    // 查询独立采购合同的子记录，用于判断 completed 合同是否仍有待确认项
    const standaloneIds = (standalonePurchases.items as unknown as { id: string }[]).map((pc) => pc.id);
    const [standaloneArrivalItems, standaloneInvoiceItems, standalonePaymentItems] = await Promise.all([
      fetchAllByFieldBatches<Record<string, unknown>>(standaloneIds, 'purchase_contract', async (filter) => {
        return pb.collection('purchase_arrivals').getFullList({ filter });
      }),
      fetchAllByFieldBatches<Record<string, unknown>>(standaloneIds, 'purchase_contract', async (filter) => {
        return pb.collection('purchase_invoices').getFullList({ filter });
      }),
      fetchAllByFieldBatches<Record<string, unknown>>(standaloneIds, 'purchase_contract', async (filter) => {
        return pb.collection('purchase_payments').getFullList({ filter });
      }),
    ]);

    const standaloneArrivals = { items: standaloneArrivalItems };
    const standaloneInvoices = { items: standaloneInvoiceItems };
    const standalonePayments = { items: standalonePaymentItems };

    const countStandalonePending = (pcId: string): number => {
      let count = 0;
      (standaloneArrivals.items as unknown as { purchase_contract?: string; manager_confirmed?: string }[])
        .forEach((r) => { if (r.purchase_contract === pcId && r.manager_confirmed === 'pending') count++; });
      (standaloneInvoices.items as unknown as { purchase_contract?: string; manager_confirmed?: string; is_verified?: string }[])
        .forEach((invoice) => { if (invoice.purchase_contract === pcId && invoiceNeedsManagerAction(invoice, true)) count++; });
      (standalonePayments.items as unknown as { purchase_contract?: string; manager_confirmed?: string }[])
        .forEach((r) => { if (r.purchase_contract === pcId && r.manager_confirmed === 'pending') count++; });
      return count;
    };

    const purchaseOptions = (standalonePurchases.items as unknown as { id: string; no: string; product_name: string; total_quantity: number; sign_date?: string; status?: string; created_at?: string }[])
      .filter((pc) => {
        if (pc.status !== 'completed') return true;
        // 已完成的独立采购合同若仍有待确认的到货/收票/付款，仍需显示以便管理确认
        return countStandalonePending(pc.id) > 0;
      })
      .map((pc) => ({
        id: pc.id,
        no: pc.no,
        productName: pc.product_name,
        quantity: pc.total_quantity,
        signDate: pc.sign_date || '',
        type: 'purchase' as const,
        status: pc.status || 'executing',
        created: pc.created_at || '',
        pendingCount: countStandalonePending(pc.id),
      }));

    return [...salesOptions, ...purchaseOptions]
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  },
};
