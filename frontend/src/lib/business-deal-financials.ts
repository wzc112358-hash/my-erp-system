import {
  calculateBusinessDealProfit,
  DEFAULT_PROFIT_TAX_RATE,
  type ContractProfitResult,
} from './contract-profit.ts';

export interface FinancialSalesContract {
  id: string;
  total_quantity: number;
  unit_price: number;
  total_amount: number;
  is_price_excluding_tax: boolean;
  is_cross_border: boolean;
  executed_quantity?: number;
}

export interface FinancialPurchaseContract {
  id: string;
  total_quantity: number;
  total_amount: number;
  is_cross_border: boolean;
}

export interface FinancialSalesShipment {
  sales_contract?: string;
  quantity: number;
}

export interface FinancialPurchaseArrival {
  purchase_contract: string;
  quantity: number;
  freight_1?: number;
  freight_1_currency?: 'USD' | 'CNY';
  freight_2?: number;
  freight_2_currency?: 'USD' | 'CNY';
  miscellaneous_expenses?: number;
  miscellaneous_expenses_currency?: 'USD' | 'CNY';
  tariff?: number;
  value_added_tax?: number;
}

export interface FinancialPurchasePayment {
  purchase_contract?: string;
  amount: number;
}

export interface BusinessDealFinancialInput {
  salesContracts: FinancialSalesContract[];
  purchaseContracts: FinancialPurchaseContract[];
  salesShipments?: FinancialSalesShipment[];
  purchaseArrivals?: FinancialPurchaseArrival[];
  purchasePayments?: FinancialPurchasePayment[];
  exchangeRate: number;
  taxRate?: number;
}

export interface BusinessDealCosts {
  freight: number;
  miscellaneous: number;
  tariff: number;
  valueAddedTax: number;
}

export interface BusinessDealFinancials {
  profit: ContractProfitResult;
  realizedProfit: ContractProfitResult;
  costs: BusinessDealCosts;
  salesQuantity: number;
  purchaseQuantity: number;
  realizedSalesQuantity: number;
  realizedPurchaseQuantity: number;
  salesReceivableAmount: number;
  purchasePaidAmount: number;
  quantityMatched: boolean;
  unitProfit: number;
}

const numeric = (value: number | undefined) => Number(value) || 0;

const amountInCny = (amount: number | undefined, isCrossBorder: boolean, rate: number) => (
  numeric(amount) * (isCrossBorder ? rate : 1)
);

const sumArrivalCosts = (
  arrivals: FinancialPurchaseArrival[],
  rate: number,
): BusinessDealCosts => arrivals.reduce((totals, arrival) => {
  totals.freight += numeric(arrival.freight_1) * (arrival.freight_1_currency === 'USD' ? rate : 1)
    + numeric(arrival.freight_2) * (arrival.freight_2_currency === 'USD' ? rate : 1);
  totals.miscellaneous += numeric(arrival.miscellaneous_expenses)
    * (arrival.miscellaneous_expenses_currency === 'USD' ? rate : 1);
  totals.tariff += numeric(arrival.tariff);
  totals.valueAddedTax += numeric(arrival.value_added_tax);
  return totals;
}, { freight: 0, miscellaneous: 0, tariff: 0, valueAddedTax: 0 });

const salesAmounts = (
  contracts: FinancialSalesContract[],
  rate: number,
  amountOf: (contract: FinancialSalesContract) => number,
) => contracts.reduce((totals, contract) => {
  const amount = amountOf(contract) * (contract.is_cross_border ? rate : 1);
  totals.incTax += contract.is_price_excluding_tax ? amount * 1.13 : amount;
  totals.exTax += contract.is_price_excluding_tax ? amount : amount / 1.13;
  return totals;
}, { incTax: 0, exTax: 0 });

/**
 * 一笔业务交易的唯一财务计算入口。
 *
 * 金额先统一折算为 CNY；一对一、一对多和多对一都先按合同分别计算，
 * 再在交易层汇总，不在销售/采购合同之间做人为利润分摊。
 */
export const calculateBusinessDealFinancials = ({
  salesContracts,
  purchaseContracts,
  salesShipments = [],
  purchaseArrivals = [],
  purchasePayments = [],
  exchangeRate,
  taxRate = DEFAULT_PROFIT_TAX_RATE,
}: BusinessDealFinancialInput): BusinessDealFinancials => {
  const rate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  const costs = sumArrivalCosts(purchaseArrivals, rate);
  const fullSales = salesAmounts(salesContracts, rate, (contract) => numeric(contract.total_amount));
  const fullPurchaseAmount = purchaseContracts.reduce((sum, contract) => (
    sum + amountInCny(contract.total_amount, contract.is_cross_border, rate)
  ), 0);
  const profit = calculateBusinessDealProfit({
    salesAmountIncTax: fullSales.incTax,
    salesAmountExTax: fullSales.exTax,
    purchaseAmountIncTax: fullPurchaseAmount,
    ...costs,
    taxRate,
  });

  const realizedSales = salesAmounts(salesContracts, rate, (contract) => {
    const quantity = salesShipments
      .filter((shipment) => shipment.sales_contract === contract.id
        || (salesContracts.length === 1 && !shipment.sales_contract))
      .reduce((sum, shipment) => sum + numeric(shipment.quantity), 0);
    return numeric(contract.unit_price) * quantity;
  });
  const realizedPurchaseAmount = purchaseContracts.reduce((sum, contract) => {
    const arrivedQuantity = purchaseArrivals
      .filter((arrival) => arrival.purchase_contract === contract.id)
      .reduce((quantity, arrival) => quantity + numeric(arrival.quantity), 0);
    const ratio = numeric(contract.total_quantity) > 0
      ? arrivedQuantity / numeric(contract.total_quantity)
      : 0;
    return sum + amountInCny(contract.total_amount, contract.is_cross_border, rate) * ratio;
  }, 0);
  const realizedProfit = calculateBusinessDealProfit({
    salesAmountIncTax: realizedSales.incTax,
    salesAmountExTax: realizedSales.exTax,
    purchaseAmountIncTax: realizedPurchaseAmount,
    ...costs,
    taxRate,
  });

  const salesQuantity = salesContracts.reduce((sum, contract) => sum + numeric(contract.total_quantity), 0);
  const purchaseQuantity = purchaseContracts.reduce((sum, contract) => sum + numeric(contract.total_quantity), 0);
  const realizedSalesQuantity = salesShipments.reduce((sum, shipment) => sum + numeric(shipment.quantity), 0);
  const realizedPurchaseQuantity = purchaseArrivals.reduce((sum, arrival) => sum + numeric(arrival.quantity), 0);
  const salesReceivableAmount = salesContracts.reduce((sum, contract) => (
    sum + amountInCny(
      numeric(contract.executed_quantity) * numeric(contract.unit_price),
      contract.is_cross_border,
      rate,
    )
  ), 0);
  const purchaseByID = new Map(purchaseContracts.map((contract) => [contract.id, contract]));
  const purchasePaidAmount = purchasePayments.reduce((sum, payment) => {
    const contract = payment.purchase_contract
      ? purchaseByID.get(payment.purchase_contract)
      : (purchaseContracts.length === 1 ? purchaseContracts[0] : undefined);
    return sum + amountInCny(payment.amount, Boolean(contract?.is_cross_border), rate);
  }, 0);

  return {
    profit,
    realizedProfit,
    costs,
    salesQuantity,
    purchaseQuantity,
    realizedSalesQuantity,
    realizedPurchaseQuantity,
    salesReceivableAmount,
    purchasePaidAmount,
    quantityMatched: Math.abs(salesQuantity - purchaseQuantity) < 0.01,
    unitProfit: salesQuantity > 0 ? (profit.salesAmountIncTax - profit.purchaseAmountIncTax) / salesQuantity : 0,
  };
};
