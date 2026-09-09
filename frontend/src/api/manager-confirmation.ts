import { pb } from '@/lib/pocketbase';

export type ManagerConfirmableCollection =
  | 'sale_invoices'
  | 'sale_receipts'
  | 'purchase_arrivals'
  | 'purchase_invoices'
  | 'purchase_payments';

export type ManagerConfirmationDecision = 'approved' | 'rejected';

export interface ManagerConfirmationResult {
  collection: ManagerConfirmableCollection;
  recordId: string;
  status: ManagerConfirmationDecision;
  changed: boolean;
}

export const ManagerConfirmationAPI = {
  submit: (
    collection: ManagerConfirmableCollection,
    recordId: string,
    decision: ManagerConfirmationDecision,
  ) => pb.send<ManagerConfirmationResult>('/api/erp/manager-confirmations', {
    method: 'POST',
    body: { collection, recordId, decision },
  }),
};
