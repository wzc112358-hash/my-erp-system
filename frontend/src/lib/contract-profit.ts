export const PROFIT_TAX_RATE = 0.1881;

export interface ContractProfitInput {
  salesAmount: number;
  salesPriceExcludingTax: boolean;
  purchaseAmount: number;
  freight: number;
  miscellaneous: number;
  tariff: number;
  valueAddedTax: number;
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
}: ContractProfitInput): ContractProfitResult => {
  const salesAmountIncTax = salesPriceExcludingTax ? salesAmount * 1.13 : salesAmount;
  const salesAmountExTax = salesPriceExcludingTax ? salesAmount : salesAmount / 1.13;
  const purchaseAmountExTax = purchaseAmount / 1.13;
  const operatingProfit = salesAmountExTax
    - purchaseAmountExTax
    - freight
    - miscellaneous
    - tariff
    - valueAddedTax;
  const taxAmount = (salesAmountIncTax - purchaseAmount) * PROFIT_TAX_RATE;
  const netProfit = salesAmountIncTax
    - purchaseAmount
    - taxAmount
    - freight
    - miscellaneous
    - tariff
    - valueAddedTax;

  return {
    salesAmountIncTax,
    salesAmountExTax,
    purchaseAmountIncTax: purchaseAmount,
    purchaseAmountExTax,
    operatingProfit,
    taxAmount,
    netProfit,
  };
};
