export const DEFAULT_PROFIT_TAX_RATE = 0.1881;
/** @deprecated Use DEFAULT_PROFIT_TAX_RATE or a business deal tax-rate snapshot. */
export const PROFIT_TAX_RATE = DEFAULT_PROFIT_TAX_RATE;

export interface ContractProfitInput {
  salesAmount: number;
  salesPriceExcludingTax: boolean;
  purchaseAmount: number;
  freight: number;
  miscellaneous: number;
  tariff: number;
  valueAddedTax: number;
  taxRate?: number;
}

export interface BusinessDealProfitInput {
  salesAmountIncTax: number;
  salesAmountExTax: number;
  purchaseAmountIncTax: number;
  freight: number;
  miscellaneous: number;
  tariff: number;
  valueAddedTax: number;
  taxRate?: number;
}

export interface ContractProfitResult {
  salesAmountIncTax: number;
  salesAmountExTax: number;
  purchaseAmountIncTax: number;
  purchaseAmountExTax: number;
  operatingProfit: number;
  taxAmount: number;
  netProfit: number;
}

/**
 * 关联合同详情当前使用的利润口径。
 * 调用方应先把所有金额换算成同一币种。
 */
export const calculateContractProfit = ({
  salesAmount,
  salesPriceExcludingTax,
  purchaseAmount,
  freight,
  miscellaneous,
  tariff,
  valueAddedTax,
  taxRate,
}: ContractProfitInput): ContractProfitResult => {
  const salesAmountIncTax = salesPriceExcludingTax ? salesAmount * 1.13 : salesAmount;
  const salesAmountExTax = salesPriceExcludingTax ? salesAmount : salesAmount / 1.13;
  return calculateBusinessDealProfit({
    salesAmountIncTax,
    salesAmountExTax,
    purchaseAmountIncTax: purchaseAmount,
    freight,
    miscellaneous,
    tariff,
    valueAddedTax,
    taxRate,
  });
};

export const calculateBusinessDealProfit = ({
  salesAmountIncTax,
  salesAmountExTax,
  purchaseAmountIncTax,
  freight,
  miscellaneous,
  tariff,
  valueAddedTax,
  taxRate = DEFAULT_PROFIT_TAX_RATE,
}: BusinessDealProfitInput): ContractProfitResult => {
  const safeTaxRate = Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 1
    ? taxRate
    : DEFAULT_PROFIT_TAX_RATE;
  const purchaseAmountExTax = purchaseAmountIncTax / 1.13;
  const operatingProfit = salesAmountExTax
    - purchaseAmountExTax
    - freight
    - miscellaneous
    - tariff
    - valueAddedTax;
  const taxAmount = (salesAmountIncTax - purchaseAmountIncTax) * safeTaxRate;
  const netProfit = salesAmountIncTax
    - purchaseAmountIncTax
    - taxAmount
    - freight
    - miscellaneous
    - tariff
    - valueAddedTax;

  return {
    salesAmountIncTax,
    salesAmountExTax,
    purchaseAmountIncTax,
    purchaseAmountExTax,
    operatingProfit,
    taxAmount,
    netProfit,
  };
};
