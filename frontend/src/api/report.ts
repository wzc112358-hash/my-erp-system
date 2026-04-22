import { pb } from '@/lib/pocketbase';
import { getUsdToCnyRate } from '@/lib/exchange-rate';
import type { ReportData, ReportParams, ReportSummary } from '@/types/report';

interface SalesContractData {
  id: string;
  no: string;
  product_name: string;
  customer: string;
  total_quantity: number;
  unit_price: number;
  total_amount: number;
  is_price_excluding_tax: boolean;
  is_cross_border: boolean;
  sign_date: string;
  status: string;
  expand?: {
    customer?: {
      name: string;
    };
  };
}

interface PurchaseContractData {
  id: string;
  no: string;
  product_name: string;
  supplier: string;
  sales_contract: string;
  total_quantity: number;
  unit_price: number;
  total_amount: number;
  is_cross_border: boolean;
  sign_date: string;
  status: string;
  expand?: {
    supplier?: {
      name: string;
    };
    sales_contract?: {
      id: string;
      no: string;
      customer: string;
      sign_date: string;
      expand?: {
        customer?: {
          name: string;
        };
      };
    };
  };
}

interface PurchaseArrivalData {
  purchase_contract: string;
  freight_1: number;
  freight_2?: number;
  miscellaneous_expenses: number;
}

interface SalesShipmentData {
  sales_contract: string;
  date: string;
}

interface PurchasePaymentData {
  purchase_contract: string;
  pay_date: string;
}

interface PurchaseInvoiceData {
  purchase_contract: string;
  receive_date: string;
}

interface SaleReceiptData {
  sales_contract: string;
  receive_date: string;
}

interface SaleInvoiceData {
  sales_contract: string;
  issue_date: string;
}

function getMonthFromDate(dateStr: string): number {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  return date.getMonth() + 1;
}

function getYearFromDate(dateStr: string): number {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  return date.getFullYear();
}

export const ReportAPI = {
  getReportData: async (params: ReportParams): Promise<{ data: ReportData[]; summary: ReportSummary }> => {
    const { startMonth, endMonth, year } = params;
    const rate = await getUsdToCnyRate();

    const [salesContractsResult, purchaseContractsResult] = await Promise.all([
      pb.collection('sales_contracts').getList<SalesContractData>(1, 500, {
        filter: 'status = "completed"',
        expand: 'customer',
      }),
      pb.collection('purchase_contracts').getList<PurchaseContractData>(1, 500, {
        filter: 'status = "completed"',
        expand: 'supplier,sales_contract.customer',
      }),
    ]);

    const salesContracts = salesContractsResult.items;
    const purchaseContracts = purchaseContractsResult.items;

    const purchaseContractIds = purchaseContracts.map((pc) => pc.id);
    const salesContractIds = salesContracts.map((sc) => sc.id);

    const [purchaseArrivalsResult, salesShipmentsResult, purchasePaymentsResult, purchaseInvoicesResult, saleReceiptsResult, saleInvoicesResult] = await Promise.all([
      pb.collection('purchase_arrivals').getList<PurchaseArrivalData>(1, 1000, {
        filter: purchaseContractIds.length > 0 
          ? purchaseContractIds.map((id) => `purchase_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('sales_shipments').getList<SalesShipmentData>(1, 1000, {
        filter: salesContractIds.length > 0
          ? salesContractIds.map((id) => `sales_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('purchase_payments').getList<PurchasePaymentData>(1, 1000, {
        filter: purchaseContractIds.length > 0
          ? purchaseContractIds.map((id) => `purchase_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('purchase_invoices').getList<PurchaseInvoiceData>(1, 1000, {
        filter: purchaseContractIds.length > 0
          ? purchaseContractIds.map((id) => `purchase_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('sale_receipts').getList<SaleReceiptData>(1, 1000, {
        filter: salesContractIds.length > 0
          ? salesContractIds.map((id) => `sales_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('sale_invoices').getList<SaleInvoiceData>(1, 1000, {
        filter: salesContractIds.length > 0
          ? salesContractIds.map((id) => `sales_contract="${id}"`).join(' || ')
          : '1=0',
      }),
    ]);

    const purchaseArrivalsMap = new Map<string, PurchaseArrivalData[]>();
    purchaseArrivalsResult.items.forEach((arrival) => {
      const existing = purchaseArrivalsMap.get(arrival.purchase_contract) || [];
      existing.push(arrival);
      purchaseArrivalsMap.set(arrival.purchase_contract, existing);
    });

    const salesShipmentsMap = new Map<string, string>();
    salesShipmentsResult.items.forEach((shipment) => {
      if (shipment.date) {
        salesShipmentsMap.set(shipment.sales_contract, shipment.date);
      }
    });

    const purchasePaymentDateMap = new Map<string, string>();
    purchasePaymentsResult.items.forEach((p) => {
      if (!p.pay_date) return;
      const existing = purchasePaymentDateMap.get(p.purchase_contract);
      if (!existing || p.pay_date > existing) {
        purchasePaymentDateMap.set(p.purchase_contract, p.pay_date);
      }
    });

    const purchaseInvoiceDateMap = new Map<string, string>();
    purchaseInvoicesResult.items.forEach((inv) => {
      if (!inv.receive_date) return;
      const existing = purchaseInvoiceDateMap.get(inv.purchase_contract);
      if (!existing || inv.receive_date > existing) {
        purchaseInvoiceDateMap.set(inv.purchase_contract, inv.receive_date);
      }
    });

    const salesReceiptDateMap = new Map<string, string>();
    saleReceiptsResult.items.forEach((r) => {
      if (!r.receive_date) return;
      const existing = salesReceiptDateMap.get(r.sales_contract);
      if (!existing || r.receive_date > existing) {
        salesReceiptDateMap.set(r.sales_contract, r.receive_date);
      }
    });

    const salesInvoiceDateMap = new Map<string, string>();
    saleInvoicesResult.items.forEach((inv) => {
      if (!inv.issue_date) return;
      const existing = salesInvoiceDateMap.get(inv.sales_contract);
      if (!existing || inv.issue_date > existing) {
        salesInvoiceDateMap.set(inv.sales_contract, inv.issue_date);
      }
    });

    const reportData: ReportData[] = [];
    const salesContractMap = new Map<string, SalesContractData>();
    const salesContractRows = new Map<string, number>();
    
    salesContracts.forEach((sc) => {
      const month = getMonthFromDate(sc.sign_date);
      const contractYear = getYearFromDate(sc.sign_date);
      if (contractYear === year && month >= startMonth && month <= endMonth) {
        salesContractMap.set(sc.id, sc);
      }
    });

    purchaseContracts.forEach((pc) => {
      const arrivals = purchaseArrivalsMap.get(pc.id) || [];
      const freight = arrivals.reduce((sum, a) => sum + (a.freight_1 || 0) + (a.freight_2 || 0), 0);
      const miscellaneous = arrivals.reduce((sum, a) => sum + (a.miscellaneous_expenses || 0), 0);

      let salesContract: SalesContractData | undefined;
      let customerName = '';
      let salesSignDate = '';
      let salesQuantity = 0;
      let salesUnitPrice = 0;
      let salesTotalAmount = 0;

      if (pc.expand?.sales_contract) {
        salesContract = salesContractMap.get(pc.expand.sales_contract.id);
        if (salesContract) {
          customerName = salesContract.expand?.customer?.name || '';
          salesSignDate = salesContract.sign_date;
          salesQuantity = salesContract.total_quantity;
          salesUnitPrice = salesContract.unit_price;
          const salesAmountCny = salesContract.is_cross_border ? salesContract.total_amount * rate : salesContract.total_amount;
          salesTotalAmount = salesContract.is_price_excluding_tax ? salesAmountCny : salesAmountCny / 1.13;

          const existingCount = salesContractRows.get(pc.expand.sales_contract.id) || 0;
          salesContractRows.set(pc.expand.sales_contract.id, existingCount + 1);
        }
      }

      const supplierName = pc.expand?.supplier?.name || '';
      const purchaseAmountCny = pc.is_cross_border ? pc.total_amount * rate : pc.total_amount;
      const purchaseTaxTotalAmount = purchaseAmountCny;
      const purchaseTotalAmount = purchaseAmountCny / 1.13;
      const arrivalDate = salesShipmentsMap.get(pc.expand?.sales_contract?.id || '') || '';

      if (!salesContract) {
        return;
      }

      reportData.push({
        purchaseContractNo: pc.no,
        purchaseSignDate: pc.sign_date,
        productName: pc.product_name,
        supplierName,
        purchaseQuantity: pc.total_quantity,
        purchaseUnitPrice: pc.unit_price,
        purchaseTotalAmount,
        purchaseTaxTotalAmount,
        purchasePaymentDate: purchasePaymentDateMap.get(pc.id) || '',
        purchaseInvoiceDate: purchaseInvoiceDateMap.get(pc.id) || '',
        salesContractNo: salesContract.no,
        salesSignDate,
        customerName,
        salesQuantity,
        salesUnitPrice,
        salesTotalAmount,
        salesTaxTotalAmount: 0,
        freight,
        miscellaneous,
        arrivalDate,
        salesReceiptDate: salesReceiptDateMap.get(pc.expand?.sales_contract?.id || '') || '',
        salesInvoiceDate: salesInvoiceDateMap.get(pc.expand?.sales_contract?.id || '') || '',
        tax: 0,
        profit: 0,
        netProfit: 0,
        salesRowSpan: 0,
        purchaseRowSpan: 1,
        isSalesRow: false,
      });
    });

    const salesContractRowCounts = new Map<string, number>();
    const salesContractPurchaseTotal = new Map<string, number>();
    const salesContractFreightTotal = new Map<string, number>();
    const salesContractMiscTotal = new Map<string, number>();
    const salesContractTaxTotal = new Map<string, number>();
    
    reportData.forEach((row) => {
      if (row.salesContractNo) {
        const count = salesContractRowCounts.get(row.salesContractNo) || 0;
        salesContractRowCounts.set(row.salesContractNo, count + 1);
        
        const purchaseTotal = salesContractPurchaseTotal.get(row.salesContractNo) || 0;
        salesContractPurchaseTotal.set(row.salesContractNo, purchaseTotal + row.purchaseTotalAmount);
        
        const freightTotal = salesContractFreightTotal.get(row.salesContractNo) || 0;
        salesContractFreightTotal.set(row.salesContractNo, freightTotal + row.freight);
        
        const miscTotal = salesContractMiscTotal.get(row.salesContractNo) || 0;
        salesContractMiscTotal.set(row.salesContractNo, miscTotal + row.miscellaneous);

        if (count === 0) {
          for (const sc of salesContracts) {
            if (sc.no === row.salesContractNo) {
              const scAmountCny = sc.is_cross_border ? sc.total_amount * rate : sc.total_amount;
              salesContractTaxTotal.set(row.salesContractNo, sc.is_price_excluding_tax ? scAmountCny * 1.13 : scAmountCny);
              break;
            }
          }
        }
      }
    });

    let currentSalesNo = '';
    
    reportData.forEach((row) => {
      const salesRowCount = salesContractRowCounts.get(row.salesContractNo) || 1;
      
      if (row.salesContractNo !== currentSalesNo) {
        currentSalesNo = row.salesContractNo;
        row.salesRowSpan = salesRowCount;
        const purchaseTotal = salesContractPurchaseTotal.get(row.salesContractNo) || 0;
        const freightTotal = salesContractFreightTotal.get(row.salesContractNo) || 0;
        const miscTotal = salesContractMiscTotal.get(row.salesContractNo) || 0;
        const salesTaxTotal = salesContractTaxTotal.get(row.salesContractNo) || 0;
        const purchaseTaxTotal = salesContractPurchaseTotal.get(row.salesContractNo) ? (purchaseTotal * 1.13) : 0;
        
        row.salesTaxTotalAmount = salesTaxTotal;
        row.tax = (salesTaxTotal - purchaseTaxTotal) * 0.1881;
        row.profit = salesTaxTotal / 1.13 - purchaseTotal - freightTotal - miscTotal;
        row.netProfit = salesTaxTotal / 1.13 - purchaseTotal - row.tax - miscTotal - freightTotal;
      } else {
        row.salesRowSpan = 0;
        row.salesTaxTotalAmount = 0;
        row.profit = 0;
        row.tax = 0;
        row.netProfit = 0;
      }
    });

    salesContracts.forEach((sc) => {
      const month = getMonthFromDate(sc.sign_date);
      const contractYear = getYearFromDate(sc.sign_date);
      if (contractYear !== year || month < startMonth || month > endMonth) {
        return;
      }

      const relatedPurchases = purchaseContracts.filter(
        (pc) => pc.expand?.sales_contract?.id === sc.id
      );

      if (relatedPurchases.length > 0) {
        return;
      }

      const arrivals = purchaseArrivalsMap.get(sc.id) || [];
      const freight = arrivals.reduce((sum, a) => sum + (a.freight_1 || 0) + (a.freight_2 || 0), 0);
      const miscellaneous = arrivals.reduce((sum, a) => sum + (a.miscellaneous_expenses || 0), 0);

      const scAmountCny = sc.is_cross_border ? sc.total_amount * rate : sc.total_amount;
      const salesExTax = sc.is_price_excluding_tax ? scAmountCny : scAmountCny / 1.13;
      const salesIncTax = sc.is_price_excluding_tax ? scAmountCny * 1.13 : scAmountCny;

      reportData.push({
        purchaseContractNo: '',
        purchaseSignDate: '',
        productName: sc.product_name,
        supplierName: '',
        purchaseQuantity: 0,
        purchaseUnitPrice: 0,
        purchaseTotalAmount: 0,
        purchaseTaxTotalAmount: 0,
        purchasePaymentDate: '',
        purchaseInvoiceDate: '',
        salesContractNo: sc.no,
        salesSignDate: sc.sign_date,
        customerName: sc.expand?.customer?.name || '',
        salesQuantity: sc.total_quantity,
        salesUnitPrice: sc.unit_price,
        salesTotalAmount: salesExTax,
        salesTaxTotalAmount: salesIncTax,
        freight,
        miscellaneous,
        arrivalDate: salesShipmentsMap.get(sc.id) || '',
        salesReceiptDate: salesReceiptDateMap.get(sc.id) || '',
        salesInvoiceDate: salesInvoiceDateMap.get(sc.id) || '',
        tax: salesIncTax * 0.1881,
        profit: salesExTax - freight - miscellaneous,
        netProfit: salesExTax - salesIncTax * 0.1881 - freight - miscellaneous,
        salesRowSpan: 1,
        purchaseRowSpan: 1,
        isSalesRow: true,
      });
    });

    const summary: ReportSummary = {
      totalSalesAmount: 0,
      totalPurchaseAmount: 0,
      totalSalesTaxAmount: 0,
      totalPurchaseTaxAmount: 0,
      totalTax: 0,
      totalFreight: 0,
      totalMiscellaneous: 0,
      totalProfit: 0,
      totalNetProfit: 0,
    };

    const processedSalesContracts = new Set<string>();
    const processedPurchaseContracts = new Set<string>();

    reportData.forEach((row) => {
      if (row.purchaseContractNo && !processedPurchaseContracts.has(row.purchaseContractNo)) {
        summary.totalPurchaseAmount += row.purchaseTotalAmount;
        summary.totalPurchaseTaxAmount += row.purchaseTaxTotalAmount;
        summary.totalFreight += row.freight;
        summary.totalMiscellaneous += row.miscellaneous;
        processedPurchaseContracts.add(row.purchaseContractNo);
      }

      if (row.salesContractNo && !processedSalesContracts.has(row.salesContractNo)) {
        summary.totalSalesAmount += row.salesTotalAmount;
        summary.totalSalesTaxAmount += row.salesTaxTotalAmount;
        processedSalesContracts.add(row.salesContractNo);
      }

      summary.totalProfit += row.profit;
      summary.totalNetProfit += row.netProfit;
    });

    summary.totalTax = (summary.totalSalesTaxAmount - summary.totalPurchaseTaxAmount) * 0.1881;

    return { data: reportData, summary };
  },

  getReportByContractIds: async (
    salesIds: string[],
    purchaseIds: string[]
  ): Promise<{ data: ReportData[]; summary: ReportSummary }> => {
    const rate = await getUsdToCnyRate();
    const allIds = [...salesIds, ...purchaseIds];
    if (allIds.length === 0) {
      return { data: [], summary: { totalSalesAmount: 0, totalPurchaseAmount: 0, totalSalesTaxAmount: 0, totalPurchaseTaxAmount: 0, totalTax: 0, totalFreight: 0, totalMiscellaneous: 0, totalProfit: 0, totalNetProfit: 0 } };
    }

    const filterParts: string[] = [];
    if (salesIds.length > 0) {
      filterParts.push(salesIds.map((id) => `id="${id}"`).join(' || '));
    }
    if (purchaseIds.length > 0) {
      const purchaseAsSalesFilter = purchaseIds.map((id) => `sales_contract="${id}"`).join(' || ');
      filterParts.push(purchaseAsSalesFilter);
    }

    const [salesContractsResult, purchaseContractsResult] = await Promise.all([
      pb.collection('sales_contracts').getList<SalesContractData>(1, 500, {
        filter: salesIds.length > 0 ? salesIds.map((id) => `id="${id}"`).join(' || ') : '1=0',
        expand: 'customer',
      }),
      pb.collection('purchase_contracts').getList<PurchaseContractData>(1, 500, {
        filter: purchaseIds.length > 0
          ? purchaseIds.map((id) => `id="${id}"`).join(' || ')
          : '1=0',
        expand: 'supplier,sales_contract.customer',
      }),
    ]);

    const salesContracts = salesContractsResult.items;
    const purchaseContracts = purchaseContractsResult.items;

    const linkedSalesIds = new Set(salesIds);
    purchaseContracts.forEach((pc) => {
      if (pc.sales_contract) {
        linkedSalesIds.add(pc.sales_contract);
      }
    });

    if (linkedSalesIds.size > 0) {
      const additionalSales = await pb.collection('sales_contracts').getList<SalesContractData>(1, 500, {
        filter: Array.from(linkedSalesIds).map((id) => `id="${id}"`).join(' || '),
        expand: 'customer',
      });
      additionalSales.items.forEach((sc) => {
        if (!salesContracts.find((existing) => existing.id === sc.id)) {
          salesContracts.push(sc);
        }
      });
    }

    if (salesIds.length > 0) {
      const linkedPurchases = await pb.collection('purchase_contracts').getList<PurchaseContractData>(1, 500, {
        filter: salesIds.map((id) => `sales_contract="${id}"`).join(' || '),
        expand: 'supplier,sales_contract.customer',
      });
      linkedPurchases.items.forEach((pc) => {
        if (!purchaseContracts.find((existing) => existing.id === pc.id)) {
          purchaseContracts.push(pc);
        }
      });
    }

    const allPurchaseIds = purchaseContracts.map((pc) => pc.id);
    const allSalesIds = salesContracts.map((sc) => sc.id);

    const [purchaseArrivalsResult, salesShipmentsResult, purchasePaymentsResult, purchaseInvoicesResult, saleReceiptsResult, saleInvoicesResult] = await Promise.all([
      pb.collection('purchase_arrivals').getList<PurchaseArrivalData>(1, 1000, {
        filter: allPurchaseIds.length > 0
          ? allPurchaseIds.map((id) => `purchase_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('sales_shipments').getList<SalesShipmentData>(1, 1000, {
        filter: allSalesIds.length > 0
          ? allSalesIds.map((id) => `sales_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('purchase_payments').getList<PurchasePaymentData>(1, 1000, {
        filter: allPurchaseIds.length > 0
          ? allPurchaseIds.map((id) => `purchase_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('purchase_invoices').getList<PurchaseInvoiceData>(1, 1000, {
        filter: allPurchaseIds.length > 0
          ? allPurchaseIds.map((id) => `purchase_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('sale_receipts').getList<SaleReceiptData>(1, 1000, {
        filter: allSalesIds.length > 0
          ? allSalesIds.map((id) => `sales_contract="${id}"`).join(' || ')
          : '1=0',
      }),
      pb.collection('sale_invoices').getList<SaleInvoiceData>(1, 1000, {
        filter: allSalesIds.length > 0
          ? allSalesIds.map((id) => `sales_contract="${id}"`).join(' || ')
          : '1=0',
      }),
    ]);

    const purchaseArrivalsMap = new Map<string, PurchaseArrivalData[]>();
    purchaseArrivalsResult.items.forEach((arrival) => {
      const existing = purchaseArrivalsMap.get(arrival.purchase_contract) || [];
      existing.push(arrival);
      purchaseArrivalsMap.set(arrival.purchase_contract, existing);
    });

    const salesShipmentsMap = new Map<string, string>();
    salesShipmentsResult.items.forEach((shipment) => {
      if (shipment.date) {
        salesShipmentsMap.set(shipment.sales_contract, shipment.date);
      }
    });

    const purchasePaymentDateMap = new Map<string, string>();
    purchasePaymentsResult.items.forEach((p) => {
      if (!p.pay_date) return;
      const existing = purchasePaymentDateMap.get(p.purchase_contract);
      if (!existing || p.pay_date > existing) {
        purchasePaymentDateMap.set(p.purchase_contract, p.pay_date);
      }
    });

    const purchaseInvoiceDateMap = new Map<string, string>();
    purchaseInvoicesResult.items.forEach((inv) => {
      if (!inv.receive_date) return;
      const existing = purchaseInvoiceDateMap.get(inv.purchase_contract);
      if (!existing || inv.receive_date > existing) {
        purchaseInvoiceDateMap.set(inv.purchase_contract, inv.receive_date);
      }
    });

    const salesReceiptDateMap = new Map<string, string>();
    saleReceiptsResult.items.forEach((r) => {
      if (!r.receive_date) return;
      const existing = salesReceiptDateMap.get(r.sales_contract);
      if (!existing || r.receive_date > existing) {
        salesReceiptDateMap.set(r.sales_contract, r.receive_date);
      }
    });

    const salesInvoiceDateMap = new Map<string, string>();
    saleInvoicesResult.items.forEach((inv) => {
      if (!inv.issue_date) return;
      const existing = salesInvoiceDateMap.get(inv.sales_contract);
      if (!existing || inv.issue_date > existing) {
        salesInvoiceDateMap.set(inv.sales_contract, inv.issue_date);
      }
    });

    const reportData: ReportData[] = [];
    const salesContractMap = new Map<string, SalesContractData>();
    const salesContractRows = new Map<string, number>();

    salesContracts.forEach((sc) => {
      salesContractMap.set(sc.id, sc);
    });

    purchaseContracts.forEach((pc) => {
      const arrivals = purchaseArrivalsMap.get(pc.id) || [];
      const freight = arrivals.reduce((sum, a) => sum + (a.freight_1 || 0) + (a.freight_2 || 0), 0);
      const miscellaneous = arrivals.reduce((sum, a) => sum + (a.miscellaneous_expenses || 0), 0);

      let salesContract: SalesContractData | undefined;
      let customerName = '';
      let salesSignDate = '';
      let salesQuantity = 0;
      let salesUnitPrice = 0;
      let salesTotalAmount = 0;

      if (pc.expand?.sales_contract) {
        salesContract = salesContractMap.get(pc.expand.sales_contract.id);
        if (salesContract) {
          customerName = salesContract.expand?.customer?.name || '';
          salesSignDate = salesContract.sign_date;
          salesQuantity = salesContract.total_quantity;
          salesUnitPrice = salesContract.unit_price;
          const salesAmountCny = salesContract.is_cross_border ? salesContract.total_amount * rate : salesContract.total_amount;
          salesTotalAmount = salesContract.is_price_excluding_tax ? salesAmountCny : salesAmountCny / 1.13;

          const existingCount = salesContractRows.get(pc.expand.sales_contract.id) || 0;
          salesContractRows.set(pc.expand.sales_contract.id, existingCount + 1);
        }
      }

      const supplierName = pc.expand?.supplier?.name || '';
      const purchaseAmountCny = pc.is_cross_border ? pc.total_amount * rate : pc.total_amount;
      const purchaseTaxTotalAmount = purchaseAmountCny;
      const purchaseTotalAmount = purchaseAmountCny / 1.13;
      const arrivalDate = salesShipmentsMap.get(pc.expand?.sales_contract?.id || '') || '';

      if (!salesContract) {
        return;
      }

      reportData.push({
        purchaseContractNo: pc.no,
        purchaseSignDate: pc.sign_date,
        productName: pc.product_name,
        supplierName,
        purchaseQuantity: pc.total_quantity,
        purchaseUnitPrice: pc.unit_price,
        purchaseTotalAmount,
        purchaseTaxTotalAmount,
        purchasePaymentDate: purchasePaymentDateMap.get(pc.id) || '',
        purchaseInvoiceDate: purchaseInvoiceDateMap.get(pc.id) || '',
        salesContractNo: salesContract.no,
        salesSignDate,
        customerName,
        salesQuantity,
        salesUnitPrice,
        salesTotalAmount,
        salesTaxTotalAmount: 0,
        freight,
        miscellaneous,
        arrivalDate,
        salesReceiptDate: salesReceiptDateMap.get(pc.expand?.sales_contract?.id || '') || '',
        salesInvoiceDate: salesInvoiceDateMap.get(pc.expand?.sales_contract?.id || '') || '',
        tax: 0,
        profit: 0,
        netProfit: 0,
        salesRowSpan: 0,
        purchaseRowSpan: 1,
        isSalesRow: false,
      });
    });

    const salesContractRowCounts = new Map<string, number>();
    const salesContractPurchaseTotal = new Map<string, number>();
    const salesContractFreightTotal = new Map<string, number>();
    const salesContractMiscTotal = new Map<string, number>();
    const salesContractTaxTotal = new Map<string, number>();

    reportData.forEach((row) => {
      if (row.salesContractNo) {
        const count = salesContractRowCounts.get(row.salesContractNo) || 0;
        salesContractRowCounts.set(row.salesContractNo, count + 1);

        const purchaseTotal = salesContractPurchaseTotal.get(row.salesContractNo) || 0;
        salesContractPurchaseTotal.set(row.salesContractNo, purchaseTotal + row.purchaseTotalAmount);

        const freightTotal = salesContractFreightTotal.get(row.salesContractNo) || 0;
        salesContractFreightTotal.set(row.salesContractNo, freightTotal + row.freight);

        const miscTotal = salesContractMiscTotal.get(row.salesContractNo) || 0;
        salesContractMiscTotal.set(row.salesContractNo, miscTotal + row.miscellaneous);

        if (count === 0) {
          for (const sc of salesContracts) {
            if (sc.no === row.salesContractNo) {
              const scAmountCny = sc.is_cross_border ? sc.total_amount * rate : sc.total_amount;
              salesContractTaxTotal.set(row.salesContractNo, sc.is_price_excluding_tax ? scAmountCny * 1.13 : scAmountCny);
              break;
            }
          }
        }
      }
    });

    let currentSalesNo = '';

    reportData.forEach((row) => {
      const salesRowCount = salesContractRowCounts.get(row.salesContractNo) || 1;

      if (row.salesContractNo !== currentSalesNo) {
        currentSalesNo = row.salesContractNo;
        row.salesRowSpan = salesRowCount;
        const purchaseTotal = salesContractPurchaseTotal.get(row.salesContractNo) || 0;
        const freightTotal = salesContractFreightTotal.get(row.salesContractNo) || 0;
        const miscTotal = salesContractMiscTotal.get(row.salesContractNo) || 0;
        const salesTaxTotal = salesContractTaxTotal.get(row.salesContractNo) || 0;
        const purchaseTaxTotal = salesContractPurchaseTotal.get(row.salesContractNo) ? (purchaseTotal * 1.13) : 0;

        row.salesTaxTotalAmount = salesTaxTotal;
        row.tax = (salesTaxTotal - purchaseTaxTotal) * 0.1881;
        row.profit = salesTaxTotal / 1.13 - purchaseTotal - freightTotal - miscTotal;
        row.netProfit = salesTaxTotal / 1.13 - purchaseTotal - row.tax - miscTotal - freightTotal;
      } else {
        row.salesRowSpan = 0;
        row.salesTaxTotalAmount = 0;
        row.profit = 0;
        row.tax = 0;
        row.netProfit = 0;
      }
    });

    salesContracts.forEach((sc) => {
      const relatedPurchases = purchaseContracts.filter(
        (pc) => pc.expand?.sales_contract?.id === sc.id || pc.sales_contract === sc.id
      );

      if (relatedPurchases.length > 0) {
        return;
      }

      const arrivals = purchaseArrivalsMap.get(sc.id) || [];
      const freight = arrivals.reduce((sum, a) => sum + (a.freight_1 || 0) + (a.freight_2 || 0), 0);
      const miscellaneous = arrivals.reduce((sum, a) => sum + (a.miscellaneous_expenses || 0), 0);

      const scAmountCny = sc.is_cross_border ? sc.total_amount * rate : sc.total_amount;
      const salesExTax = sc.is_price_excluding_tax ? scAmountCny : scAmountCny / 1.13;
      const salesIncTax = sc.is_price_excluding_tax ? scAmountCny * 1.13 : scAmountCny;

      reportData.push({
        purchaseContractNo: '',
        purchaseSignDate: '',
        productName: sc.product_name,
        supplierName: '',
        purchaseQuantity: 0,
        purchaseUnitPrice: 0,
        purchaseTotalAmount: 0,
        purchaseTaxTotalAmount: 0,
        purchasePaymentDate: '',
        purchaseInvoiceDate: '',
        salesContractNo: sc.no,
        salesSignDate: sc.sign_date,
        customerName: sc.expand?.customer?.name || '',
        salesQuantity: sc.total_quantity,
        salesUnitPrice: sc.unit_price,
        salesTotalAmount: salesExTax,
        salesTaxTotalAmount: salesIncTax,
        freight,
        miscellaneous,
        arrivalDate: salesShipmentsMap.get(sc.id) || '',
        salesReceiptDate: salesReceiptDateMap.get(sc.id) || '',
        salesInvoiceDate: salesInvoiceDateMap.get(sc.id) || '',
        tax: salesIncTax * 0.1881,
        profit: salesExTax - freight - miscellaneous,
        netProfit: salesExTax - salesIncTax * 0.1881 - freight - miscellaneous,
        salesRowSpan: 1,
        purchaseRowSpan: 1,
        isSalesRow: true,
      });
    });

    const summary: ReportSummary = {
      totalSalesAmount: 0,
      totalPurchaseAmount: 0,
      totalSalesTaxAmount: 0,
      totalPurchaseTaxAmount: 0,
      totalTax: 0,
      totalFreight: 0,
      totalMiscellaneous: 0,
      totalProfit: 0,
      totalNetProfit: 0,
    };

    const processedSalesContracts = new Set<string>();
    const processedPurchaseContracts = new Set<string>();

    reportData.forEach((row) => {
      if (row.purchaseContractNo && !processedPurchaseContracts.has(row.purchaseContractNo)) {
        summary.totalPurchaseAmount += row.purchaseTotalAmount;
        summary.totalPurchaseTaxAmount += row.purchaseTaxTotalAmount;
        summary.totalFreight += row.freight;
        summary.totalMiscellaneous += row.miscellaneous;
        processedPurchaseContracts.add(row.purchaseContractNo);
      }

      if (row.salesContractNo && !processedSalesContracts.has(row.salesContractNo)) {
        summary.totalSalesAmount += row.salesTotalAmount;
        summary.totalSalesTaxAmount += row.salesTaxTotalAmount;
        processedSalesContracts.add(row.salesContractNo);
      }

      summary.totalProfit += row.profit;
      summary.totalNetProfit += row.netProfit;
    });

    summary.totalTax = (summary.totalSalesTaxAmount - summary.totalPurchaseTaxAmount) * 0.1881;

    return { data: reportData, summary };
  },
};
