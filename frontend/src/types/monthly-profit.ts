export interface MonthlyProfitContract {
  id: string;
  primarySalesId: string;
  no: string;
  signDate: string;
  customerName: string;
  productName: string;
  purchaseContractCount: number;
  salesContractCount: number;
  taxRate: number;
  salesAmountIncTax: number;
  purchaseAmountIncTax: number;
  freight: number;
  miscellaneous: number;
  tariff: number;
  valueAddedTax: number;
  operatingProfit: number;
  taxAmount: number;
  netProfit: number;
}

export interface MonthlyProfitRow {
  month: number;
  monthKey: string;
  label: string;
  contractCount: number;
  salesAmountIncTax: number;
  purchaseAmountIncTax: number;
  expenses: number;
  operatingProfit: number;
  taxAmount: number;
  netProfit: number;
  contracts: MonthlyProfitContract[];
}

export interface MonthlyProfitOverview {
  year: number;
  exchangeRate: number;
  unlinkedSalesCount: number;
  months: MonthlyProfitRow[];
  totals: {
    contractCount: number;
    salesAmountIncTax: number;
    purchaseAmountIncTax: number;
    expenses: number;
    operatingProfit: number;
    taxAmount: number;
    netProfit: number;
  };
}
