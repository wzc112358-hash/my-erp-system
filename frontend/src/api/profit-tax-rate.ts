import { pb } from '@/lib/pocketbase';

export interface ProfitTaxRateRecord {
  id: string;
  rate: number;
  effective_from: string;
  created_by?: string;
  created?: string;
}

export const ProfitTaxRateAPI = {
  list: () => pb.collection('profit_tax_rates').getFullList<ProfitTaxRateRecord>({
    sort: '-effective_from',
  }),

  create: (rate: number, effectiveFrom: string) => pb.send<{ success: boolean }>(
    '/api/erp/profit-tax-rates',
    {
      method: 'POST',
      body: { rate, effectiveFrom },
    },
  ),
};
